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

"use strict";

const {defaultMatcher} = require("matcher");
const {BlockingFilter, RegExpFilter} = require("filterClasses");
const {getDecodedHostname} = require("url");

chrome.webRequest.onHeadersReceived.addListener(details =>
{
  let hostname = getDecodedHostname(new URL(details.url));
  let match = defaultMatcher.matchesAny("", RegExpFilter.typeMap.WEBSOCKET,
                                        hostname, false, null, true);
  if (match instanceof BlockingFilter)
  {
    details.responseHeaders.push({
      name: "Content-Security-Policy",
      // We're blocking WebSockets here by adding a connect-src restriction
      // since the Chrome extension API does not allow us to intercept them.
      // https://bugs.chromium.org/p/chromium/issues/detail?id=129353
      //
      // We also need the frame-src and object-src restrictions since CSPs are
      // not inherited from the parent for documents with data: and blob: URLs.
      // https://bugs.chromium.org/p/chromium/issues/detail?id=513860
      //
      // "http:" also includes "https:" implictly.
      // https://www.chromestatus.com/feature/6653486812889088
      value: "connect-src http:; frame-src http:; object-src http:"
    });
    return {responseHeaders: details.responseHeaders};
  }
}, {
  urls: ["http://*/*", "https://*/*"],
  types: ["main_frame", "sub_frame"]
}, ["blocking", "responseHeaders"]);
