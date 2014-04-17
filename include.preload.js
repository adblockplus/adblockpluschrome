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

var SELECTOR_GROUP_SIZE = 20;

// Sets the currently used CSS rules for elemhide filters
function setElemhideCSSRules(selectors)
{
  if (selectors.length == 0)
    return;

  var style = document.createElement("style");
  style.setAttribute("type", "text/css");

  // Use Shadow DOM if available to don't mess with web pages
  // that rely on the order of their own <style> tags (#309)
  if ("webkitCreateShadowRoot" in document.documentElement)
  {
    var shadow = document.documentElement.webkitCreateShadowRoot();
    shadow.appendChild(document.createElement("shadow"));
    shadow.appendChild(style);

    try
    {
      document.querySelector("::content");

      for (var i = 0; i < selectors.length; i++)
        selectors[i] = "::content " + selectors[i];
    }
    catch (e)
    {
      for (var i = 0; i < selectors.length; i++)
        selectors[i] = "::-webkit-distributed(" + selectors[i] + ")";
    }
  }
  else
  {
    // Try to insert the style into the <head> tag, inserting directly under the
    // document root breaks dev tools functionality:
    // http://code.google.com/p/chromium/issues/detail?id=178109
    (document.head || document.documentElement).appendChild(style);
  }

  // WebKit apparently chokes when the selector list in a CSS rule is huge.
  // So we split the elemhide selectors into groups.
  for (var i = 0; selectors.length > 0; i++)
  {
    var selector = selectors.splice(0, SELECTOR_GROUP_SIZE).join(", ");
    style.sheet.insertRule(selector + " { display: none !important; }", i);
  }
}

var typeMap = {
  "img": "IMAGE",
  "input": "IMAGE",
  "audio": "MEDIA",
  "video": "MEDIA",
  "frame": "SUBDOCUMENT",
  "iframe": "SUBDOCUMENT"
};

function checkCollapse(event)
{
  var target = event.target;
  var tag = target.localName;
  var expectedEvent = (tag == "iframe" || tag == "frame" ? "load" : "error");
  if (tag in typeMap && event.type == expectedEvent)
  {
    // This element failed loading, did we block it?
    var url = target.src;
    if (!url)
      return;

    ext.backgroundPage.sendMessage(
      {
        type: "should-collapse",
        url: url,
        mediatype: typeMap[tag]
      },

      function(response)
      {
        if (response && target.parentNode)
        {
          // <frame> cannot be removed, doing that will mess up the frameset
          if (tag == "frame")
            target.style.setProperty("visibility", "hidden", "important");
          else
            target.style.setProperty("display", "none", "important");
        }
      }
    );
  }
}

function init()
{
  // Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
  if (!(document.documentElement instanceof HTMLElement))
    return;

  document.addEventListener("error", checkCollapse, true);
  document.addEventListener("load", checkCollapse, true);

  var attr = document.documentElement.getAttribute("data-adblockkey");
  if (attr)
    ext.backgroundPage.sendMessage({type: "add-key-exception", token: attr});

  ext.backgroundPage.sendMessage({type: "get-selectors"}, setElemhideCSSRules);
}

// In Chrome 18 the document might not be initialized yet
if (document.documentElement)
  init();
else
  window.setTimeout(init, 0);
