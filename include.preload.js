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

var SELECTOR_GROUP_SIZE = 20;

var typeMap = {
  "img": "IMAGE",
  "input": "IMAGE",
  "picture": "IMAGE",
  "audio": "MEDIA",
  "video": "MEDIA",
  "frame": "SUBDOCUMENT",
  "iframe": "SUBDOCUMENT",
  "object": "OBJECT",
  "embed": "OBJECT"
};

function checkCollapse(element)
{
  var tag = element.localName;
  if (tag in typeMap)
  {
    // This element failed loading, did we block it?
    var url = element.src;
    if (!url || !/^https?:/i.test(url))
      return;

    ext.backgroundPage.sendMessage(
      {
        type: "should-collapse",
        url: url,
        mediatype: typeMap[tag]
      },

      function(response)
      {
        if (response && element.parentNode)
        {
          var property = "display";
          var value = "none";

          // <frame> cannot be removed, doing that will mess up the frameset
          if (tag == "frame")
          {
            property = "visibility";
            value = "hidden";
          }

          // <input type="image"> elements try to load their image again
          // when the "display" CSS property is set. So we have to check
          // that it isn't already collapsed to avoid an infinite recursion.
          if (element.style.getPropertyValue(property) != value ||
              element.style.getPropertyPriority(property) != "important")
            element.style.setProperty(property, value, "important");
        }
      }
    );
  }
}

function checkSitekey()
{
  var attr = document.documentElement.getAttribute("data-adblockkey");
  if (attr)
    ext.backgroundPage.sendMessage({type: "add-sitekey", token: attr});
}

function isFrameWithoutContentScript(element)
{
  var contentDocument;
  try
  {
    contentDocument = element.contentDocument;
  }
  catch (e)
  {
    // This is a third-party frame. Hence we can't access it.
    // But that's fine, our content script should already run there.
    return false;
  }

  // The element isn't a <frame>, <iframe> or <object> with "data" attribute.
  if (!contentDocument)
    return false;

  // Return true, if the element is a first-party frame which doesn't
  // have this function, hence our content script isn't running there.
  // Those are dynamically created frames as well as frames
  // with "about:blank", "about:srcdoc" and "javascript:" URL.
  return !("isFrameWithoutContentScript" in contentDocument.defaultView);
}

function reinjectRulesWhenRemoved(document, style)
{
  var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
  if (!MutationObserver)
    return;

  var observer = new MutationObserver(function(mutations)
  {
    var isStyleRemoved = false;
    for (var i = 0; i < mutations.length; i++)
    {
      if ([].indexOf.call(mutations[i].removedNodes, style) != -1)
      {
        isStyleRemoved = true;
        break;
      }
    }
    if (!isStyleRemoved)
      return;

    observer.disconnect();

    var n = document.styleSheets.length;
    if (n == 0)
      return;

    var stylesheet = document.styleSheets[n - 1];
    ext.backgroundPage.sendMessage(
      {type: "get-selectors"},

      function(selectors)
      {
        while (selectors.length > 0)
        {
          var selector = selectors.splice(0, SELECTOR_GROUP_SIZE).join(", ");

          // Using non-standard addRule() here. This is the only way
          // to add rules at the end of a cross-origin stylesheet
          // because we don't know how many rules are already in there
          stylesheet.addRule(selector, "display: none !important;");
        }
      }
    );
  });

  observer.observe(style.parentNode, {childList: true});
  return observer;
}

function convertSelectorsForShadowDOM(selectors)
{
  var result = [];
  var prefix = "::content ";

  for (var i = 0; i < selectors.length; i++)
  {
    var selector = selectors[i];
    var start = 0;
    var sep = "";

    for (var j = 0; j < selector.length; j++)
    {
      var chr = selector[j];
      if (chr == "\\")
        j++;
      else if (chr == sep)
        sep = "";
      else if (chr == '"' || chr == "'")
        sep = chr;
      else if (chr == "," && sep == "")
      {
        result.push(prefix + selector.substring(start, j));
        start = j + 1;
      }
    }

    result.push(prefix + selector.substring(start));
  }

  return result;
}

function init(document)
{
  var shadow = null;
  var style = null;
  var observer = null;

  // Use Shadow DOM if available to don't mess with web pages that rely on
  // the order of their own <style> tags (#309).
  //
  // However, creating a shadow root breaks running CSS transitions. So we
  // have to create the shadow root before transistions might start (#452).
  //
  // Also, we can't use shadow DOM on Google Docs, since it breaks printing
  // there (#1770).
  if ("createShadowRoot" in document.documentElement && document.domain != "docs.google.com")
  {
    shadow = document.documentElement.createShadowRoot();
    shadow.appendChild(document.createElement("shadow"));
  }

  var updateStylesheet = function(reinject)
  {
    ext.backgroundPage.sendMessage({type: "get-selectors"}, function(selectors)
    {
      if (observer)
      {
        observer.disconnect();
        observer = null;
      }

      if (style && style.parentElement)
      {
        style.parentElement.removeChild(style);
        style = null;
      }

      if (selectors.length > 0)
      {
        // Create <style> element lazily, only if we add styles. Add it to
        // the shadow DOM if possible. Otherwise fallback to the <head> or
        // <html> element. If we have injected a style element before that
        // has been removed (the sheet property is null), create a new one.
        style = document.createElement("style");
        (shadow || document.head || document.documentElement).appendChild(style);

        // It can happen that the frame already navigated to a different
        // document while we were waiting for the background page to respond.
        // In that case the sheet property will stay null, after addind the
        // <style> element to the shadow DOM.
        if (style.sheet)
        {
          // If using shadow DOM, we have to add the ::content pseudo-element
          // before each selector, in order to match elements within the
          // insertion point.
          if (shadow)
            selectors = convertSelectorsForShadowDOM(selectors);

          // WebKit (and Blink?) apparently chokes when the selector list in a
          // CSS rule is huge. So we split the elemhide selectors into groups.
          for (var i = 0; selectors.length > 0; i++)
          {
            var selector = selectors.splice(0, SELECTOR_GROUP_SIZE).join(", ");
            style.sheet.insertRule(selector + " { display: none !important; }", i);
          }
        }

        observer = reinjectRulesWhenRemoved(document, style);
      }
    });
  };

  updateStylesheet();

  document.addEventListener("error", function(event)
  {
    checkCollapse(event.target);
  }, true);

  document.addEventListener("load", function(event)
  {
    var element = event.target;

    if (/^i?frame$/.test(element.localName))
      checkCollapse(element);

    // prior to Chrome 37, content scripts cannot run on about:blank,
    // about:srcdoc and javascript: URLs. Moreover, as of Chrome 40
    // "load" and "error" events aren't dispatched there. So we have
    // to apply element hiding and collapsing from the parent frame.
    if (/\bChrome\//.test(navigator.userAgent) && isFrameWithoutContentScript(element))
    {
      init(element.contentDocument);

      for (var tagName in typeMap)
        Array.prototype.forEach.call(element.contentDocument.getElementsByTagName(tagName), checkCollapse);
    }
  }, true);

  return updateStylesheet;
}

if (document instanceof HTMLDocument)
{
  checkSitekey();
  window.updateStylesheet = init(document);
}
