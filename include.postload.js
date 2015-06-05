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
var highlightedElementsInterval = null;
var clickHideFiltersDialog = null;
var lastRightClickEvent = null;
var lastRightClickEventValid = false;
var lastMouseOverEvent = null;

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

  var elements = Array.prototype.slice.call(document.querySelectorAll(selectorString));
  highlightedElementsSelector = selectorString;

  // Highlight elements progressively. Otherwise the page freezes
  // when a lot of elements get highlighted at the same time.
  highlightedElementsInterval = setInterval(function()
  {
    if (elements.length > 0)
    {
      var element = elements.shift();
      if (element != currentElement)
        highlightElement(element, "#fd6738", "#f6e1e5");
    }
    else
    {
      clearInterval(highlightedElementsInterval);
      highlightedElementsInterval = null;
    }
  }, 0);
}

// Unhighlight all elements, including those that would be affected by
// the proposed filters
function unhighlightElements() {
  if (highlightedElementsInterval)
  {
    clearInterval(highlightedElementsInterval)
    highlightedElementsInterval = null;
  }

  if (highlightedElementsSelector)
  {
    Array.prototype.forEach.call(
      document.querySelectorAll(highlightedElementsSelector),
      unhighlightElement
    );

    highlightedElementsSelector = null;
  }
}

// Adds an overlay to an element, which is probably a Flash object
function addElementOverlay(elt) {
  var position = "absolute";
  var offsetX = window.scrollX;
  var offsetY = window.scrollY;

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
    {
      position = "fixed";
      offsetX = offsetY = 0;
    }
  }

  var overlay = document.createElement('div');
  overlay.prisoner = elt;
  overlay.className = "__adblockplus__overlay";
  overlay.setAttribute('style', 'opacity:0.4; display:inline-box; overflow:hidden; box-sizing:border-box;');
  var rect = elt.getBoundingClientRect();
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.style.left = (rect.left + offsetX) + "px";
  overlay.style.top = (rect.top + offsetY) + "px";
  overlay.style.position = position;
  overlay.style.zIndex = 0x7FFFFFFE;

  // elt.parentNode.appendChild(overlay, elt);
  document.documentElement.appendChild(overlay);
  return overlay;
}

// Show dialog asking user whether she wants to add the proposed filters derived
// from selected page element
function clickHide_showDialog(filters)
{
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
  [].forEach.call(
    document.querySelectorAll('object,embed,iframe,frame'),
    function(element)
    {
      getFiltersForElement(element, function(filters)
      {
        if (filters.length > 0)
          addElementOverlay(element);
      });
    }
  );

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

  if (clickHideFiltersDialog)
  {
    document.documentElement.removeChild(clickHideFiltersDialog);
    clickHideFiltersDialog = null;
  }

  document.removeEventListener("mousedown", clickHide_stopPropagation, true);
  document.removeEventListener("mouseup", clickHide_stopPropagation, true);
  document.removeEventListener("mouseenter", clickHide_stopPropagation, true);
  document.removeEventListener("mouseleave", clickHide_stopPropagation, true);
  document.removeEventListener("mouseover", clickHide_mouseOver, true);
  document.removeEventListener("mouseout", clickHide_mouseOut, true);
  document.removeEventListener("click", clickHide_mouseClick, true);
  document.removeEventListener("keydown", clickHide_keyDown, true);
}

