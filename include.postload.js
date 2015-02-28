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

// Click-to-hide stuff
var clickHide_activated = false;
var clickHide_filters = null;
var currentElement = null;
var highlightedElementsSelector = null;
var clickHideFiltersDialog = null;
var lastRightClickEvent = null;
var lastRightClickEventValid = false;

function highlightElement(element, shadowColor, backgroundColor)
{
  unhighlightElement(element);

  var highlightWithOverlay = function()
  {
    var overlay = addElementOverlay(element);

    // If the element isn't displayed no overlay will be added.
    // Moreover, we don't need to highlight anything then.
    if (!overlay)
      return;

    highlightElement(overlay, shadowColor, backgroundColor);
    overlay.style.pointerEvents = "none";

    element._unhighlight = function()
    {
      overlay.parentNode.removeChild(overlay);
    };
  };

  var highlightWithStyleAttribute = function()
  {
    var originalBoxShadow = element.style.getPropertyValue("box-shadow");
    var originalBoxShadowPriority = element.style.getPropertyPriority("box-shadow");
    var originalBackgroundColor = element.style.getPropertyValue("background-color");
    var originalBackgroundColorPriority = element.style.getPropertyPriority("background-color");

    element.style.setProperty("box-shadow", "inset 0px 0px 5px " + shadowColor, "important");
    element.style.setProperty("background-color", backgroundColor, "important");

    element._unhighlight = function()
    {
      this.style.removeProperty("box-shadow");
      this.style.setProperty(
        "box-shadow",
        originalBoxShadow,
        originalBoxShadowPriority
      );

      this.style.removeProperty("background-color");
      this.style.setProperty(
        "background-color",
        originalBackgroundColor,
        originalBackgroundColorPriority
      );
    };
  };

  if ("prisoner" in element)
    highlightWithStyleAttribute();
  else
    highlightWithOverlay();
}


function unhighlightElement(element)
{
  if ("_unhighlight" in element)
  {
    element._unhighlight();
    delete element._unhighlight;
  }
}

// Highlight elements according to selector string. This would include
// all elements that would be affected by proposed filters.
function highlightElements(selectorString) {
  unhighlightElements();

  var highlightedElements = document.querySelectorAll(selectorString);
  highlightedElementsSelector = selectorString;

  for(var i = 0; i < highlightedElements.length; i++)
    highlightElement(highlightedElements[i], "#fd6738", "#f6e1e5");
}

// Unhighlight all elements, including those that would be affected by
// the proposed filters
function unhighlightElements() {
  if (highlightedElementsSelector)
  {
    Array.prototype.forEach.call(
      document.querySelectorAll(highlightedElementsSelector),
      unhighlightElement
    );

    highlightedElementsSelector = null;
  }
}

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

function getURLsFromElement(element) {
  switch (element.localName)
  {
    case "object":
      return getURLsFromObjectElement(element);

    case "video":
    case "audio":
    case "picture":
      return getURLsFromMediaElement(element);
  }

  return getURLsFromAttributes(element);
}

function isBlockable(element)
{
  if (element.id)
    return true;
  if (element.classList.length > 0)
    return true;
  if (getURLsFromElement(element).length > 0)
    return true;

  // We only generate filters based on the "style" attribute,
  // if this is the only way we can generate a filter, and
  // only if there are at least two CSS properties defined.
  if (/:.+:/.test(element.getAttribute("style")))
    return true;

  return false;
}

// Adds an overlay to an element, which is probably a Flash object
function addElementOverlay(elt) {
  var zIndex = "auto";
  var position = "absolute";

  for (var e = elt; e; e = e.parentElement)
  {
    var style = getComputedStyle(e);

    // If the element isn't rendered (since its or one of its ancestor's
    // "display" property is "none"), the overlay wouldn't match the element.
    if (style.display == "none")
      return null;

    // If the element or one of its ancestors uses fixed postioning, the overlay
    // has to use fixed postioning too. Otherwise it might not match the element.
    if (style.position == "fixed")
      position = "fixed";

    // Determine the effective z-index, which is the highest z-index used
    // by the element and its offset ancestors, and increase it by one.
    // When using a lower z-index the element would cover the overlay.
    // When using a higher z-index the overlay might also cover other elements.
    if (style.position != "static" && style.zIndex != "auto")
    {
      var curZIndex = parseInt(style.zIndex, 10) + 1;

      if (zIndex == "auto" || curZIndex > zIndex)
        zIndex = curZIndex;
    }
  }

  var overlay = document.createElement('div');
  overlay.prisoner = elt;
  overlay.className = "__adblockplus__overlay";
  overlay.setAttribute('style', 'opacity:0.4; display:inline-box; overflow:hidden; box-sizing:border-box;');
  var rect = elt.getBoundingClientRect();
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.style.left = (rect.left + window.scrollX) + "px";
  overlay.style.top = (rect.top + window.scrollY) + "px";
  overlay.style.position = position;
  overlay.style.zIndex = zIndex;

  // elt.parentNode.appendChild(overlay, elt);
  document.documentElement.appendChild(overlay);
  return overlay;
}

