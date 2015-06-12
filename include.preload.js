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

function getURLsFromObjectElement(element)
{
  var url = element.getAttribute("data");
  if (url)
    return [url];

  for (var i = 0; i < element.children.length; i++)
  {
    var child = element.children[i];
    if (child.localName != "param")
      continue;

    var name = child.getAttribute("name");
    if (name != "movie"  && // Adobe Flash
        name != "source" && // Silverlight
        name != "src"    && // Real Media + Quicktime
        name != "FileName") // Windows Media
      continue;

    var value = child.getAttribute("value");
    if (!value)
      continue;

    return [value];
  }

  return [];
}

function getURLsFromAttributes(element)
{
  var urls = [];

  if (element.src)
    urls.push(element.src);

  if (element.srcset)
  {
    var candidates = element.srcset.split(",");
    for (var i = 0; i < candidates.length; i++)
    {
      var url = candidates[i].trim().replace(/\s+\S+$/, "");
      if (url)
        urls.push(url);
    }
  }

  return urls;
}

function getURLsFromMediaElement(element)
{
  var urls = getURLsFromAttributes(element);

  for (var i = 0; i < element.children.length; i++)
  {
    var child = element.children[i];
    if (child.localName == "source" || child.localName == "track")
      urls.push.apply(urls, getURLsFromAttributes(child));
  }

  if (element.poster)
    urls.push(element.poster);

  return urls;
}

function getURLsFromElement(element)
{
  var urls;
  switch (element.localName)
  {
    case "object":
      urls = getURLsFromObjectElement(element);
      break;

    case "video":
    case "audio":
    case "picture":
      urls = getURLsFromMediaElement(element);
      break;

    default:
      urls = getURLsFromAttributes(element);
      break;
  }

  for (var i = 0; i < urls.length; i++)
  {
    if (/^(?!https?:)[\w-]+:/i.test(urls[i]))
      urls.splice(i--, 1);
  }

  return urls;
}

function checkCollapse(element)
{
  var tag = element.localName;
  if (tag in typeMap)
  {
    // This element failed loading, did we block it?
    var urls = getURLsFromElement(element);
    if (urls.length == 0)
      return;

    ext.backgroundPage.sendMessage(
      {
        type: "should-collapse",
        urls: urls,
        mediatype: typeMap[tag],
        baseURL: document.location.href
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

  window.collapsing = true;
}

function checkSitekey()
{
  var attr = document.documentElement.getAttribute("data-adblockkey");
  if (attr)
    ext.backgroundPage.sendMessage({type: "add-sitekey", token: attr});
}

function getContentDocument(element)
{
  try
  {
    return element.contentDocument;
  }
  catch (e)
  {
    return null;
  }
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
    if (selector.indexOf(",") == -1)
    {
      result.push(prefix + selector);
      continue;
    }

    var start = 0;
    var sep = "";
    for (var j = 0; j < selector.length; j++)
    {
      var chr = selector[j];
      if (chr == "\\")
        j++;
      else if (chr == sep)
        sep = "";
      else if (sep == "")
      {
        if (chr == '"' || chr == "'")
          sep = chr;
        else if (chr == ",")
        {
          result.push(prefix + selector.substring(start, j));
          start = j + 1;
        }
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
  // Also, using shadow DOM causes issues on some Google websites,
  // including Goolgle Docs and Gmail (#1770, #2602).
  if ("createShadowRoot" in document.documentElement && !/\.google\.com$/.test(document.domain))
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

    if (/\bChrome\//.test(navigator.userAgent))
    {
      var contentDocument = getContentDocument(element);
      if (contentDocument)
      {
        var contentWindow = contentDocument.defaultView;
        if (contentDocument instanceof contentWindow.HTMLDocument)
        {
          // Prior to Chrome 37, content scripts cannot run in
          // dynamically created frames. Also on Chrome 37-40
          // document_start content scripts (like this one) don't
          // run either in those frames due to https://crbug.com/416907.
          // So we have to apply element hiding from the parent frame.
          if (!("init" in contentWindow))
            init(contentDocument);

          // Moreover, "load" and "error" events aren't dispatched for elements
          // in dynamically created frames due to https://crbug.com/442107.
          // So we also have to apply element collpasing from the parent frame.
          if (!contentWindow.collapsing)
            [].forEach.call(contentDocument.querySelectorAll(Object.keys(typeMap).join(",")), checkCollapse);
        }
      }
    }
  }, true);

  return updateStylesheet;
}

if (document instanceof HTMLDocument)
{
  checkSitekey();
  window.updateStylesheet = init(document);
}
