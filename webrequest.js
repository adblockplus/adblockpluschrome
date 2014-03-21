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

var FilterNotifier = require("filterNotifier").FilterNotifier;

var onFilterChangeTimeout = null;
function onFilterChange()
{
  onFilterChangeTimeout = null;
  ext.webRequest.handlerBehaviorChanged();
}

var importantNotifications = {
  'filter.added': true,
  'filter.removed': true,
  'filter.disabled': true,
  'subscription.added': true,
  'subscription.removed': true,
  'subscription.disabled': true,
  'subscription.updated': true,
  'load': true
};

FilterNotifier.addListener(function(action)
{
  if (action in importantNotifications)
  {
    // Execute delayed to prevent multiple executions in a quick succession
    if (onFilterChangeTimeout != null)
      window.clearTimeout(onFilterChangeTimeout);
    onFilterChangeTimeout = window.setTimeout(onFilterChange, 2000);
  }
});

function onBeforeRequest(url, type, tab, frame)
{
  if (isFrameWhitelisted(tab, frame))
    return true;

  var docDomain = extractHostFromURL(frame.url);
  var filter = defaultMatcher.matchesAny(
    url,
    type == "sub_frame" ? "SUBDOCUMENT" : type.toUpperCase(),
    docDomain,
    isThirdParty(extractHostFromURL(url), docDomain)
  );

  FilterNotifier.triggerListeners("filter.hitCount", filter, 0, 0, tab);
  return !(filter instanceof BlockingFilter);
}

ext.webRequest.onBeforeRequest.addListener(onBeforeRequest);

if (require("info").platform == "chromium")
{
  function onHeadersReceived(details)
  {
    if (details.tabId == -1)
      return;

    if (details.type != "main_frame" && details.type != "sub_frame")
      return;

    var tab = new Tab({id: details.tabId});
    var frame = new Frame({id: details.frameId, tab: tab});

    if (frame.url != details.url)
      return;

    for (var i = 0; i < details.responseHeaders.length; i++)
    {
      var header = details.responseHeaders[i];
      if (header.name.toLowerCase() == "x-adblock-key" && header.value)
        processKeyException(header.value, tab, frame);
    }

    var notificationToShow = Notification.getNextToShow(details.url);
    if (notificationToShow)
      showNotification(notificationToShow);
  }

  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {urls: ["<all_urls>"]}, ["responseHeaders"]);
}
