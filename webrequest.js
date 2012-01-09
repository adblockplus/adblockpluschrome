/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["http://*/*", "https://*/*"]}, ["blocking"]);
webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, {urls: ["http://*/*", "https://*/*"]}, ["requestHeaders", "blocking"]);
webRequest.onErrorOccurred.addListener(onErrorOccurred, {urls: ["http://*/*", "https://*/*"]});
chrome.tabs.onRemoved.addListener(forgetTab);

var frames = {};
var tabs = {};

function onBeforeRequest(details)
{
  var type = details.type;
  if (type == "main_frame" || type == "sub_frame")
    recordFrame(details.tabId, details.frameId, details.url, type == "main_frame");

  if (type == "main_frame")
    return;

  // Type names match Mozilla's with main_frame and sub_frame being the only exceptions.
  if (type == "sub_frame")
    type = "SUBDOCUMENT";
  else
    type = type.toUpperCase();

  var documentUrl = getFrameUrl(details.tabId, details.frameId);
  var topUrl = getTabUrl(details.tabId);
  if (type == "SUBDOCUMENT")
    documentUrl = getFrameUrl(details.tabId, details.parentFrameId) || topUrl;

  var filter = checkRequest(type, details.url, documentUrl, topUrl);
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

function recordFrame(tabId, frameId, frameUrl, isMain)
{
  if (!(tabId in frames))
    frames[tabId] = {};
  frames[tabId][frameId] = frameUrl;

  if (isMain)
    tabs[tabId] = frameUrl;
}

function getFrameUrl(tabId, frameId)
{
  if (tabId in frames && frameId in frames[tabId])
    return frames[tabId][frameId];
  return null;
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

/**
 * Checks whether a request is third party for the given document, uses
 * information from the public suffix list to determine the effective domain
 * name for the document.
 */
function isThirdParty(requestHost, documentHost)
{
  // Remove trailing dots
  requestHost = requestHost.replace(/\.+$/, "");
  documentHost = documentHost.replace(/\.+$/, "");

  // Extract domain name - leave IP addresses unchanged, otherwise leave only base domain
  var documentDomain = getBaseDomain(documentHost);
  if (requestHost.length > documentDomain.length)
    return (requestHost.substr(requestHost.length - documentDomain.length - 1) != "." + documentDomain);
  else
    return (requestHost != documentDomain);
}

function checkRequest(type, url, documentUrl, topUrl)
{
  if (topUrl && isWhitelisted(topUrl))
    return false;

  if (!documentUrl)
    documentUrl = topUrl;

  var requestHost = extractDomainFromURL(url);
  var documentHost = extractDomainFromURL(documentUrl);
  var thirdParty = isThirdParty(requestHost, documentHost);
  return defaultMatcher.matchesAny(url, type, documentHost, thirdParty);
}

function onErrorOccurred(details)
{
  console.log(details);
}
