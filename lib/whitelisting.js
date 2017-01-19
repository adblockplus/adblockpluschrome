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

/** @module whitelisting */

"use strict";

const {defaultMatcher} = require("matcher");
const {RegExpFilter} = require("filterClasses");
const {DownloadableSubscription} = require("subscriptionClasses");
const {FilterNotifier} = require("filterNotifier");
const {stringifyURL, getDecodedHostname,
       extractHostFromFrame, isThirdParty} = require("url");
const {port} = require("messaging");
const devtools = require("devtools");
const {verifySignature} = require("rsa");

let sitekeys = new ext.PageMap();

function match(page, url, typeMask, docDomain, sitekey)
{
  let thirdParty = !!docDomain && isThirdParty(url, docDomain);
  let urlString = stringifyURL(url);

  if (!docDomain)
    docDomain = getDecodedHostname(url);

  let filter = defaultMatcher.whitelist.matchesAny(
    urlString, typeMask, docDomain, thirdParty, sitekey
  );

  if (filter && devtools)
    devtools.logWhitelistedDocument(
      page, urlString, typeMask, docDomain, filter
    );

  return filter;
}

let checkWhitelisted =
/**
 * Gets the active whitelisting filter for the document associated
 * with the given page/frame, or null if it's not whitelisted.
 *
 * @param {Page}   page
 * @param {Frame}  [frame]
 * @param {number} [typeMask=RegExpFilter.typeMap.DOCUMENT]
 * @return {?WhitelistFilter}
 */
exports.checkWhitelisted = (page, frame, typeMask) =>
{
  if (typeof typeMask == "undefined")
    typeMask = RegExpFilter.typeMap.DOCUMENT;

  if (frame)
  {
    let filter = null;

    while (frame && !filter)
    {
      let parent = frame.parent;
      let docDomain = extractHostFromFrame(parent);
      let sitekey = getKey(page, frame);

      filter = match(page, frame.url, typeMask, docDomain, sitekey);
      frame = parent;
    }

    return filter;
  }

  return match(page, page.url, typeMask);
};

port.on("filters.isPageWhitelisted", (message, sender) =>
{
  return !!checkWhitelisted(sender.page);
});

function revalidateWhitelistingState(page)
{
  FilterNotifier.emit(
    "page.WhitelistingStateRevalidate",
    page, checkWhitelisted(page)
  );
}

FilterNotifier.on("filter.behaviorChanged", () =>
{
  ext.pages.query({}, pages =>
  {
    for (let page of pages)
      revalidateWhitelistingState(page);
  });
});

ext.pages.onLoading.addListener(revalidateWhitelistingState);

let getKey =
/**
 * Gets the public key, previously recorded for the given page
 * and frame, to be considered for the $sitekey filter option.
 *
 * @param {Page}  page
 * @param {Frame} frame
 * @return {string}
 */
exports.getKey = (page, frame) =>
{
  let keys = sitekeys.get(page);
  if (!keys)
    return null;

  for (; frame != null; frame = frame.parent)
  {
    let key = keys[stringifyURL(frame.url)];
    if (key)
      return key;
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
             window.navigator.userAgent;
  if (!verifySignature(key, signature, data))
    return false;

  return key;
}

function recordKey(key, page, url)
{
  let keys = sitekeys.get(page);
  if (!keys)
  {
    keys = Object.create(null);
    sitekeys.set(page, keys);
  }
  keys[stringifyURL(url)] = key;
}

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
        // For pre-rendered tabs we don't know for sure the navigation is going
        // to happen until the onCommitted event fires. Unfortunately if we want
        // sitekey whitelisting to work for requests made before onCommitted has
        // been fired we must update the page structure now anyway.
        ext._updatePageFrameStructure(details.frameId, details.tabId, details.url, true);
        recordKey(key, page, url);
        break;
      }
    }
  }
}

if (typeof chrome == "object")
  chrome.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
      urls: ["http://*/*", "https://*/*"],
      types: ["main_frame", "sub_frame"]
    },
    ["responseHeaders"]
  );
