/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
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

"use strict";

// We would rather export these properly and then require("./include.preload")
// here, but that would result in include.preload running both at pre and post
// load.
const {collapseElement, contentFiltering, getURLFromElement} = window;

// The page ID for the popup filter selection dialog (top frame only).
let blockelementPopupId = null;

// Element picking state (top frame only).
let currentlyPickingElement = false;
let lastMouseOverEvent = null;

// During element picking this is the currently highlighted element. When
// element has been picked this is the element that is due to be blocked.
let currentElement = null;

// Highlighting state, used by the top frame during element picking and all
// frames when the chosen element is highlighted red.
let highlightedElementsSelector = null;
let highlightedElementsInterval = null;

// Last right click state stored for element blocking via the context menu.
let lastRightClickEvent = null;
let lastRightClickEventIsMostRecent = false;


/* Utilities */

function getFiltersForElement(element, callback)
{
  let src = element.getAttribute("src");
  browser.runtime.sendMessage({
    type: "composer.getFilters",
    tagName: element.localName,
    id: element.id,
    src: src && src.length <= 1000 ? src : null,
    style: element.getAttribute("style"),
    classes: Array.prototype.slice.call(element.classList),
    url: getURLFromElement(element)
  }).then(response =>
  {
    callback(response.filters, response.selectors);
  });
}

