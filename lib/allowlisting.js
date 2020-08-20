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

/** @module allowlisting */

"use strict";

const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {Filter} = require("../adblockpluscore/lib/filterClasses");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {filterState} = require("../adblockpluscore/lib/filterState");
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {extractHostFromFrame} = require("./url");
const {port} = require("./messaging");
const {logAllowlistedDocument} = require("./hitLogger");
const {verifySignature} = require("../adblockpluscore/lib/rsa");

let sitekeys = new ext.PageMap();
let allowlistedDomainRegexp =
    exports.allowlistedDomainRegexp = /^@@\|\|([^/:]+)\^\$document$/;

function match(page, url, typeMask, docDomain, sitekey)
{
  let filter = defaultMatcher.match(url, typeMask, docDomain, sitekey);

  if (filter && page)
    logAllowlistedDocument(page.id, url.href, typeMask, docDomain, filter);

  return filter;
}

function* frameDetails(page, frame, originUrl, typeMask)
{
  if (frame || originUrl)
  {
    while (frame)
    {
      let parentFrame = frame.parent;

      yield [frame.url, typeMask,
             extractHostFromFrame(parentFrame, originUrl) || frame.url.hostname,
             getKey(page, frame, originUrl)];

      frame = parentFrame;
    }

    if (originUrl)
    {
      yield [originUrl, typeMask, originUrl.hostname,
             getKey(null, null, originUrl)];
    }
  }
  else if (page)
  {
    yield [page.url, typeMask, page.url.hostname, null];
  }
}

let checkAllowlisted =
/**
 * Gets the active allowing filter for the document associated
 * with the given page/frame, or null if it's not allowlisted.
 *
 * @param {?Page}   page
 * @param {?Frame} [frame]
 * @param {?URL}   [originUrl]
 * @param {number} [typeMask=contentTypes.DOCUMENT]
 * @return {?AllowingFilter}
 */
exports.checkAllowlisted = (page, frame, originUrl,
                            typeMask = contentTypes.DOCUMENT) =>
{
  for (let details of frameDetails(page, frame, originUrl, typeMask))
  {
    let filter = match(page, ...details);
    if (filter)
      return filter;
  }
};

let listAllowlistingFilters =
/**
 * Returns all allowing filters that apply the document associated
 * with the given page/frame.
 *
 * @param {?Page}   page
 * @param {?Frame} [frame]
 * @param {?URL}   [originUrl]
 * @param {number} [typeMask=contentTypes.DOCUMENT]
 * @return {Array.<AllowingFilter>}
 */
exports.listAllowlistingFilters = (page, frame, originUrl,
                                   typeMask = contentTypes.DOCUMENT) =>
{
  let filters = new Set([]);

  for (let details of frameDetails(page, frame, originUrl, typeMask))
  {
    let {allowing} = defaultMatcher.search(...details, false, "allowing");
    for (let filter of allowing)
      filters.add(filter);
  }

  return Array.from(filters);
};

/**
 * @typedef {object} filtersIsAllowlistedResult
 * @property {boolean} hostname
 *   True if an allowing filter for an entire domain matches the given page.
 * @property {boolean} page
 *   True if an allowing filter _not_ for an entire domain matches the given
 *   page.
 */

/**
 * Checks if the given page is allowlisted.
 *
 * @event "filters.isWhitelisted"
 * @returns {filtersIsAllowlistedResult}
 */
port.on("filters.isWhitelisted", message =>
{
  let pageAllowlisted = false;
  let hostnameAllowlisted = false;

  for (let filter of listAllowlistingFilters(new ext.Page(message.tab)))
  {
    if (allowlistedDomainRegexp.test(filter.text))
      hostnameAllowlisted = true;
    else
      pageAllowlisted = true;

    if (pageAllowlisted && hostnameAllowlisted)
      break;
  }

  return {hostname: hostnameAllowlisted, page: pageAllowlisted};
});

/**
 * Adds an allowing filter for the given page's hostname, if it is not
 * already allowlisted. Note: If a disabled allowing filter exists, we
 * enable that instead.
 *
 * @event "filters.whitelist"
 * @property {boolean} [singlePage=false]
 *   If true we add an allowing filter for the given page's URL instead.
 */
