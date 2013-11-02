/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
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

var frames = new TabMap();

function onBeforeRequest(url, type, tab, frameId, parentFrameId)
{
  if (!tab)
    return true;

  // Assume that the first request belongs to the top frame. Chrome may give the
  // top frame the type "object" instead of "main_frame".
  // https://code.google.com/p/chromium/issues/detail?id=281711
  if (frameId == 0 && !frames.has(tab) && type == "object")
    type = "main_frame";

  if (type == "main_frame" || type == "sub_frame")
  {
    recordFrame(tab, frameId, parentFrameId, url);

    if (type == "main_frame")
      return true;

    type = "subdocument";
    frameId = parentFrameId;
  }

  var filter = checkRequest(type.toUpperCase(), tab, url, frameId);
  FilterNotifier.triggerListeners("filter.hitCount", filter, 0, 0, tab);
  return !(filter instanceof BlockingFilter);
}

function recordFrame(tab, frameId, parentFrameId, url)
{
  var framesOfTab = frames.get(tab);

  if (!framesOfTab)
    frames.set(tab, (framesOfTab = {}));

  framesOfTab[frameId] = {url: url, parent: parentFrameId};
}

function getFrameData(tab, frameId)
{
  var framesOfTab = frames.get(tab);

  if (framesOfTab)
  {
    if (frameId in framesOfTab)
      return framesOfTab[frameId];

    // We don't know anything about javascript: or data: frames, use top frame
    if (frameId != -1)
      return framesOfTab[0];
  }
}

function getFrameUrl(tab, frameId)
{
  var frameData = getFrameData(tab, frameId);
  return (frameData ? frameData.url : null);
}

function checkRequest(type, tab, url, frameId)
{
  if (isFrameWhitelisted(tab, frameId))
    return false;

  var documentUrl = getFrameUrl(tab, frameId);
  if (!documentUrl)
    return false;

  var requestHost = extractHostFromURL(url);
  var documentHost = extractHostFromURL(documentUrl);
  var thirdParty = isThirdParty(requestHost, documentHost);
  return defaultMatcher.matchesAny(url, type, documentHost, thirdParty);
}

function isFrameWhitelisted(tab, frameId, type)
{
  var parent = frameId;
  var parentData = getFrameData(tab, parent);
  while (parentData)
  {
    var frame = parent;
    var frameData = parentData;

    parent = frameData.parent;
    parentData = getFrameData(tab, parent);

    var frameUrl = frameData.url;
    var parentUrl = (parentData ? parentData.url : frameUrl);
    if ("keyException" in frameData || isWhitelisted(frameUrl, parentUrl, type))
      return true;
  }
  return false;
}

ext.webRequest.onBeforeRequest.addListener(onBeforeRequest, ["http://*/*", "https://*/*"]);

if (require("info").platform == "chromium")
{
  function onHeadersReceived(details)
  {
    if (details.tabId == -1)
      return;

    var type = details.type;
    if (type != "main_frame" && type != "sub_frame")
      return;

    var tab = new Tab({id: details.tabId});
    var url = getFrameUrl(tab, details.frameId);
    if (url != details.url)
      return;

    var key = null;
    var signature = null;
    for (var i = 0; i < details.responseHeaders.length; i++)
    {
      var header = details.responseHeaders[i];
      if (header.name.toLowerCase() == "x-adblock-key" && header.value)
      {
        var index = header.value.indexOf("_");
        if (index >= 0)
        {
          key = header.value.substr(0, index);
          signature = header.value.substr(index + 1);
          break;
        }
      }
    }
    if (!key)
      return;

    var parentUrl = null;
    if (type == "sub_frame")
      parentUrl = getFrameUrl(tab, details.parentFrameId);
    if (!parentUrl)
      parentUrl = url;
    var docDomain = extractHostFromURL(parentUrl);
    var keyMatch = defaultMatcher.matchesByKey(url, key.replace(/=/g, ""), docDomain);
    if (keyMatch)
    {
      // Website specifies a key that we know but is the signature valid?
      var uri = new URI(url);
      var host = uri.asciiHost;
      if (uri.port > 0)
        host += ":" + uri.port;

      var params = [
        uri.path.replace(/#.*/, ""),  // REQUEST_URI
        host,                         // HTTP_HOST
        window.navigator.userAgent    // HTTP_USER_AGENT
      ];
      if (verifySignature(key, signature, params.join("\0")))
        frames.get(tab)[details.frameId].keyException = true;
    }
  }

  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {urls: ["http://*/*", "https://*/*"]}, ["responseHeaders"]);
}