function clickHide_deactivate()
{
  clickHide_rulesPending();

  clickHide_filters = null;
  lastRightClickEvent = null;

  if (currentElement)
  {
    currentElement.removeEventListener("contextmenu",  clickHide_elementClickHandler, true);
    unhighlightElement(currentElement);
    currentElement = null;
  }
  unhighlightElements();

  var overlays = document.getElementsByClassName("__adblockplus__overlay");
  while (overlays.length > 0)
    overlays[0].parentNode.removeChild(overlays[0]);

  ext.onExtensionUnloaded.removeListener(clickHide_deactivate);
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

function getBlockableElementOrAncestor(element, callback)
{
  // We assume that the user doesn't want to block the whole page.
  // So we never consider the <html> or <body> element.
  while (element && element != document.documentElement
                 && element != document.body)
  {
    // We can't handle non-HTML (like SVG) elements, as well as
    // <area> elements (see below). So fall back to the parent element.
    if (!(element instanceof HTMLElement) || element.localName == "area")
      element = element.parentElement;

    // If image maps are used mouse events occur for the <area> element.
    // But we have to block the image associated with the <map> element.
    else if (element.localName == "map")
    {
      var images = document.querySelectorAll("img[usemap]");
      var image = null;

      for (var i = 0; i < images.length; i++)
      {
        var usemap = images[i].getAttribute("usemap");
        var index = usemap.indexOf("#");

        if (index != -1 && usemap.substr(index + 1) == element.name)
        {
          image = images[i];
          break;
        }
      }

      element = image;
    }

    // Finally, if none of the above is true, check whether we can generate
    // any filters for this element. Otherwise fall back to its parent element.
    else
    {
      getFiltersForElement(element, function(filters)
      {
        if (filters.length > 0)
          callback(element);
        else
          getBlockableElementOrAncestor(element.parentElement, callback);
      });

      return;
    }
  }

  // We reached the document root without finding a blockable element.
  callback(null);
}

// Hovering over an element so highlight it
function clickHide_mouseOver(e)
{
  lastMouseOverEvent = e;

  getBlockableElementOrAncestor(e.target, function(element)
  {
    if (e == lastMouseOverEvent)
    {
      lastMouseOverEvent = null;

      if (clickHide_activated)
      {
        if (currentElement)
          unhighlightElement(currentElement);

        if (element)
        {
          highlightElement(element, "#d6d84b", "#f8fa47");
          element.addEventListener("contextmenu", clickHide_elementClickHandler, true);
        }

        currentElement = element;
      }
    }
  });

  e.stopPropagation();
}

// No longer hovering over this element so unhighlight it
function clickHide_mouseOut(e)
{
  if (!clickHide_activated || currentElement != e.target)
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
      mediatype: typeMap[element.localName],
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
    while (!(link instanceof HTMLAnchorElement))
    {
      link = link.parentNode;

      if (!link)
        return;
    }

    if (link.protocol == "http:" || link.protocol == "https:")
    {
      if (link.host != "subscribe.adblockplus.org" || link.pathname != "/")
        return;
    }
    else if (!/^abp:\/*subscribe\/*\?/i.test(link.href))
      return;

    // This is our link - make sure the browser doesn't handle it
    event.preventDefault();
    event.stopPropagation();

    // Decode URL parameters
    var params = link.search.substr(1).split("&");
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
          var event = lastRightClickEvent;
          getBlockableElementOrAncestor(event.target, function(element)
          {
            clickHide_activate();
            currentElement = element;
            clickHide_mouseClick(event);
          });
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
          var rect = clickHideFiltersDialog.getBoundingClientRect();
          var x = Math.max(0, Math.min(rect.left + msg.x, window.innerWidth - rect.width));
          var y = Math.max(0, Math.min(rect.top + msg.y, window.innerHeight - rect.height));
          
          clickHideFiltersDialog.style.left = x + "px";
          clickHideFiltersDialog.style.top = y + "px";
        }
        break;
      case "clickhide-close":
        if (currentElement && msg.remove)
        {
          // Hide the selected element itself if an added blocking
          // filter is causing it to collapse. Note that this
          // behavior is incomplete, but the best we can do here,
          // e.g. if an added blocking filter matches other elements,
          // the effect won't be visible until the page is is reloaded.
          checkCollapse(currentElement.prisoner || currentElement);

          // Apply added element hiding filters.
          updateStylesheet();
        }
        clickHide_deactivate();
        break;
      case "clickhide-show-dialog":
        clickHide_rulesPending();
        if (window.self == window.top)
          clickHide_showDialog(msg.clickHideFilters);
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
