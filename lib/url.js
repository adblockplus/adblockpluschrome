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

/** @module url */

"use strict";

const {getDomain} = require("tldjs");
const punycode = require("punycode");

let getDecodedHostname =
/**
 * Gets the IDN-decoded hostname from a URL object.
 *
 * @param {URL} url
 * @return {string}
 * @static
 */
exports.getDecodedHostname = url =>
{
  let hostname = url.hostname;

  if (hostname.indexOf("xn--") == -1)
    return hostname;

  return punycode.toUnicode(hostname);
};

/**
 * Gets the IDN-decoded hostname from the URL of a frame.
 * If the URL don't have host information (like "about:blank"
 * and "data:" URLs) it falls back to the parent frame.
 *
 * @param {Frame} frame
 * @return {string}
 */
exports.extractHostFromFrame = frame =>
{
  for (; frame; frame = frame.parent)
  {
    let hostname = getDecodedHostname(frame.url);
    if (hostname)
      return hostname;
  }

  return "";
};

/**
 * Converts a URL object into a string. For HTTP(S) URLs
 * the hostname gets IDN-decoded and the hash is stripped.
 *
 * @param {URL} url
 * @return {string}
 */
exports.stringifyURL = url =>
{
  let protocol = url.protocol;
  let href = url.href;

  if (protocol == "http:" || protocol == "https:")
  {
    let hostname = url.hostname;
    if (hostname.indexOf("xn--") != -1)
      href = href.replace(hostname, punycode.toUnicode(hostname));

    let hash = href.indexOf("#");
    if (hash != -1)
      href = href.substr(0, hash);
  }

  return href;
};

function isDomain(hostname)
{
  // No hostname or IPv4 address, also considering hexadecimal octets.
  if (/^((0x[\da-f]+|\d+)(\.|$))*$/i.test(hostname))
    return false;

  // IPv6 address. Since there can't be colons in domains, we can
  // just check whether there are any colons to exclude IPv6 addresses.
  return hostname.indexOf(":") == -1;
}

/**
 * Checks whether the request's origin is different from the document's origin.
 *
 * @param {URL}    url           The request URL
 * @param {string} documentHost  The IDN-decoded hostname of the document
 * @return {Boolean}
 */
exports.isThirdParty = (url, documentHost) =>
{
  let requestHost = getDecodedHostname(url).replace(/\.+$/, "");
  documentHost = documentHost.replace(/\.+$/, "");

  if (requestHost == documentHost)
    return false;

  if (!isDomain(requestHost) || !isDomain(documentHost))
    return true;

  return getDomain(requestHost) != getDomain(documentHost);
};