// Show dialog asking user whether she wants to add the proposed filters derived
// from selected page element
function clickHide_showDialog(left, top, filters)
{
  // If we are already selecting, abort now
  if (clickHide_activated || clickHideFiltersDialog)
    clickHide_deactivate(true);

  clickHide_filters = filters;

  clickHideFiltersDialog = document.createElement("iframe");
  clickHideFiltersDialog.src = ext.getURL("block.html");
  clickHideFiltersDialog.setAttribute("style", "position: fixed !important; visibility: hidden; display: block !important; border: 0px !important;");
  clickHideFiltersDialog.style.WebkitBoxShadow = "5px 5px 20px rgba(0,0,0,0.5)";
  clickHideFiltersDialog.style.zIndex = 0x7FFFFFFF;

  // Position in upper-left all the time
  clickHideFiltersDialog.style.left = "50px";
  clickHideFiltersDialog.style.top = "50px";

  // Make dialog partly transparent when mouse isn't over it so user has a better
  // view of what's going to be blocked
  clickHideFiltersDialog.onmouseout = function()
  {
    if (clickHideFiltersDialog)
      clickHideFiltersDialog.style.setProperty("opacity", "0.7");
  };
  clickHideFiltersDialog.onmouseover = function()
  {
    if (clickHideFiltersDialog)
      clickHideFiltersDialog.style.setProperty("opacity", "1.0");
  };

  document.documentElement.appendChild(clickHideFiltersDialog);
}

// Turn on the choose element to create filter thing
function clickHide_activate() {
  if(document == null)
    return;

  // If we are already selecting, abort now
  if (clickHide_activated || clickHideFiltersDialog)
    clickHide_deactivate();

  // Add overlays for blockable elements that don't emit mouse events,
  // so that they can still be selected.
  var elts = document.querySelectorAll('object,embed,iframe,frame');
  for(var i=0; i<elts.length; i++)
  {
    var element = elts[i];
    if (isBlockable(element))
      addElementOverlay(element);
  }

  clickHide_activated = true;
  document.addEventListener("mousedown", clickHide_stopPropagation, true);
  document.addEventListener("mouseup", clickHide_stopPropagation, true);
  document.addEventListener("mouseenter", clickHide_stopPropagation, true);
  document.addEventListener("mouseleave", clickHide_stopPropagation, true);
  document.addEventListener("mouseover", clickHide_mouseOver, true);
  document.addEventListener("mouseout", clickHide_mouseOut, true);
  document.addEventListener("click", clickHide_mouseClick, true);
  document.addEventListener("keydown", clickHide_keyDown, true);

  ext.onExtensionUnloaded.addListener(clickHide_deactivate);
}

// Called when user has clicked on something and we are waiting for confirmation
// on whether the user actually wants these filters
function clickHide_rulesPending() {
  clickHide_activated = false;
  document.removeEventListener("mousedown", clickHide_stopPropagation, true);
  document.removeEventListener("mouseup", clickHide_stopPropagation, true);
  document.removeEventListener("mouseenter", clickHide_stopPropagation, true);
  document.removeEventListener("mouseleave", clickHide_stopPropagation, true);
  document.removeEventListener("mouseover", clickHide_mouseOver, true);
  document.removeEventListener("mouseout", clickHide_mouseOut, true);
  document.removeEventListener("click", clickHide_mouseClick, true);
  document.removeEventListener("keydown", clickHide_keyDown, true);
}

