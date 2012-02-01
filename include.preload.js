/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var isExperimental;

var TagToType = {
  "SCRIPT": "SCRIPT",
  "IMG": "IMAGE",
  "LINK": "STYLESHEET",
  "OBJECT": "OBJECT",
  "EMBED": "OBJECT",
  "IFRAME": "SUBDOCUMENT"
};

var hostDomain = null;

var SELECTOR_GROUP_SIZE = 20;

var savedBeforeloadEvents = new Array();

var elemhideElt = null;

// Sets the currently used CSS rules for elemhide filters
function setElemhideCSSRules(selectors)
{
  if (elemhideElt && elemhideElt.parentNode)
    elemhideElt.parentNode.removeChild(elemhideElt);

  if (!selectors)
    return;

  elemhideElt = document.createElement("link");
  elemhideElt.setAttribute("rel", "stylesheet");
  elemhideElt.setAttribute("type", "text/css");
  elemhideElt.setAttribute("href", "about:");
  document.documentElement.appendChild(elemhideElt);

  var elt = elemhideElt;  // Use a local variable to avoid racing conditions
  function setRules()
  {
    if (!elt.sheet)
    {
      // Stylesheet didn't initialize yet, wait a little longer
      window.setTimeout(setRules, 0);
      return;
    }

    // WebKit apparently chokes when the selector list in a CSS rule is huge.
    // So we split the elemhide selectors into groups.
    for (var i = 0, j = 0; i < selectors.length; i += SELECTOR_GROUP_SIZE, j++)
    {
      var selector = selectors.slice(i, i + SELECTOR_GROUP_SIZE).join(", ");
      elt.sheet.insertRule(selector + " { display: none !important; }", j);
    }
  }
  setRules();
}

// Hides a single element
function nukeSingleElement(elt) {
  if(elt.innerHTML)
    elt.innerHTML = "";
  if(elt.innerText)
    elt.innerText = "";
  elt.style.display = "none";
  elt.style.visibility = "hidden";
  // If this is a LINK tag, it's probably a stylesheet, so disable it. Actually removing
  // it seems to intermittently break page rendering.
  if(elt.localName && elt.localName.toUpperCase() == "LINK")
    elt.setAttribute("disabled", "");
}

// This function Copyright (c) 2008 Jeni Tennison, from jquery.uri.js
// and licensed under the MIT license. See jquery-*.min.js for details.
function removeDotSegments(u) {
  var r = '', m = [];
  if (/\./.test(u)) {
    while (u !== undefined && u !== '') {
      if (u === '.' || u === '..') {
        u = '';
      } else if (/^\.\.\//.test(u)) { // starts with ../
        u = u.substring(3);
      } else if (/^\.\//.test(u)) { // starts with ./
        u = u.substring(2);
      } else if (/^\/\.(\/|$)/.test(u)) { // starts with /./ or consists of /.
        u = '/' + u.substring(3);
      } else if (/^\/\.\.(\/|$)/.test(u)) { // starts with /../ or consists of /..
        u = '/' + u.substring(4);
        r = r.replace(/\/?[^\/]+$/, '');
      } else {
        m = u.match(/^(\/?[^\/]*)(\/.*)?$/);
        u = m[2];
        r = r + m[1];
      }
    }
    return r;
  } else {
    return u;
  }
}

// Does some degree of URL normalization
function normalizeURL(url)
{
  var components = url.match(/(.+:\/\/.+?)\/(.*)/);
  if(!components)
    return url;
  var newPath = removeDotSegments(components[2]);
  if(newPath.length == 0)
    return components[1];
  if(newPath[0] != '/')
    newPath = '/' + newPath;
  return components[1] + newPath;
}

