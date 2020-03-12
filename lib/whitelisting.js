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

/** @module whitelisting */

"use strict";

const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {Filter} = require("../adblockpluscore/lib/filterClasses");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {extractHostFromFrame} = require("./url");
const {port} = require("./messaging");
const {logWhitelistedDocument} = require("./hitLogger");
const {verifySignature} = require("../adblockpluscore/lib/rsa");

let sitekeys = new ext.PageMap();
let whitelistedDomainRegexp =
    exports.whitelistedDomainRegexp = /^@@\|\|([^/:]+)\^\$document$/;

function match(page, url, typeMask, docDomain, sitekey)
{
  let filter = defaultMatcher.match(url, typeMask, docDomain, sitekey);

  if (filter && page)
    logWhitelistedDocument(page.id, url.href, typeMask, docDomain, filter);

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
  else if (page && page.url)
  {
    yield [page.url, typeMask, page.url.hostname, null];
  }
}

let checkWhitelisted =
/**
 * Gets the active whitelisting filter for the document associated
 * with the given page/frame, or null if it's not whitelisted.
 *
 * @param {?Page}   page
 * @param {?Frame} [frame]
 * @param {?URL}   [originUrl]
 * @param {number} [typeMask=contentTypes.DOCUMENT]
 * @return {?WhitelistFilter}
 */
exports.checkWhitelisted = (page, frame, originUrl,
                            typeMask = contentTypes.DOCUMENT) =>
{
  for (let details of frameDetails(page, frame, originUrl, typeMask))
  {
    let filter = match(page, ...details);
    if (filter)
      return filter;
  }
};

let listWhitelistingFilters =
/**
 * Returns all whitelisting filters that apply the document associated
 * with the given page/frame.
 *
 * @param {?Page}   page
 * @param {?Frame} [frame]
 * @param {?URL}   [originUrl]
 * @param {number} [typeMask=contentTypes.DOCUMENT]
 * @return {Array.<WhitelistFilter>}
 */
exports.listWhitelistingFilters = (page, frame, originUrl,
                                   typeMask = contentTypes.DOCUMENT) =>
{
  let filters = new Set([]);

  for (let details of frameDetails(page, frame, originUrl, typeMask))
  {
    let {whitelist} = defaultMatcher.search(...details, false, "whitelist");
    for (let filter of whitelist)
      filters.add(filter);
  }

  return Array.from(filters);
};

/**
 * @typedef {object} filtersIsWhitelistedResult
 * @property {boolean} hostname
 *   True if a whitelisting filter for an entire domain matches the given page.
 * @property {boolean} page
 *   True if a whitelisting filter _not_ for an entire domain matches the given
 *   page.
 */

/**
 * Checks if the given page is whitelisted.
 *
 * @event "filters.isWhitelisted"
 * @returns {filtersIsWhitelistedResult}
 */
port.on("filters.isWhitelisted", message =>
{
  let pageWhitelisted = false;
  let hostnameWhitelisted = false;

  for (let filter of listWhitelistingFilters(new ext.Page(message.tab)))
  {
    if (whitelistedDomainRegexp.test(filter.text))
      hostnameWhitelisted = true;
    else
      pageWhitelisted = true;

    if (pageWhitelisted && hostnameWhitelisted)
      break;
  }

  return {hostname: hostnameWhitelisted, page: pageWhitelisted};
});

/**
 * Adds a whitelisting filter for the given page's hostname, if it is not
 * already whitelisted. Note: If a disabled whitelisting filter exists, we
 * enable that instead.
 *
 * @event "filters.whitelist"
 * @property {boolean} [singlePage=false]
 *   If true we add a whitelisting filter for the given page's URL instead.
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

  if (filterStorage.getSubscriptionCount(filter.text) && filter.disabled)
  {
    filter.disabled = false;
  }
  else
  {
    filter.disabled = false;
    filterStorage.addFilter(filter);
  }
});

/**
 * Remove any whitelisting filters which apply to the given page's URL.
 *
 * @event "filters.unwhitelist"
 * @property {boolean} [singlePage=false]
 *   If true we only remove whitelisting filters which are not for an entire
 *   domain.
 */
port.on("filters.unwhitelist", message =>
{
  let page = new ext.Page(message.tab);
  for (let filter of listWhitelistingFilters(page))
  {
    if (message.singlePage && whitelistedDomainRegexp.test(filter.text))
      continue;

    filterStorage.removeFilter(filter);
    if (filterStorage.getSubscriptionCount(filter.text))
      filter.disabled = true;
  }
});

function revalidateWhitelistingState(page)
{
  filterNotifier.emit(
    "page.WhitelistingStateRevalidate",
    page, checkWhitelisted(page)
  );
}

filterNotifier.on("filter.behaviorChanged", () =>
{
  browser.tabs.query({}).then(tabs =>
  {
    for (let tab of tabs)
      revalidateWhitelistingState(new ext.Page(tab));
  });
});

ext.pages.onLoading.addListener(revalidateWhitelistingState);

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
