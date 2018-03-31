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

const {defaultMatcher} = require("matcher");
const {RegExpFilter, WhitelistFilter} = require("filterClasses");
const {extractHostFromFrame, getDecodedHostname,
       isThirdParty, stringifyURL} = require("url");
const {checkWhitelisted} = require("whitelisting");
const {FilterNotifier} = require("filterNotifier");
const devtools = require("devtools");

const {typeMap} = RegExpFilter;

browser.webRequest.onHeadersReceived.addListener(details =>
{
  let url = new URL(details.url);
  let urlString = stringifyURL(url);
  let parentFrame = ext.getFrame(details.tabId, details.parentFrameId);
  let hostname = extractHostFromFrame(parentFrame) || getDecodedHostname(url);
  let thirdParty = isThirdParty(url, hostname);

  let cspMatch = defaultMatcher.matchesAny(urlString, typeMap.CSP, hostname,
                                           thirdParty, null, false);
  if (cspMatch)
  {
    let page = new ext.Page({id: details.tabId, url: details.url});
    let frame = ext.getFrame(details.tabId, details.frameId);

    if (checkWhitelisted(page, frame))
      return;

    // To avoid an extra matchesAny for the common case we assumed no
    // $genericblock filters applied when searching for a matching $csp filter.
    // We must now pay the price by first checking for a $genericblock filter
    // and if necessary that our $csp filter is specific.
    let specificOnly = !!checkWhitelisted(page, frame, null,
                                          typeMap.GENERICBLOCK);
    if (specificOnly)
    {
      cspMatch = defaultMatcher.matchesAny(urlString, typeMap.CSP, hostname,
                                           thirdParty, null, specificOnly);
      if (!cspMatch)
        return;
    }

    devtools.logRequest([details.tabId], urlString, "CSP", hostname,
                        thirdParty, null, specificOnly, cspMatch);
    FilterNotifier.emit("filter.hitCount", cspMatch, 0, 0, [details.tabId]);

    if (cspMatch instanceof WhitelistFilter)
      return;

    details.responseHeaders.push({
      name: "Content-Security-Policy",
      value: cspMatch.csp
    });

    return {responseHeaders: details.responseHeaders};
  }
}, {
  urls: ["http://*/*", "https://*/*"],
  types: ["main_frame", "sub_frame"]
}, ["blocking", "responseHeaders"]);
