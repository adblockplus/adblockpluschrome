/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

const {RegExpFilter, WhitelistFilter, ElemHideFilter} = require("filterClasses");
const {SpecialSubscription} = require("subscriptionClasses");
const {FilterStorage} = require("filterStorage");
const {defaultMatcher} = require("matcher");
const {FilterNotifier} = require("filterNotifier");
const {extractHostFromFrame} = require("url");
const {port} = require("messaging");

const nonRequestTypes = ["DOCUMENT", "ELEMHIDE", "GENERICBLOCK", "GENERICHIDE"];

// Mapping of inspected tabs to their devpanel page
// and recorded items. We can't use a PageMap here,
// because data must persist after navigation/reload.
let panels = Object.create(null);

function hasPanels()
{
  return Object.keys(panels).length > 0;
}

function getActivePanel(page)
{
  let panel = panels[page.id];
  if(panel && !panel.reload && !panel.reloading)
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
    userDefined: userDefined,
    subscription: subscriptionTitle
  };
}

function hasRecord(panel, request, filter)
{
  return panel.records.some(record =>
    record.request.url       == request.url       &&
    record.request.docDomain == request.docDomain &&

    // Ignore partial (e.g. ELEMHIDE) whitelisting if there is already
    // a DOCUMENT exception which disables all means of blocking.
    (record.request.type == "DOCUMENT" ? nonRequestTypes.indexOf(request.type) != -1
                                       : record.request.type == request.type) &&

    // Matched element hiding filters don't relate to a particular request,
    // so we also have to match the CSS selector in order to distinguish them.
    (record.filter && record.filter.selector) == (filter && filter.selector)
  );
}

function addRecord(panel, request, filter)
{
  if (!hasRecord(panel, request, filter))
  {
    panel.port.postMessage({
      type: "add-record",
      request: request,
      filter: getFilterInfo(filter)
    });

    panel.records.push({
      request: request,
      filter: filter
    });
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
 * @param {Page}     page          The page the request occured on
 * @param {string}   url           The URL of the request
 * @param {string}   type          The request type
 * @param {string}   docDomain     The IDN-decoded hostname of the document
 * @param {boolean}  thirdParty    Whether the origin of the request and document differs
 * @param {?string}  sitekey       The active sitekey if there is any
 * @param {?boolean} specificOnly  Whether generic filters should be ignored
 * @param {?BlockingFilter} filter The matched filter or null if there is no match
 */
exports.logRequest = function(page, url, type, docDomain,
                              thirdParty, sitekey,
                              specificOnly, filter)
{
  let panel = getActivePanel(page);
  if (panel)
  {
    let request = {
      url: url,
      type: type,
      docDomain: docDomain,
      thirdParty: thirdParty,
      sitekey: sitekey,
      specificOnly: specificOnly
    };

    addRecord(panel, request, filter);
  }
};

/**
 * Logs active element hiding filters to the devtools panel.
 *
 * @param {Page}     page       The page the elements were hidden on
 * @param {string[]} selectors  The CSS selectors of active elemhide filters
 * @param {string}   docDomain  The IDN-decoded hostname of the document
 */
function logHiddenElements(page, selectors, docDomain)
{
  let panel = getActivePanel(page);
  {
    for (let subscription of FilterStorage.subscriptions)
    {
      if (subscription.disabled)
        continue;

      for (let filter of subscription.filters)
      {
        if (!(filter instanceof ElemHideFilter))
          continue;
        if (selectors.indexOf(filter.selector) == -1)
          continue;
        if (!filter.isActiveOnDomain(docDomain))
          continue;

        addRecord(panel, {type: "ELEMHIDE", docDomain: docDomain}, filter);
      }
    }
  }
};

/**
 * Logs a whitelisting filter, that disables (some kind of)
 * blocking for a particular document, to the devtools panel.
 *
 * @param {Page}         page      The page the whitelisting is active on
 * @param {string}       url       The url of the whitelisted document
 * @param {number}       typeMask  The bit mask of whitelisting types checked for
 * @param {string}       docDomain The IDN-decoded hostname of the parent document
 * @param {WhitelistFilter} filter The matched whitelisting filter
 */
exports.logWhitelistedDocument = function(page, url, typeMask, docDomain, filter)
{
  let panel = getActivePanel(page);
  if (panel)
  {
    for (let type of nonRequestTypes)
    {
      if (typeMask & filter.contentType & RegExpFilter.typeMap[type])
        addRecord(panel, {url: url, type: type, docDomain: docDomain}, filter);
    }
  }
};

/**
 * Checks whether a page is inspected by the devtools panel.
 *
 * @param {Page} page
 * @return {boolean}
 */
exports.hasPanel = function(page)
{
  return page.id in panels;
};

function onBeforeRequest(details)
{
  let panel = panels[details.tabId];

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
  let panel = panels[tabId];

  // Reloading the tab is the only way that allows bypassing all caches, in
  // order to see all requests in the devtools panel. Reloading must not be
  // performed before the tab changes to "loading", otherwise it will load the
  // previous URL.
  if (panel && panel.reload)
  {
    chrome.tabs.reload(tabId, {bypassCache: true});

    panel.reload = false;
    panel.reloading = true;
  }
}

function updateFilters(filters, added)
{
  for (let tabId in panels)
  {
    let panel = panels[tabId];

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
        if (nonRequestTypes.indexOf(record.request.type) != -1)
          continue;

        let filter = matchRequest(record.request);
        if (filters.indexOf(filter) == -1)
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
        if (filters.indexOf(record.filter) == -1)
          continue;

        if (nonRequestTypes.indexOf(record.request.type) != -1)
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

chrome.runtime.onConnect.addListener(port =>
{
  let match = port.name.match(/^devtools-(\d+)$/);
  if (!match)
    return;

  let inspectedTabId = parseInt(match[1], 10);
  let localOnBeforeRequest = onBeforeRequest.bind();

  chrome.webRequest.onBeforeRequest.addListener(
    localOnBeforeRequest,
    {
      urls:  ["<all_urls>"],
      types: ["main_frame"],
      tabId: inspectedTabId
    }
  );

  if (!hasPanels())
  {
    ext.pages.onLoading.addListener(onLoading);
    FilterNotifier.on("filter.added", onFilterAdded);
    FilterNotifier.on("filter.removed", onFilterRemoved);
    FilterNotifier.on("subscription.added", onSubscriptionAdded);
  }

  port.onDisconnect.addListener(() =>
  {
    delete panels[inspectedTabId];
    chrome.webRequest.onBeforeRequest.removeListener(localOnBeforeRequest);

    if (!hasPanels())
    {
      ext.pages.onLoading.removeListener(onLoading);
      FilterNotifier.off("filter.added", onFilterAdded);
      FilterNotifier.off("filter.removed", onFilterRemoved);
      FilterNotifier.off("subscription.added", onSubscriptionAdded);
    }
  });

  panels[inspectedTabId] = {port: port, records: []};
});

port.on("devtools.traceElemHide", (message, sender) =>
{
  logHiddenElements(
    sender.page, message.selectors,
    extractHostFromFrame(sender.frame)
  );
});
