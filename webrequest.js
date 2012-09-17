/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["http://*/*", "https://*/*"]}, ["blocking"]);
chrome.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, {urls: ["http://*/*", "https://*/*"]}, ["requestHeaders", "blocking"]);
chrome.tabs.onRemoved.addListener(forgetTab);

var frames = {};
var tabs = {};

function onBeforeRequest(details)
{
  if (details.tabId == -1)
    return {};

  var type = details.type;
  if (type == "main_frame" || type == "sub_frame")
    recordFrame(details.tabId, details.frameId, details.parentFrameId, details.url, type == "main_frame");

  if (type == "main_frame")
    return {};

  // Type names match Mozilla's with main_frame and sub_frame being the only exceptions.
  if (type == "sub_frame")
    type = "SUBDOCUMENT";
  else
    type = type.toUpperCase();

  var frame = (type != "SUBDOCUMENT" ? details.frameId : details.parentFrameId);
  var filter = checkRequest(type, details.tabId, details.url, frame);
  if (filter instanceof BlockingFilter)
  {
    var collapse = filter.collapse;
    if (collapse == null)
      collapse = (localStorage["hidePlaceholders"] != "false");
    if (collapse && type == "SUBDOCUMENT")
      return {redirectUrl: "about:blank"};
    else if (collapse && type == "IMAGE")
      return {redirectUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="};
    else
      return {cancel: true};
  }
  else
    return {};
}

function onBeforeSendHeaders(details)
{
  var match = defaultMatcher.matchesAny(details.url, "DONOTTRACK", null, false);
  if (match && match instanceof BlockingFilter)
  {
    var headers = details.requestHeaders || [];
    if (!headers.some(function(header) { header.name == "DNT";}))
    {
      headers.push({name: "DNT", value: "1"});
      return {requestHeaders: headers};
    }
  }
  return null;
}

function recordFrame(tabId, frameId, parentFrameId, frameUrl, isMain)
{
  if (!(tabId in frames))
    frames[tabId] = {};
  frames[tabId][frameId] = {url: frameUrl, parent: parentFrameId};

  if (isMain)
    tabs[tabId] = frameUrl;
}

function getFrameUrl(tabId, frameId)
{
  if (tabId in frames && frameId in frames[tabId])
    return frames[tabId][frameId].url;
  return null;
}

function getFrameParent(tabId, frameId)
{
  if (tabId in frames && frameId in frames[tabId])
    return frames[tabId][frameId].parent;
  return -1;
}

function getTabUrl(tabId)
{
  if (tabId in tabs)
    return tabs[tabId];
  return null;
}

function forgetTab(tabId)
{
  delete frames[tabId];
  delete tabs[tabId];
}

function checkRequest(type, tabId, url, frame)
{
  var documentUrl;
  var parent = frame;
  while (parent != -1)
  {
    var parentUrl = getFrameUrl(tabId, parent);
    if (typeof documentUrl == "undefined")
      documentUrl = parentUrl;
    if (parentUrl && isWhitelisted(parentUrl))
      return false;
    parent = getFrameParent(tabId, parent);
  }

  if (!documentUrl)
  {
    documentUrl = getTabUrl(tabId);
    if (documentUrl && isWhitelisted(parentUrl))
      return false;
  }

  var requestHost = extractHostFromURL(url);
  var documentHost = extractHostFromURL(documentUrl);
  var thirdParty = isThirdParty(requestHost, documentHost);
  return defaultMatcher.matchesAny(url, type, documentHost, thirdParty);
}
