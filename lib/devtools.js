/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

const {RegExpFilter,
       WhitelistFilter,
       ElemHideFilter} = require("../adblockpluscore/lib/filterClasses");
const {SpecialSubscription} =
  require("../adblockpluscore/lib/subscriptionClasses");
const {FilterStorage} = require("../adblockpluscore/lib/filterStorage");
const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {FilterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {extractHostFromFrame} = require("./url");
const {port} = require("./messaging");

const nonRequestTypes = ["DOCUMENT", "ELEMHIDE",
                         "GENERICBLOCK", "GENERICHIDE", "CSP"];

let panels = new Map();

function isActivePanel(panel)
{
  return panel && !panel.reload && !panel.reloading;
}

function getActivePanel(tabId)
{
  let panel = panels.get(tabId);
  if (isActivePanel(panel))
    return panel;
  return null;
}

function getFilterInfo(filter)
{
  if (!filter)
    return null;

  let userDefined = false;
  let subscriptionTitle = null;

  for (let subscription of filter.subscriptions)
  {
    if (!subscription.disabled)
    {
      if (subscription instanceof SpecialSubscription)
        userDefined = true;
      else
        subscriptionTitle = subscription.title;
    }
  }

  return {
    text: filter.text,
    whitelisted: filter instanceof WhitelistFilter,
    userDefined,
    subscription: subscriptionTitle
  };
}

function hasRecord(panel, request, filter)
{
  return panel.records.some(record =>
    record.request.url == request.url &&
    record.request.docDomain == request.docDomain &&

    // Ignore partial (e.g. ELEMHIDE) whitelisting if there is already
    // a DOCUMENT exception which disables all means of blocking.
    (record.request.type == "DOCUMENT" ?
       nonRequestTypes.includes(request.type) :
       record.request.type == request.type) &&

    // Matched element hiding filters don't relate to a particular request,
    // so we have to compare the selector in order to avoid duplicates.
    (record.filter && record.filter.selector) == (filter && filter.selector)
  );
}

function addRecord(panel, request, filter)
{
  if (!hasRecord(panel, request, filter))
  {
    panel.port.postMessage({
      type: "add-record",
      request,
      filter: getFilterInfo(filter)
    });

    panel.records.push({request, filter});
  }
}

function matchRequest(request)
{
  return defaultMatcher.matchesAny(
    request.url,
    RegExpFilter.typeMap[request.type],
    request.docDomain,
    request.thirdParty,
    request.sitekey,
    request.specificOnly
  );
}

/**
 * Logs a request to the devtools panel.
 *
 * @param {number[]} tabIds        The tabIds associated with the request
 * @param {string}   url           The URL of the request
 * @param {string}   type          The request type
 * @param {string}   docDomain     The IDN-decoded hostname of the document
 * @param {boolean}  thirdParty    Whether the origin of the request and
 *                                 document differs
 * @param {?string}  sitekey       The active sitekey if there is any
 * @param {?boolean} specificOnly  Whether generic filters should be ignored
 * @param {?BlockingFilter} filter The matched filter or null if there is no
 *                                 match
 */
exports.logRequest = function(tabIds, url, type, docDomain,
                              thirdParty, sitekey,
                              specificOnly, filter)
{
  for (let tabId of tabIds)
  {
    let panel = getActivePanel(tabId);
    if (panel)
    {
      let request = {url, type, docDomain, thirdParty, sitekey, specificOnly};
      addRecord(panel, request, filter);
    }
  }
};

/**
 * Logs active element hiding filters to the devtools panel.
 *
 * @param {number}   tabId      The ID of the tab, the elements were hidden in
 * @param {string[]} selectors  The selectors of applied ElemHideFilters
 * @param {string[]} filters    The text of applied ElemHideEmulationFilters
 * @param {string}   docDomain  The IDN-decoded hostname of the document
 */
function logHiddenElements(tabId, selectors, filters, docDomain)
{
  let panel = getActivePanel(tabId);
  if (panel)
  {
    for (let subscription of FilterStorage.subscriptions)
    {
      if (subscription.disabled)
        continue;

      for (let filter of subscription.filters)
      {
        // We only know the exact filter in case of element hiding emulation.
        // For regular element hiding filters, the content script only knows
        // the selector, so we have to find a filter that has an identical
        // selector and is active on the domain the match was reported from.
        let isActiveElemHideFilter = filter instanceof ElemHideFilter &&
                                     selectors.includes(filter.selector) &&
                                     filter.isActiveOnDomain(docDomain);

        if (isActiveElemHideFilter || filters.includes(filter.text))
          addRecord(panel, {type: "ELEMHIDE", docDomain}, filter);
      }
    }
  }
}

/**
 * Logs a whitelisting filter, that disables (some kind of)
 * blocking for a particular document, to the devtools panel.
 *
 * @param {number}       tabId     The tabId the whitelisting is active for
 * @param {string}       url       The url of the whitelisted document
 * @param {number}       typeMask  The bit mask of whitelisting types checked
 *                                 for
 * @param {string}       docDomain The IDN-decoded hostname of the parent
 *                                 document
 * @param {WhitelistFilter} filter The matched whitelisting filter
 */
exports.logWhitelistedDocument = function(tabId, url, typeMask, docDomain,
                                          filter)
{
  let panel = getActivePanel(tabId);
  if (panel)
  {
    for (let type of nonRequestTypes)
    {
      if (typeMask & filter.contentType & RegExpFilter.typeMap[type])
        addRecord(panel, {url, type, docDomain}, filter);
    }
  }
};

/**
 * Checks whether a tab is inspected by the devtools panel.
 *
 * @param {number} tabId
 * @return {boolean}
 */
exports.hasPanel = function(tabId)
{
  return panels.has(tabId);
};

function onBeforeRequest(details)
{
  let panel = panels.get(details.tabId);

  // Clear the devtools panel and reload the inspected tab without caching
  // when a new request is issued. However, make sure that we don't end up
  // in an infinite recursion if we already triggered a reload.
  if (panel.reloading)
  {
    panel.reloading = false;
  }
  else
  {
    panel.records = [];
    panel.port.postMessage({type: "reset"});

    // We can't repeat the request if it isn't a GET request. Chrome would
    // prompt the user to confirm reloading the page, and POST requests are
    // known to cause issues on many websites if repeated.
    if (details.method == "GET")
      panel.reload = true;
  }
}

function onLoading(page)
{
  let tabId = page.id;
  let panel = panels.get(tabId);

  // Reloading the tab is the only way that allows bypassing all caches, in
  // order to see all requests in the devtools panel. Reloading must not be
  // performed before the tab changes to "loading", otherwise it will load the
  // previous URL.
  if (panel && panel.reload)
  {
    browser.tabs.reload(tabId, {bypassCache: true});

    panel.reload = false;
    panel.reloading = true;
  }
}

function updateFilters(filters, added)
{
  for (let panel of panels.values())
  {
    for (let i = 0; i < panel.records.length; i++)
    {
      let record = panel.records[i];

      // If an added filter matches a request shown in the devtools panel,
      // update that record to show the new filter. Ignore filters that aren't
      // associated with any sub-resource request. There is no record for these
      // if they don't already match. In particular, in case of element hiding
      // filters, we also wouldn't know if any new element matches.
      if (added)
      {
        if (nonRequestTypes.includes(record.request.type))
          continue;

        let filter = matchRequest(record.request);
        if (!filters.includes(filter))
          continue;

        record.filter = filter;
      }

      // If a filter shown in the devtools panel got removed, update that
      // record to show the filter that matches now, or none, instead.
      // For filters that aren't associated with any sub-resource request,
      // just remove the record. We wouldn't know whether another filter
      // matches instead until the page is reloaded.
      else
      {
        if (!filters.includes(record.filter))
          continue;

        if (nonRequestTypes.includes(record.request.type))
        {
          panel.port.postMessage({
            type: "remove-record",
            index: i
          });
          panel.records.splice(i--, 1);
          continue;
        }

        record.filter = matchRequest(record.request);
      }

      panel.port.postMessage({
        type: "update-record",
        index: i,
        request: record.request,
        filter: getFilterInfo(record.filter)
      });
    }
  }
}

function onFilterAdded(filter)
{
  updateFilters([filter], true);
}

function onFilterRemoved(filter)
{
  updateFilters([filter], false);
}

function onSubscriptionAdded(subscription)
{
  if (subscription instanceof SpecialSubscription)
    updateFilters(subscription.filters, true);
}

browser.runtime.onConnect.addListener(newPort =>
{
  let match = newPort.name.match(/^devtools-(\d+)$/);
  if (!match)
    return;

  let inspectedTabId = parseInt(match[1], 10);
  let localOnBeforeRequest = onBeforeRequest.bind();

  browser.webRequest.onBeforeRequest.addListener(
    localOnBeforeRequest,
    {
      urls: ["http://*/*", "https://*/*"],
      types: ["main_frame"],
      tabId: inspectedTabId
    }
  );

  if (panels.size == 0)
  {
    ext.pages.onLoading.addListener(onLoading);
    FilterNotifier.on("filter.added", onFilterAdded);
    FilterNotifier.on("filter.removed", onFilterRemoved);
    FilterNotifier.on("subscription.added", onSubscriptionAdded);
  }

  newPort.onDisconnect.addListener(() =>
  {
    panels.delete(inspectedTabId);
    browser.webRequest.onBeforeRequest.removeListener(localOnBeforeRequest);

    if (panels.size == 0)
    {
      ext.pages.onLoading.removeListener(onLoading);
      FilterNotifier.off("filter.added", onFilterAdded);
      FilterNotifier.off("filter.removed", onFilterRemoved);
      FilterNotifier.off("subscription.added", onSubscriptionAdded);
    }
  });

  panels.set(inspectedTabId, {port: newPort, records: []});
});

port.on("devtools.traceElemHide", (message, sender) =>
{
  logHiddenElements(
    sender.page.id, message.selectors, message.filters,
    extractHostFromFrame(sender.frame)
  );
});