port.on("filters.whitelist", message =>
{
  let page = new ext.Page(message.tab);
  let filter;
  if (!message.singlePage)
  {
    let host = page.url.hostname.replace(/^www\./, "");
    filter = Filter.fromText("@@||" + host + "^$document");
  }
  else
  {
    // We generate a filter which only applies to the same protocol (e.g. http)
    // and subdomain, but one which doesn't consider the exact query string or
    // fragment.
    // Our logic here is taken from the legacy Firefox extension.
    // See https://hg.adblockplus.org/adblockplus/file/tip/lib/ui.js#l1517
    let ending = "|";
    page.url.hash = "";
    if (page.url.search && page.url.search.includes("&"))
    {
      page.url.search = "";
      ending = "?";
    }
    filter = Filter.fromText("@@|" + page.url.href + ending + "$document");
  }

  filterState.setEnabled(filter.text, true);
  if (filterStorage.getSubscriptionCount(filter.text) == 0)
    filterStorage.addFilter(filter);
});

/**
 * Remove any allowing filters which apply to the given page's URL.
 *
 * @event "filters.unwhitelist"
 * @property {boolean} [singlePage=false]
 *   If true we only remove allowing filters which are not for an entire
 *   domain.
 */
port.on("filters.unwhitelist", message =>
{
  let page = new ext.Page(message.tab);
  for (let filter of listAllowlistingFilters(page))
  {
    if (message.singlePage && allowlistedDomainRegexp.test(filter.text))
      continue;

    filterStorage.removeFilter(filter);
    if (filterStorage.getSubscriptionCount(filter.text) != 0)
      filterState.setEnabled(filter.text, false);
  }
});

function revalidateAllowlistingState(page)
{
  filterNotifier.emit(
    "page.AllowlistingStateRevalidate",
    page, checkAllowlisted(page)
  );
}

filterNotifier.on("filter.behaviorChanged", () =>
{
  browser.tabs.query({}).then(tabs =>
  {
    for (let tab of tabs)
      revalidateAllowlistingState(new ext.Page(tab));
  });
});

ext.pages.onLoading.addListener(revalidateAllowlistingState);

let getKey =
/**
 * Gets the public key, previously recorded for the given page
 * and frame, to be considered for the $sitekey filter option.
 *
 * @param {?Page}   page
 * @param {?Frame}  frame
 * @param {URL}    [originUrl]
 * @return {string}
 */
exports.getKey = (page, frame, originUrl) =>
{
  if (page)
  {
    let keys = sitekeys.get(page);
    if (keys)
    {
      for (; frame; frame = frame.parent)
      {
        let key = keys.get(frame.url.href);
        if (key)
          return key;
      }
    }
  }

  if (originUrl)
  {
    for (let keys of sitekeys._map.values())
    {
      let key = keys.get(originUrl.href);
      if (key)
        return key;
    }
  }

  return null;
};

function checkKey(token, url)
{
  let parts = token.split("_");
  if (parts.length < 2)
    return false;

  let key = parts[0].replace(/=/g, "");
  let signature = parts[1];
  let data = url.pathname + url.search + "\0" +
             url.host + "\0" +
             self.navigator.userAgent;
  if (!verifySignature(key, signature, data))
    return false;

  return key;
}

function recordKey(key, page, url)
{
  let keys = sitekeys.get(page);
  if (!keys)
  {
    keys = new Map();
    sitekeys.set(page, keys);
  }
  keys.set(url.href, key);
}

/**
 * Record the given sitekey if it is valid.
 *
 * @event "filters.addKey"
 * @property {string} token - The sitekey token found in the document element's
 *                            data-adblockkey attribute.
 */
port.on("filters.addKey", (message, sender) =>
{
  let key = checkKey(message.token, sender.frame.url);
  if (key)
    recordKey(key, sender.page, sender.frame.url);
});

function onHeadersReceived(details)
{
  let page = new ext.Page({id: details.tabId});

  for (let header of details.responseHeaders)
  {
    if (header.name.toLowerCase() == "x-adblock-key" && header.value)
    {
      let url = new URL(details.url);
      let key = checkKey(header.value, url);
      if (key)
      {
        recordKey(key, page, url);
        break;
      }
    }
  }
}

if (typeof browser == "object")
{
  browser.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
      urls: ["http://*/*", "https://*/*"],
      types: ["main_frame", "sub_frame"]
    },
    ["responseHeaders"]
  );
}