// Turn off click-to-hide
function clickHide_deactivate(keepOverlays)
{
  if (clickHideFiltersDialog)
  {
    document.documentElement.removeChild(clickHideFiltersDialog);
    clickHideFiltersDialog = null;
  }

  clickHide_activated = false;
  clickHide_filters = null;
  if(!document)
    return; // This can happen inside a nuked iframe...I think

  document.removeEventListener("mousedown", clickHide_stopPropagation, true);
  document.removeEventListener("mouseup", clickHide_stopPropagation, true);
  document.removeEventListener("mouseenter", clickHide_stopPropagation, true);
  document.removeEventListener("mouseleave", clickHide_stopPropagation, true);
  document.removeEventListener("mouseover", clickHide_mouseOver, true);
  document.removeEventListener("mouseout", clickHide_mouseOut, true);
  document.removeEventListener("click", clickHide_mouseClick, true);
  document.removeEventListener("keydown", clickHide_keyDown, true);

  if (keepOverlays !== true)
  {
    lastRightClickEvent = null;

    if (currentElement) {
      currentElement.removeEventListener("contextmenu",  clickHide_elementClickHandler, true);
      unhighlightElements();
      unhighlightElement(currentElement);
      currentElement = null;
    }
    unhighlightElements();

    var overlays = document.getElementsByClassName("__adblockplus__overlay");
    while (overlays.length > 0)
      overlays[0].parentNode.removeChild(overlays[0]);

    ext.onExtensionUnloaded.removeListener(clickHide_deactivate);
  }
}

function clickHide_stopPropagation(e)
{
  e.stopPropagation();
}

function clickHide_elementClickHandler(e) {
  e.preventDefault();
  e.stopPropagation();
  clickHide_mouseClick(e);
}

function getBlockableElementOrAncestor(element)
{
  while (element && element != document.documentElement
                 && element != document.body)
  {
    if (element instanceof HTMLElement && element.localName != "area")
    {
      // Handle <area> and their <map> elements specially,
      // blocking the image they are associated with
      if (element.localName == "map")
      {
        var images = document.querySelectorAll("img[usemap]");
        for (var i = 0; i < images.length; i++)
        {
          var image = images[i];
          var usemap = image.getAttribute("usemap");
          var index = usemap.indexOf("#");

          if (index != -1 && usemap.substr(index + 1) == element.name)
            return getBlockableElementOrAncestor(image);
        }

        return null;
      }

      if (isBlockable(element))
        return element;
    }

    element = element.parentElement;
  }

  return null;
}

// Hovering over an element so highlight it
function clickHide_mouseOver(e)
{
  if (clickHide_activated == false)
    return;

  var target = getBlockableElementOrAncestor(e.target);

  if (target)
  {
    currentElement = target;

    highlightElement(target, "#d6d84b", "#f8fa47");
    target.addEventListener("contextmenu", clickHide_elementClickHandler, true);
  }
  e.stopPropagation();
}

// No longer hovering over this element so unhighlight it
function clickHide_mouseOut(e)
{
  if (!clickHide_activated || !currentElement)
    return;

  unhighlightElement(currentElement);
  currentElement.removeEventListener("contextmenu", clickHide_elementClickHandler, true);
  e.stopPropagation();
}

// Selects the currently hovered-over filter or cancels selection
function clickHide_keyDown(e)
{
  if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.keyCode == 13 /*DOM_VK_RETURN*/)
     clickHide_mouseClick(e);
  else if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.keyCode == 27 /*DOM_VK_ESCAPE*/)
  {
    ext.backgroundPage.sendMessage(
    {
      type: "forward",
      payload:
      {
        type: "clickhide-deactivate"
      }
    });
    e.preventDefault();
    e.stopPropagation();
  }
}

function getFiltersForElement(element, callback)
{
  ext.backgroundPage.sendMessage(
    {
      type: "compose-filters",
      tagName: element.localName,
      id: element.id,
      src: element.getAttribute("src"),
      style: element.getAttribute("style"),
      classes: [].slice.call(element.classList),
      urls: getURLsFromElement(element),
      baseURL: document.location.href
    },
    function(response)
    {
      callback(response.filters, response.selectors);
    }
  );
}

