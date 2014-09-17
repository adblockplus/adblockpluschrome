/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
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
let {WhitelistFilter} = require("filterClasses");

let pagesWithKey = new ext.PageMap();

let isWhitelisted = exports.isWhitelisted = function(url, parentUrl, type, key)
{
  let filter = defaultMatcher.matchesAny(
    stripFragmentFromURL(url),
    type || "DOCUMENT",
    extractHostFromURL(parentUrl || url),
    false,
    key
  );

  return (filter instanceof WhitelistFilter ? filter : null);
};

let isFrameWhitelisted = exports.isFrameWhitelisted = function(page, frame, type)
{
  for (; frame != null; frame = frame.parent)
  {
    let key = getKey(page, frame);
    if (isWhitelisted(frame.url, (frame.parent || {}).url, type, key))
      return true;
  }

  return false;
};

let getKey = exports.getKey = function(page, frame)
{
  let urlsWithKey = pagesWithKey.get(page);
  if (!urlsWithKey)
    return null;

  for (; frame != null; frame = frame.parent)
  {
    if (urlsWithKey[frame.url])
      return urlsWithKey[frame.url];
  }

  return null;
}

let verifyKey = function(key, signature, url, docDomain)
{
  let uri = new URI(url);
  let params = [
    uri.path,                                               // REQUEST_URI
    uri.asciiHost + (uri.port != -1 ? ":" + uri.port : ""), // HTTP_HOST
    window.navigator.userAgent                              // HTTP_USER_AGENT
  ];

  return verifySignature(key, signature, params.join("\0"));
};

let recordKey = function(page, url, key)
{
  let urlsWithKey = pagesWithKey.get(page);

  if (!urlsWithKey)
  {
    urlsWithKey = {__proto__: null};
    pagesWithKey.set(page, urlsWithKey);
  }

  urlsWithKey[url] = key;
};

let processKey = exports.processKey = function(token, page, frame)
{
  let url = stripFragmentFromURL(frame.url);
  let docDomain = extractHostFromURL((frame.parent || frame).url);

  if (token.indexOf("_") < 0)
    return;

  let [key, signature] = token.split("_", 2);
  key = key.replace(/=/g, "");
  if (verifyKey(key, signature, url, docDomain))
    recordKey(page, url, key);
};
