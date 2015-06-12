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

var FilterNotifier = require("filterNotifier").FilterNotifier;
var RegExpFilter = require("filterClasses").RegExpFilter;
var platform = require("info").platform;
var showNextNotificationForUrl = require("notificationHelper").showNextNotificationForUrl;

ext.webRequest.indistinguishableTypes.forEach(function(types)
{
  for (var i = 1; i < types.length; i++)
    RegExpFilter.typeMap[types[i]] = RegExpFilter.typeMap[types[0]];
});

FilterNotifier.addListener(function(action, arg)
{
  switch (action)
  {
    case "filter.added":
    case "filter.removed":
    case "filter.disabled":
      // Only request blocking/whitelisting filters have
      // an effect on the webRequest handler behavior.
      if (!(arg instanceof RegExpFilter))
        break;
    case "subscription.added":
    case "subscription.removed":
    case "subscription.disabled":
    case "subscription.updated":
    case "load":
      ext.webRequest.handlerBehaviorChanged();
      break;
  }
});

function onBeforeRequestAsync(url, type, page, filter)
{
  // We can't listen to onHeadersReceived in Safari so we need to
  // check for notifications here
  if (platform != "chromium" && type == "SUBDOCUMENT")
    showNextNotificationForUrl(url);

  if (filter)
    FilterNotifier.triggerListeners("filter.hitCount", filter, 0, 0, page);
}

function onBeforeRequest(url, type, page, frame)
{
  if (isFrameWhitelisted(page, frame))
    return true;

  var docDomain = extractHostFromFrame(frame);
  var key = getKey(page, frame);
  var filter = defaultMatcher.matchesAny(
    stringifyURL(url),
    type, docDomain,
    isThirdParty(url, docDomain),
    key
  );

  setTimeout(onBeforeRequestAsync, 0, url, type, page, filter);

  return !(filter instanceof BlockingFilter);
}

ext.webRequest.onBeforeRequest.addListener(onBeforeRequest);

if (platform == "chromium")
{
  function onHeadersReceived(details)
  {
    var page = new ext.Page({id: details.tabId});
    var frame = ext.getFrame(details.tabId, details.frameId);

    if (!frame || frame.url.href != details.url)
      return;

    for (var i = 0; i < details.responseHeaders.length; i++)
    {
      var header = details.responseHeaders[i];
      if (header.name.toLowerCase() == "x-adblock-key" && header.value)
        processKey(header.value, page, frame);
    }

    showNextNotificationForUrl(new URL(details.url));
  }

  chrome.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
      urls: ["http://*/*", "https://*/*"],
      types: ["main_frame", "sub_frame"]
    },
    ["responseHeaders"]
  );
}