function getBlockableElementOrAncestor(element, callback)
{
  // We assume that the user doesn't want to block the whole page.
  // So we never consider the <html> or <body> element.
  while (element && element != document.documentElement &&
         element != document.body)
  {
    // We can't handle non-HTML (like SVG) elements, as well as
    // <area> elements (see below). So fall back to the parent element.
    if (!(element instanceof HTMLElement) || element.localName == "area")
    {
      element = element.parentElement;
    }
    // If image maps are used mouse events occur for the <area> element.
    // But we have to block the image associated with the <map> element.
    else if (element.localName == "map")
    {
      let images = document.querySelectorAll("img[usemap]");
      let image = null;

      for (let currentImage of images)
      {
        let usemap = currentImage.getAttribute("usemap");
        let index = usemap.indexOf("#");

        if (index != -1 && usemap.substr(index + 1) == element.name)
        {
          image = currentImage;
          break;
        }
      }

      element = image;
    }

    // Finally, if none of the above is true, check whether we can generate
    // any filters for this element. Otherwise fall back to its parent element.
    else
    {
      getFiltersForElement(element, filters =>
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


/* Element highlighting */

// Adds an overlay to an element in order to highlight it.
function addElementOverlay(element)
{
  let position = "absolute";
  let offsetX = window.scrollX;
  let offsetY = window.scrollY;

  for (let e = element; e; e = e.parentElement)
  {
    let style = getComputedStyle(e);

    // If the element isn't rendered (since its or one of its ancestor's
    // "display" property is "none"), the overlay wouldn't match the element.
    if (style.display == "none")
      return null;

    // If the element or one of its ancestors uses fixed postioning, the overlay
    // must too. Otherwise its position might not match the element's.
    if (style.position == "fixed")
    {
      position = "fixed";
      offsetX = offsetY = 0;
    }
  }

  let overlay = document.createElement("div");
  overlay.prisoner = element;
  overlay.className = "__adblockplus__overlay";
  overlay.setAttribute("style",
                       "opacity:0.4; display:inline-block !important; " +
                       "overflow:hidden; box-sizing:border-box;");
  let rect = element.getBoundingClientRect();
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.style.left = (rect.left + offsetX) + "px";
  overlay.style.top = (rect.top + offsetY) + "px";
  overlay.style.position = position;
  overlay.style.zIndex = 0x7FFFFFFE;

  document.documentElement.appendChild(overlay);
  return overlay;
}

function highlightElement(element, border, backgroundColor)
{
  unhighlightElement(element);

  let highlightWithOverlay = () =>
  {
    let overlay = addElementOverlay(element);

    // If the element isn't displayed no overlay will be added.
    // Moreover, we don't need to highlight anything then.
    if (!overlay)
      return;

    highlightElement(overlay, border, backgroundColor);
    overlay.style.pointerEvents = "none";

    element._unhighlight = () =>
    {
      overlay.parentNode.removeChild(overlay);
    };
  };

  let highlightWithStyleAttribute = () =>
  {
    let originalBorder = element.style.getPropertyValue("border");
    let originalBorderPriority =
      element.style.getPropertyPriority("box-shadow");
    let originalBackgroundColor =
      element.style.getPropertyValue("background-color");
    let originalBackgroundColorPriority =
      element.style.getPropertyPriority("background-color");

    element.style.setProperty("border", `2px solid ${border}`, "important");
    element.style.setProperty("background-color", backgroundColor, "important");

    element._unhighlight = () =>
    {
      element.style.removeProperty("box-shadow");
      element.style.setProperty(
        "border",
        originalBorder,
        originalBorderPriority
      );

      element.style.removeProperty("background-color");
      element.style.setProperty(
        "background-color",
        originalBackgroundColor,
        originalBackgroundColorPriority
      );
    };
  };

  // If this element is an overlay that we've created previously then we need
  // to give it a background colour. Otherwise we need to create an overlay
  // and then recurse in order to set the overlay's background colour.
  if ("prisoner" in element)
    highlightWithStyleAttribute();
  else
    highlightWithOverlay();
}

function unhighlightElement(element)
{
  if (element && "_unhighlight" in element)
  {
    element._unhighlight();
    delete element._unhighlight;
  }
}

// Highlight elements matching the selector string red.
// (All elements that would be blocked by the proposed filters.)
function highlightElements(selectorString)
{
  unhighlightElements();

  let elements = Array.prototype.slice.call(
    document.querySelectorAll(selectorString)
  );
  highlightedElementsSelector = selectorString;

  // Highlight elements progressively. Otherwise the page freezes
  // when a lot of elements get highlighted at the same time.
  highlightedElementsInterval = setInterval(() =>
  {
    if (elements.length > 0)
    {
      let element = elements.shift();
      if (element != currentElement)
        highlightElement(element, "#CA0000", "#CA0000");
    }
    else
    {
      clearInterval(highlightedElementsInterval);
      highlightedElementsInterval = null;
    }
  }, 0);
}

// Unhighlight the elements that were highlighted by selector string previously.
function unhighlightElements()
{
  if (highlightedElementsInterval)
  {
    clearInterval(highlightedElementsInterval);
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


/* Input event handlers */

function stopEventPropagation(event)
{
  event.stopPropagation();
}

// Hovering over an element so highlight it.
function mouseOver(event)
{
  lastMouseOverEvent = event;

  getBlockableElementOrAncestor(event.target, element =>
  {
    if (event == lastMouseOverEvent)
    {
      lastMouseOverEvent = null;

      if (currentlyPickingElement)
      {
        if (currentElement)
          unhighlightElement(currentElement);

        if (element)
          highlightElement(element, "#CA0000", "#CA0000");

        currentElement = element;
      }
    }
  });

  event.stopPropagation();
}

// No longer hovering over this element so unhighlight it.
function mouseOut(event)
{
  if (!currentlyPickingElement || currentElement != event.target)
    return;

  unhighlightElement(currentElement);
  event.stopPropagation();
}

// Key events - Return selects currently hovered-over element, escape aborts.
function keyDown(event)
{
  if (!event.ctrlKey && !event.altKey && !event.shiftKey)
  {
    if (event.keyCode == 13) // Return
      elementPicked(event);
    else if (event.keyCode == 27) // Escape
      deactivateBlockElement();
  }
}


/* Element selection */

// Start highlighting elements yellow as the mouse moves over them, when one is
// chosen launch the popup dialog for the user to confirm the generated filters.
function startPickingElement()
{
  currentlyPickingElement = true;

  // Add (currently invisible) overlays for blockable elements that don't emit
  // mouse events, so that they can still be selected.
  Array.prototype.forEach.call(
    document.querySelectorAll("object,embed,iframe,frame"),
    element =>
    {
      getFiltersForElement(element, filters =>
      {
        if (filters.length > 0)
          addElementOverlay(element);
      });
    }
  );

  document.addEventListener("mousedown", stopEventPropagation, true);
  document.addEventListener("mouseup", stopEventPropagation, true);
  document.addEventListener("mouseenter", stopEventPropagation, true);
  document.addEventListener("mouseleave", stopEventPropagation, true);
  document.addEventListener("mouseover", mouseOver, true);
  document.addEventListener("mouseout", mouseOut, true);
  document.addEventListener("click", elementPicked, true);
  document.addEventListener("contextmenu", elementPicked, true);
  document.addEventListener("keydown", keyDown, true);

  ext.onExtensionUnloaded.addListener(deactivateBlockElement);
}

// Used to hide/show blocked elements on composer.content.preview
function previewBlockedElements(active)
{
  if (!currentElement)
    return;

  let element = currentElement.prisoner || currentElement;
  let overlays = document.querySelectorAll(".__adblockplus__overlay");

  previewBlockedElement(element, active, overlays);

  getFiltersForElement(element, (filters, selectors) =>
  {
    if (selectors.length > 0)
    {
      let cssQuery = selectors.join(",");
      for (let node of document.querySelectorAll(cssQuery))
        previewBlockedElement(node, active, overlays);
    }
  });
}

// the previewBlockedElements helper to avoid duplicated code
function previewBlockedElement(element, active, overlays)
{
  let display = active ? "none" : null;
  let find = Array.prototype.find;
  let overlay = find.call(overlays, ({prisoner}) => prisoner === element);
  if (overlay)
    overlay.style.display = display;
  element.style.display = display;
}

// The user has picked an element - currentElement. Highlight it red, generate
// filters for it and open a popup dialog so that the user can confirm.
function elementPicked(event)
{
  if (!currentElement)
    return;

  let element = currentElement.prisoner || currentElement;
  getFiltersForElement(element, (filters, selectors) =>
  {
    if (currentlyPickingElement)
      stopPickingElement();

    highlightElement(currentElement, "#CA0000", "#CA0000");

    let highlights = 1;
    if (selectors.length > 0)
    {
      let cssQuery = selectors.join(",");
      highlightElements(cssQuery);
      highlights = document.querySelectorAll(cssQuery).length;
    }

    browser.runtime.sendMessage({
      type: "composer.openDialog",
      filters,
      highlights
    }).then(popupId =>
    {
      // Only the top frame keeps a record of the popup window's ID,
      // so if this isn't the top frame we need to pass the ID on.
      if (window == window.top)
      {
        blockelementPopupId = popupId;
      }
      else
      {
        browser.runtime.sendMessage({
          type: "composer.forward",
          payload: {type: "composer.content.dialogOpened", popupId}
        });
      }
    });
  });

  event.preventDefault();
  event.stopPropagation();
}

function stopPickingElement()
{
  currentlyPickingElement = false;

  document.removeEventListener("mousedown", stopEventPropagation, true);
  document.removeEventListener("mouseup", stopEventPropagation, true);
  document.removeEventListener("mouseenter", stopEventPropagation, true);
  document.removeEventListener("mouseleave", stopEventPropagation, true);
  document.removeEventListener("mouseover", mouseOver, true);
  document.removeEventListener("mouseout", mouseOut, true);
  document.removeEventListener("click", elementPicked, true);
  document.removeEventListener("contextmenu", elementPicked, true);
  document.removeEventListener("keydown", keyDown, true);
}


/* Core logic */

// We're done with the block element feature for now, tidy everything up.
function deactivateBlockElement(popupAlreadyClosed)
{
  previewBlockedElements(false);

  if (currentlyPickingElement)
    stopPickingElement();

  if (blockelementPopupId != null && !popupAlreadyClosed)
  {
    browser.runtime.sendMessage({
      type: "composer.forward",
      targetPageId: blockelementPopupId,
      payload:
      {
        type: "composer.dialog.close"
      }
    });
  }

  blockelementPopupId = null;
  lastRightClickEvent = null;

  if (currentElement)
  {
    unhighlightElement(currentElement);
    currentElement = null;
  }
  unhighlightElements();

  let overlays = document.getElementsByClassName("__adblockplus__overlay");
  while (overlays.length > 0)
    overlays[0].parentNode.removeChild(overlays[0]);

  ext.onExtensionUnloaded.removeListener(deactivateBlockElement);
}

function initializeComposer()
{
  if (typeof ext == "undefined")
    return false;

  // Use a contextmenu handler to save the last element the user right-clicked
  // on. To make things easier, we actually save the DOM event. We have to do
  // this because the contextMenu API only provides a URL, not the actual DOM
  // element.
  //   We also need to make sure that the previous right click event,
  // if there is one, is removed. We don't know which frame it is in so we must
  // send a message to the other frames to clear their old right click events.
  document.addEventListener("contextmenu", event =>
  {
    lastRightClickEvent = event;
    lastRightClickEventIsMostRecent = true;

    browser.runtime.sendMessage({
      type: "composer.forward",
      payload:
      {
        type: "composer.content.clearPreviousRightClickEvent"
      }
    });
  }, true);

  ext.onMessage.addListener((message, sender, sendResponse) =>
  {
    switch (message.type)
    {
      case "composer.content.preview":
        previewBlockedElements(message.active);
        break;
      case "composer.content.getState":
        if (window == window.top)
        {
          sendResponse({
            active: currentlyPickingElement || blockelementPopupId != null
          });
        }
        break;
      case "composer.content.startPickingElement":
        if (window == window.top)
          startPickingElement();
        break;
      case "composer.content.contextMenuClicked":
        let event = lastRightClickEvent;
        deactivateBlockElement();
        if (event)
        {
          getBlockableElementOrAncestor(event.target, element =>
          {
            if (element)
            {
              currentElement = element;
              elementPicked(event);
            }
          });
        }
        break;
      case "composer.content.finished":
        if (currentElement && message.remove)
        {
          // Hide the selected element itself. Note that this
          // behavior is incomplete, but the best we can do here,
          // e.g. if an added blocking filter matches other elements,
          // the effect won't be visible until the page is is reloaded.
          collapseElement(currentElement.prisoner || currentElement);

          // Apply added element hiding filters.
          contentFiltering.apply({elemhide: true});
        }
        deactivateBlockElement(!!message.popupAlreadyClosed);
        break;
      case "composer.content.clearPreviousRightClickEvent":
        if (!lastRightClickEventIsMostRecent)
          lastRightClickEvent = null;
        lastRightClickEventIsMostRecent = false;
        break;
      case "composer.content.dialogOpened":
        if (window == window.top)
          blockelementPopupId = message.popupId;
        break;
      case "composer.content.dialogClosed":
        // The onRemoved hook for the popup can create a race condition, so we
        // to be careful here. (This is not perfect, but best we can do.)
        if (window == window.top && blockelementPopupId == message.popupId)
        {
          browser.runtime.sendMessage({
            type: "composer.forward",
            payload:
            {
              type: "composer.content.finished",
              popupAlreadyClosed: true
            }
          });
        }
        break;
    }
  });

  if (window == window.top)
    browser.runtime.sendMessage({type: "composer.ready"});

  return true;
}

if (document instanceof HTMLDocument)
{
  // There's a bug in Firefox that causes document_end content scripts to run
  // before document_start content scripts on extension startup. In this case
  // the ext object is undefined, we fail to initialize, and initializeComposer
  // returns false. As a workaround, try again after a timeout.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1395287
  if (!initializeComposer())
    setTimeout(initializeComposer, 2000);
}
