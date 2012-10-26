/*
 * This file is part of the Adblock Plus extension,
 * Copyright (C) 2006-2012 Eyeo GmbH
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

var SELECTOR_GROUP_SIZE = 20;

var elemhideElt = null;

// Sets the currently used CSS rules for elemhide filters
function setElemhideCSSRules(selectors)
{
  if (elemhideElt && elemhideElt.parentNode)
    elemhideElt.parentNode.removeChild(elemhideElt);

  if (!selectors)
    return;

  elemhideElt = document.createElement("style");
  elemhideElt.setAttribute("type", "text/css");
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

function sendRequests()
{
  // Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
  if (!(document.documentElement instanceof HTMLElement))
    return;

  chrome.extension.onMessage.addListener(function(request, sender, sendResponse)
  {
    switch (request.reqtype)
    {
      case "hide-element":
        if (request.documentUrl != document.URL)
          return;

        // We have little way of knowing which element was blocked - see
        // http://code.google.com/p/chromium/issues/detail?id=97392. Have to
        // look through all of them and try to find the right one.
        var remove = [];
        var elements = (request.type == "IMAGE" ? document.images : document.getElementsByTagName("iframe"));
        for (var i = 0, l = elements.length; i < l; i++)
          if (elements[i].src == request.url)
            remove.push(elements[i]);

        for (var i = 0, l = remove.length; i < l; i++)
          if (remove[i].parentNode)
            remove[i].parentNode.removeChild(remove[i]);
    }
  });

  chrome.extension.sendRequest({reqtype: "get-settings", selectors: true, frameUrl: window.location.href}, function(response)
  {
    setElemhideCSSRules(response.selectors);
  });
}

// In Chrome 18 the document might not be initialized yet
if (document.documentElement)
  sendRequests();
else
  window.setTimeout(sendRequests, 0);
