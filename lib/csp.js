/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2017 eyeo GmbH
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

// Before Chrome 58, the webRequest API did not intercept WebSocket
// connections (see https://crbug.com/129353). Hence we inject CSP headers,
// below, as a workaround.
if (!("WEBSOCKET" in chrome.webRequest.ResourceType))
{
  const {defaultMatcher} = require("matcher");
  const {BlockingFilter, RegExpFilter} = require("filterClasses");
  const {getDecodedHostname} = require("url");
  const {checkWhitelisted} = require("whitelisting");

  chrome.webRequest.onHeadersReceived.addListener(details =>
  {
    let hostname = getDecodedHostname(new URL(details.url));
    let match = defaultMatcher.matchesAny("", RegExpFilter.typeMap.WEBSOCKET,
                                          hostname, false, null, true);
    if (match instanceof BlockingFilter &&
        !checkWhitelisted(new ext.Page({id: details.tabId}),
                          ext.getFrame(details.tabId, details.frameId)))
    {
      details.responseHeaders.push({
        name: "Content-Security-Policy",
        // We're blocking WebSockets here by adding a connect-src restriction
        // since the Chrome extension API does not allow us to intercept them.
        // https://bugs.chromium.org/p/chromium/issues/detail?id=129353
        //
        // We also need the frame-src and object-src restrictions since CSPs
        // are not inherited from the parent for documents with data: and blob:
        // URLs, see https://crbug.com/513860.
        //
        // We must use the deprecated child-src directive instead of worker-src
        // since that's not supported yet (as of Chrome 56.)
        //
        // "http:" also includes "https:" implictly.
        // https://www.chromestatus.com/feature/6653486812889088
        value: "connect-src http:; child-src http:; frame-src http:; object-src http:"
      });
      return {responseHeaders: details.responseHeaders};
    }
  }, {
    urls: ["http://*/*", "https://*/*"],
    // We must also intercept script requests since otherwise Web Workers can
    // be abused to execute scripts for which our Content Security Policy
    // won't be injected.
    // https://github.com/gorhill/uBO-Extra/issues/19
    types: ["main_frame", "sub_frame", "script"]
  }, ["blocking", "responseHeaders"]);
}