// When the user clicks, the currentElement is the one we want.
// We should have ABP rules ready for when the
// popup asks for them.
function clickHide_mouseClick(e)
{
  if (!currentElement || !clickHide_activated)
    return;

  var elt = currentElement;
  if (currentElement.classList.contains("__adblockplus__overlay"))
    elt = currentElement.prisoner;

  getFiltersForElement(elt, function(filters, selectors)
  {
    ext.backgroundPage.sendMessage(
    {
      type: "forward",
      payload:
      {
        type: "clickhide-show-dialog",
        screenX: e.screenX,
        screenY: e.screenY,
        clickHideFilters: filters
      }
    });

    if (selectors.length > 0)
      highlightElements(selectors.join(","));

    highlightElement(currentElement, "#fd1708", "#f6a1b5");
  });

  // Make sure the browser doesn't handle this click
  e.preventDefault();
  e.stopPropagation();
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

// In Chrome 37-40, the document_end content script (this one) runs properly, while the
// document_start content scripts (that defines ext) might not. Check whether variable ext
// exists before continuing to avoid "Uncaught ReferenceError: ext is not defined".
// See https://crbug.com/416907
if ("ext" in window && document instanceof HTMLDocument)
{
  // Use a contextmenu handler to save the last element the user right-clicked on.
  // To make things easier, we actually save the DOM event.
  // We have to do this because the contextMenu API only provides a URL, not the actual
  // DOM element.
  document.addEventListener('contextmenu', function(e)
  {
    lastRightClickEvent = e;
    // We also need to ensure any old lastRightClickEvent variables in other
    // frames are cleared.
    lastRightClickEventValid = true;
    ext.backgroundPage.sendMessage(
    {
      type: "forward",
      payload:
      {
        type: "clickhide-clear-last-right-click-event"
      }
    });
  }, true);

  document.addEventListener("click", function(event)
  {
    // Ignore right-clicks
    if (event.button == 2)
      return;

    // Search the link associated with the click
    var link = event.target;
    while (link && !(link instanceof HTMLAnchorElement))
      link = link.parentNode;

    if (!link || link.protocol != "abp:")
      return;

    // This is our link - make sure the browser doesn't handle it
    event.preventDefault();
    event.stopPropagation();

    var linkTarget = link.href;
    if (!/^abp:\/*subscribe\/*\?(.*)/i.test(linkTarget))  /**/
      return;

    // Decode URL parameters
    var params = RegExp.$1.split("&");
    var title = null;
    var url = null;
    for (var i = 0; i < params.length; i++)
    {
      var parts = params[i].split("=", 2);
      if (parts.length != 2 || !/\S/.test(parts[1]))
        continue;
      switch (parts[0])
      {
        case "title":
          title = decodeURIComponent(parts[1]);
          break;
        case "location":
          url = decodeURIComponent(parts[1]);
          break;
      }
    }
    if (!url)
      return;

    // Default title to the URL
    if (!title)
      title = url;

    // Trim spaces in title and URL
    title = title.trim();
    url = url.trim();
    if (!/^(https?|ftp):/.test(url))
      return;

    ext.backgroundPage.sendMessage({
      type: "add-subscription",
      title: title,
      url: url
    });
  }, true);

  ext.onMessage.addListener(function(msg, sender, sendResponse)
  {
    switch (msg.type)
    {
      case "get-clickhide-state":
        sendResponse({active: clickHide_activated});
        break;
      case "clickhide-activate":
        clickHide_activate();
        break;
      case "clickhide-deactivate":
        clickHide_deactivate();
        break;
      case "clickhide-new-filter":
        if(lastRightClickEvent)
        {
          clickHide_activated = true;
          currentElement = getBlockableElementOrAncestor(lastRightClickEvent.target);
          clickHide_mouseClick(lastRightClickEvent);
        }
        break;
      case "clickhide-init":
        if (clickHideFiltersDialog)
        {
          sendResponse({filters: clickHide_filters});

          clickHideFiltersDialog.style.width = msg.width + "px";
          clickHideFiltersDialog.style.height = msg.height + "px";
          clickHideFiltersDialog.style.visibility = "visible";
        }
        break;
      case "clickhide-move":
        if (clickHideFiltersDialog)
        {
          clickHideFiltersDialog.style.left = (parseInt(clickHideFiltersDialog.style.left, 10) + msg.x) + "px";
          clickHideFiltersDialog.style.top = (parseInt(clickHideFiltersDialog.style.top, 10) + msg.y) + "px";
        }
        break;
      case "clickhide-close":
        if (currentElement && msg.remove)
        {
          // Explicitly get rid of currentElement
          var element = currentElement.prisoner || currentElement;
          if (element && element.parentNode)
            element.parentNode.removeChild(element);
        }
        clickHide_deactivate();
        break;
      case "clickhide-show-dialog":
        if (window.self == window.top)
          clickHide_showDialog(msg.screenX + window.pageXOffset,
                               msg.screenY + window.pageYOffset,
                               msg.clickHideFilters);
        break;
      case "clickhide-clear-last-right-click-event":
        if (lastRightClickEventValid)
          lastRightClickEventValid = false;
        else
          lastRightClickEvent = null;
        break;
    }
  });

  if (window == window.top)
    ext.backgroundPage.sendMessage({type: "report-html-page"});
}
