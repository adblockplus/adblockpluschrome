chrome.experimental.webRequest.onBeforeRequest.addListener(onBeforeRequest, {}, ["blocking"]);
chrome.experimental.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, {}, ["requestHeaders", "blocking"]);
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
    documentUrl = topUrl;

  return {cancel: processRequest(type, details.url, documentUrl, topUrl)};
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

// Primitive third-party check, needs to be replaced by something more elaborate
// later. This is a copy of the function in include.preload.js.
function isThirdParty(requestHost, documentHost)
{
  // Remove trailing dots
  requestHost = requestHost.replace(/\.+$/, "");
  documentHost = documentHost.replace(/\.+$/, "");

  // Extract domain name - leave IP addresses unchanged, otherwise leave only
  // the last two parts of the host name
  var documentDomain = documentHost
  if (!/^\d+(\.\d+)*$/.test(documentDomain) && /([^\.]+\.[^\.]+)$/.test(documentDomain))
    documentDomain = RegExp.$1;
  if (requestHost.length > documentDomain.length)
    return (requestHost.substr(requestHost.length - documentDomain.length - 1) != "." + documentDomain);
  else
    return (requestHost != documentDomain);
}

function processRequest(type, url, documentUrl, topUrl)
{
  if (topUrl)
  {
    // Ignore fragment identifier
    var index = topUrl.indexOf("#");
    if (index >= 0)
      topUrl = topUrl.substring(0, index);

    var topHost = extractDomainFromURL(topUrl);
    var whitelist = defaultMatcher.matchesAny(topUrl, "DOCUMENT", topHost, false);
    if (whitelist instanceof WhitelistFilter)
      return false;
    if (isDomainExcluded(topHost))
      return false;
  }

  if (!documentUrl)
    documentUrl = topUrl;

  var requestHost = extractDomainFromURL(url);
  var documentHost = extractDomainFromURL(documentUrl);
  var thirdParty = isThirdParty(requestHost, documentHost);
  var match = defaultMatcher.matchesAny(url, type, documentHost, thirdParty);
  return (match instanceof BlockingFilter);
}