// Converts relative to absolute URL
// e.g.: foo.swf on http://example.com/whatever/bar.html
//  -> http://example.com/whatever/foo.swf
function relativeToAbsoluteUrl(url) {
  // If URL is already absolute, don't mess with it
  if(!url || url.match(/^http/i))
    return url;
  // Leading / means absolute path
  if(url[0] == '/') {
    return document.location.protocol + "//" + document.location.host + url;
  }
  // Remove filename and add relative URL to it
  var base = document.baseURI.match(/.+\//);
  if(!base)
    return document.baseURI + "/" + url;
  return base[0] + url;
}

// Extracts a domain name from a URL
function extractDomainFromURL(url)
{
  if(!url)
    return "";

  var x = url.substr(url.indexOf("://") + 3);
  x = x.substr(0, x.indexOf("/"));
  x = x.substr(x.indexOf("@") + 1);
  if (x.indexOf("[") == 0 && x.indexOf("]") > 0)
  {
    x = x.substring(1,x.indexOf("]"));
  }
  else
  {
    colPos = x.indexOf(":");
    if (colPos >= 0)
      x = x.substr(0, colPos);
  }
  return x;
}

/**
 * Checks whether a request is third party for the current document, uses
 * our effective document domain as received by the background process.
 */
function isThirdParty(requestHost)
{
  if (!hostDomain)
    return true;

  // Remove trailing dots
  requestHost = requestHost.replace(/\.+$/, "");

  if (requestHost.length > hostDomain.length)
    return (requestHost.substr(requestHost.length - hostDomain.length - 1) != "." + hostDomain);
  else
    return (requestHost != hostDomain);
}

// This beforeload handler is used before we hear back from the background process about
// whether we're enabled etc. It saves the events so we can replay them to the normal
// beforeload handler once we know whether we're enabled - to catch ads that might have
// snuck by.
function saveBeforeloadEvent(e) {
  savedBeforeloadEvents.push(e);
}

/**
 * Tests whether a request needs to be blocked.
 */
function shouldBlock(/**String*/ url, /**String*/ type)
{
  var url = relativeToAbsoluteUrl(url);
  var requestHost = extractDomainFromURL(url);
  var thirdParty = isThirdParty(requestHost);
  var match = defaultMatcher.matchesAny(url, type, window.location.hostname, thirdParty);
  return (match && match instanceof BlockingFilter);
}

/**
 * Responds to beforeload events by preventing load and nuking the element if
 * it's an ad.
 */
function beforeloadHandler(/**Event*/ e)
{
  if (shouldBlock(e.url, TagToType[e.target.localName.toUpperCase()]))
  {
    e.preventDefault();
    if (e.target)
      nukeSingleElement(e.target);
  }
}

function sendRequests()
{
  // Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
  if (!(document.documentElement instanceof HTMLElement))
    return;

  // Blocking from content script is unnecessary in experimental builds, it is
  // done though webRequest API.
  if (isExperimental != true)
  {
    chrome.extension.sendRequest({reqtype: "get-settings", matcher: true, host: window.location.hostname}, function(response)
    {
      document.removeEventListener("beforeload", saveBeforeloadEvent, true);

      if (response.enabled)
      {
        hostDomain = response.hostDomain;
        defaultMatcher.fromCache(JSON.parse(response.matcherData));

        document.addEventListener("beforeload", beforeloadHandler, true);

        // Replay the events that were saved while we were waiting to learn whether we are enabled
        for(var i = 0; i < savedBeforeloadEvents.length; i++)
          beforeloadHandler(savedBeforeloadEvents[i]);
      }
      delete savedBeforeloadEvents;
    });
  }

  chrome.extension.sendRequest({reqtype: "get-settings", selectors: true, host: window.location.hostname}, function(response)
  {
    setElemhideCSSRules(response.selectors);
  });
}

if (isExperimental != true)
  document.addEventListener("beforeload", saveBeforeloadEvent, true);

// In Chrome 18 the document might not be initialized yet
if (document.documentElement)
  sendRequests();
else
  window.setTimeout(sendRequests, 0);
