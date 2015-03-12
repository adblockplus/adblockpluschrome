/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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

let {defaultMatcher} = require("matcher");
let {stringifyURL, getDecodedHostname, extractHostFromFrame, isThirdParty} = require("url");

let pagesWithKey = new ext.PageMap();

/**
 * Checks whether a page is whitelisted.
 *
 * @param {Page} page
 * @return {WhitelistFilter} The active filter whitelisting this page or null
 */
function isPageWhitelisted(page)
{
  let url = page.url;

  return defaultMatcher.whitelist.matchesAny(
    stringifyURL(url), "DOCUMENT",
    getDecodedHostname(url), false, null
  );
}
exports.isPageWhitelisted = isPageWhitelisted;

/**
 * Checks whether a frame is whitelisted.
 *
 * @param {Page}   page
 * @param {Frame}  frame
 * @param {string} [type=DOCUMENT]  The request type to check whether
 *                                  the frame is whitelisted for.
 * @return {Boolean}
 */
function isFrameWhitelisted(page, frame, type)
{
  while (frame)
  {
    let parent = frame.parent;
    let url = frame.url;
    let documentHost = extractHostFromFrame(parent) || getDecodedHostname(url);

    let filter = defaultMatcher.whitelist.matchesAny(
      stringifyURL(url), type || "DOCUMENT",
      documentHost, isThirdParty(url, documentHost),
      getKey(page, frame)
    );

    if (filter)
      return true;

    frame = parent;
  }

  return false;
}
exports.isFrameWhitelisted = isFrameWhitelisted;

/**
 * Gets the public key, previously recorded for the given page
 * and frame, to be considered for the $sitekey filter option.
 *
 * @param {Page}  page
 * @param {Frame} frame
 * @return {string}
 */
function getKey(page, frame)
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
}
exports.getKey = getKey;

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
function processKey(token, page, frame)
{
  if (token.indexOf("_") < 0)
    return;

  let [key, signature] = token.split("_", 2);
  key = key.replace(/=/g, "");

  if (verifyKey(key, signature, frame.url))
    recordKey(page, frame.url, key);
}
exports.processKey = processKey;
