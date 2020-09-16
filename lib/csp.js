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

const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {AllowingFilter} = require("../adblockpluscore/lib/filterClasses");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");
const {parseURL} = require("../adblockpluscore/lib/url");
const {extractHostFromFrame} = require("./url");
const {checkAllowlisted} = require("./allowlisting");
const {filterNotifier} = require("filterNotifier");
const {logRequest} = require("./hitLogger");
const {recordBlockedRequest} = require("./stats");

browser.webRequest.onHeadersReceived.addListener(details =>
{
  let url = parseURL(details.url);
  let parentFrame = ext.getFrame(details.tabId, details.parentFrameId);
  let hostname = extractHostFromFrame(parentFrame) || url.hostname;

  let cspMatch = defaultMatcher.match(url, contentTypes.CSP,
                                      hostname, null, false);
  if (cspMatch)
  {
    let page = new ext.Page({id: details.tabId, url: details.url});
    let frame = ext.getFrame(details.tabId, details.frameId);

    if (checkAllowlisted(page, frame))
      return;

    // To avoid an extra match for the common case we assumed no
    // $genericblock filters applied when searching for a matching $csp filter.
    // We must now pay the price by first checking for a $genericblock filter
    // and if necessary that our $csp filter is specific.
    let specificOnly = !!checkAllowlisted(page, frame, null,
                                          contentTypes.GENERICBLOCK);
    if (specificOnly && !(cspMatch instanceof AllowingFilter))
    {
      cspMatch = defaultMatcher.match(url, contentTypes.CSP,
                                      hostname, null, specificOnly);
      if (!cspMatch)
        return;
    }

    if (cspMatch instanceof AllowingFilter)
    {
      logRequest([details.tabId], {
        url: details.url, type: "CSP", docDomain: hostname,
        specificOnly
      }, cspMatch);
      recordBlockedRequest(cspMatch, [details.tabId]);
      return;
    }

    let {blocking} = defaultMatcher.search(url, contentTypes.CSP, hostname,
                                           null, specificOnly, "blocking");
    for (cspMatch of blocking)
    {
      logRequest([details.tabId], {
        url: details.url, type: "CSP", docDomain: hostname,
        specificOnly
      }, cspMatch);
      recordBlockedRequest(cspMatch, [details.tabId]);

      details.responseHeaders.push({
        name: "Content-Security-Policy",
        value: cspMatch.csp
      });
    }

    return {responseHeaders: details.responseHeaders};
  }
}, {
  urls: ["http://*/*", "https://*/*"],
  types: ["main_frame", "sub_frame"]
}, ["blocking", "responseHeaders"]);
