/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["http://*/*", "https://*/*"]}, ["blocking"]);
chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {urls: ["http://*/*", "https://*/*"]}, ["responseHeaders"]);
chrome.tabs.onRemoved.addListener(forgetTab);

var frames = {};

function onBeforeRequest(details)
{
  if (details.tabId == -1)
    return {};

  var type = details.type;
  if (type == "main_frame" || type == "sub_frame")
    recordFrame(details.tabId, details.frameId, details.parentFrameId, details.url);

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
    return {cancel: true};
  else
    return {};
}

function onHeadersReceived(details)
{
  if (details.tabId == -1)
    return;

  var type = details.type;
  if (type != "main_frame" && type != "sub_frame")
    return;

  var url = getFrameUrl(details.tabId, details.frameId);
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
        var key = header.value.substr(0, index);
        var signature = header.value.substr(index + 1);
        break;
      }
    }
  }
  if (!key)
    return;

  var parentUrl = null;
  if (type == "sub_frame")
    parentUrl = getFrameUrl(details.tabId, details.parentFrameId);
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
      frames[details.tabId][details.frameId].keyException = true;
  }
}

function recordFrame(tabId, frameId, parentFrameId, frameUrl)
{
  if (!(tabId in frames))
    frames[tabId] = {};
  frames[tabId][frameId] = {url: frameUrl, parent: parentFrameId};
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

function forgetTab(tabId)
{
  delete frames[tabId];
}

function checkRequest(type, tabId, url, frameId)
{
  if (isFrameWhitelisted(tabId, frameId))
    return false;

  var documentUrl = getFrameUrl(tabId, frameId);
  if (!documentUrl)
    return false;

  var requestHost = extractHostFromURL(url);
  var documentHost = extractHostFromURL(documentUrl);
  var thirdParty = isThirdParty(requestHost, documentHost);
  var filter = defaultMatcher.matchesAny(url, type, documentHost, thirdParty);

  if (filter instanceof BlockingFilter)
  {
    var collapse = filter.collapse;
    if (collapse == null)
      collapse = (localStorage["hidePlaceholders"] != "false");
    if (collapse && (type == "SUBDOCUMENT" || type == "IMAGE"))
    {
      chrome.tabs.sendMessage(tabId, {
        reqtype: "hide-element",
        type: type,
        url: url,
        documentUrl: documentUrl
      });
    }
  }

  return filter;
}

function isFrameWhitelisted(tabId, frameId, type)
{
  var parent = frameId;
  while (parent != -1)
  {
    var parentUrl = getFrameUrl(tabId, parent);
    if (parentUrl && isWhitelisted(parentUrl, type))
      return true;
    if (parentUrl && "keyException" in frames[tabId][frameId])
      return true;
    parent = getFrameParent(tabId, parent);
  }
  return false;
}
