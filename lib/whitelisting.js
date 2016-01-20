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

let {defaultMatcher} = require("matcher");
let {RegExpFilter} = require("filterClasses");
let {stringifyURL, getDecodedHostname, extractHostFromFrame, isThirdParty} = require("url");

let pagesWithKey = new ext.PageMap();

/**
 * Checks whether a page is whitelisted.
 *
 * @param {Page} page
 * @return {WhitelistFilter} The active filter whitelisting this page or null
 */
exports.isPageWhitelisted = function(page)
{
  let url = page.url;

  return defaultMatcher.whitelist.matchesAny(
    stringifyURL(url), RegExpFilter.typeMap.DOCUMENT,
    getDecodedHostname(url), false, null
  );
};

/**
 * Checks whether a frame is whitelisted.
 *
 * @param {Page}   page
 * @param {Frame}  frame
 * @param {number} [typeMask=RegExpFilter.typeMap.DOCUMENT]  Bit mask of request / content types to match
 * @return {Boolean}
 */
exports.isFrameWhitelisted = function(page, frame, typeMask)
{
  while (frame)
  {
    let parent = frame.parent;
    let url = frame.url;
    let documentHost = extractHostFromFrame(parent) || getDecodedHostname(url);

    let filter = defaultMatcher.whitelist.matchesAny(
      stringifyURL(url), typeMask || RegExpFilter.typeMap.DOCUMENT,
      documentHost, isThirdParty(url, documentHost),
      getKey(page, frame)
    );

    if (filter)
      return true;

    frame = parent;
  }

  return false;
};

let getKey =
/**
 * Gets the public key, previously recorded for the given page
 * and frame, to be considered for the $sitekey filter option.
 *
 * @param {Page}  page
 * @param {Frame} frame
 * @return {string}
 */
exports.getKey = function(page, frame)
{
  let urlsWithKey = pagesWithKey.get(page);
  if (!urlsWithKey)
    return null;

  for (; frame != null; frame = frame.parent)
  {
    let key = urlsWithKey[stringifyURL(frame.url)];
    if (key)
      return key;
  }

  return null;
};

function verifyKey(key, signature, url)
{
  let params = [
    url.pathname + url.search, // REQUEST_URI
    url.host,                  // HTTP_HOST
    window.navigator.userAgent // HTTP_USER_AGENT
  ];

  return verifySignature(key, signature, params.join("\0"));
}

function recordKey(page, url, key)
{
  let urlsWithKey = pagesWithKey.get(page);

  if (!urlsWithKey)
  {
    urlsWithKey = Object.create(null);
    pagesWithKey.set(page, urlsWithKey);
  }

  urlsWithKey[stringifyURL(url)] = key;
}

/**
 * Validates signatures given by the "X-Adblock-Key" response
 * header or the "data-adblockkey" attribute of the document
 * element. If the signature is valid, the public key will be
 * recorded and considered for the $sitekey filter option.
 *
 * @param {string} token  The base64-encoded public key and
 *                        signature separated by an underscrore.
 * @param {Page}   page
 * @param {Frame}  frame
 */
exports.processKey = function(token, page, frame)
{
  if (token.indexOf("_") < 0)
    return;

  let [key, signature] = token.split("_", 2);
  key = key.replace(/=/g, "");

  if (verifyKey(key, signature, frame.url))
    recordKey(page, frame.url, key);
};
