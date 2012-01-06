/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var enabled = false; // Enabled for this particular domain.
var nukeElementsTimeoutID = 0;
var nukeElementsLastTime = 0;

// Click-to-hide stuff
var clickHide_activated = false;
var currentElement = null;
var currentElement_boxShadow = null;
var currentElement_backgroundColor;
var clickHideFilters = null;
var highlightedElementsSelector = null;
var highlightedElementsBoxShadows = null;
var highlightedElementsBGColors = null;
var clickHideFiltersDialog = null;
var lastRightClickEvent = null;

// Highlight elements according to selector string. This would include
// all elements that would be affected by proposed filters.
function highlightElements(selectorString) {
  if(highlightedElementsSelector)
    unhighlightElements();
  
  highlightedElements = document.querySelectorAll(selectorString);
  highlightedElementsSelector = selectorString;
  highlightedElementsBoxShadows = new Array();
  highlightedElementsBGColors = new Array();

  for(var i = 0; i < highlightedElements.length; i++) {
    highlightedElementsBoxShadows[i] = highlightedElements[i].style.getPropertyValue("-webkit-box-shadow");
    highlightedElementsBGColors[i] = highlightedElements[i].style.backgroundColor;
    highlightedElements[i].style.setProperty("-webkit-box-shadow", "inset 0px 0px 5px #fd6738");
    highlightedElements[i].style.backgroundColor = "#f6e1e5";
  }
}

// Unhighlight all elements, including those that would be affected by
// the proposed filters
function unhighlightElements() {
  if(highlightedElementsSelector == null)
    return;
  highlightedElements = document.querySelectorAll(highlightedElementsSelector);
  for(var i = 0; i < highlightedElements.length; i++) {
    highlightedElements[i].style.setProperty("-webkit-box-shadow", highlightedElementsBoxShadows[i]);
    highlightedElements[i].style.backgroundColor = highlightedElementsBGColors[i];
  }
  highlightedElementsSelector = null;
}

// Gets the absolute position of an element by walking up the DOM tree,
// adding up offsets.
// I hope there's a better way because it just seems absolutely stupid
// that the DOM wouldn't have a direct way to get this, given that it
// has hundreds and hundreds of other methods that do random junk.
function getAbsolutePosition(elt) {
  var l = 0;
  var t = 0;
  for(; elt; elt = elt.offsetParent) {
    l += elt.offsetLeft;
    t += elt.offsetTop;
  }
  return [l, t];
}

// Adds an overlay to an element, which is probably a Flash object
function addElementOverlay(elt) {
  // If this element is enclosed in an object tag, we prefer to block that instead
  if(!elt)
    return null;
      
  // If element doesn't have at least one of class name, ID or URL, give up
  // because we don't know how to construct a filter rule for it
  var url = getElementURL(elt);
  if(!elt.className && !elt.id && !url)
    return;
  var thisStyle = getComputedStyle(elt, null);
  var overlay = document.createElement('div');
  overlay.prisoner = elt;
  overlay.prisonerURL = url;
  overlay.className = "__adblockplus__overlay";
  overlay.setAttribute('style', 'opacity:0.4; background-color:#ffffff; display:inline-box; ' + 'width:' + thisStyle.width + '; height:' + thisStyle.height + '; position:absolute; overflow:hidden; -webkit-box-sizing:border-box; z-index: 99999');
  var pos = getAbsolutePosition(elt);
  overlay.style.left = pos[0] + "px";
  overlay.style.top = pos[1] + "px";
  // elt.parentNode.appendChild(overlay, elt);
  document.body.appendChild(overlay);
  return overlay;
}

// Show dialog asking user whether she wants to add the proposed filters derived
// from selected page element
function clickHide_showDialog(left, top, filters)
{
  clickHideFiltersDialog = document.createElement("iframe");
  clickHideFiltersDialog.src = chrome.extension.getURL("block.html") + "?filters=" + encodeURIComponent(filters.join("\n"));
  clickHideFiltersDialog.setAttribute("style", "position: fixed !important; visibility: hidden; display: block !important; border: 0px !important;");
  clickHideFiltersDialog.style.WebkitBoxShadow = "5px 5px 20px rgba(0,0,0,0.5)";
  clickHideFiltersDialog.style.zIndex = 99999;

  // Position in upper-left all the time
  clickHideFiltersDialog.style.left = "50px";
  clickHideFiltersDialog.style.top = "50px";

  // Listen for messages from this dialog
  window.addEventListener("message", clickHide_dialogMessage, true);

  // Make dialog partly transparent when mouse isn't over it so user has a better
  // view of what's going to be blocked
  clickHideFiltersDialog.onmouseout = function()
  {
    if (clickHideFiltersDialog)
      clickHideFiltersDialog.style.setProperty("opacity", "0.7");
  }
  clickHideFiltersDialog.onmouseover = function()
  {
    if (clickHideFiltersDialog)
      clickHideFiltersDialog.style.setProperty("opacity", "1.0");
  } 
  
  document.body.appendChild(clickHideFiltersDialog);
}

/**
 * Processes messages received from "add filters" dialog.
 */
function clickHide_dialogMessage(event)
{
  var origin = chrome.extension.getURL("block.html").replace(/^([^:\/]+:\/+[^:\/]+).*/, "$1");
  if (event.origin == origin)
  {
    event.preventDefault();
    event.stopPropagation();

    if (event.data.type == "size")
    {
      clickHideFiltersDialog.style.width = (event.data.width + 5) + "px";
      clickHideFiltersDialog.style.height = (event.data.height + 5) + "px";
      clickHideFiltersDialog.style.visibility = "visible";
    }
    else if (event.data.type == "move")
    {
      clickHideFiltersDialog.style.left = (parseInt(clickHideFiltersDialog.style.left) + event.data.x) + "px";
      clickHideFiltersDialog.style.top = (parseInt(clickHideFiltersDialog.style.top) + event.data.y) + "px";
    }
    else if (event.data.type == "close")
    {
      // Explicitly get rid of currentElement in case removeAdsAgain() doesn't catch it
      if (event.data.remove && currentElement && currentElement.parentNode)
      {
        currentElement.parentNode.removeChild(currentElement);
        // currentElement may actually be our overlay if right-click element selection was used
        if (currentElement.prisoner && currentElement.prisoner.parentNode)
          currentElement.prisoner.parentNode.removeChild(currentElement.prisoner);
      }

      clickHide_deactivate();
    }
  }
}

// Turn on the choose element to create filter thing
function clickHide_activate() {
  if(document == null)
    return;
  
  // If we already had a selected element, restore its appearance
  if(currentElement) {
    currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
    currentElement.style.backgroundColor = currentElement_backgroundColor;
    currentElement = null;
    clickHideFilters = null;
  }
  
  // Add overlays for elements with URLs so user can easily click them
  var elts = document.querySelectorAll('object,embed,img,iframe');
  for(var i=0; i<elts.length; i++)
    addElementOverlay(elts[i]);
  
  clickHide_activated = true;
  document.addEventListener("mouseover", clickHide_mouseOver, false);
  document.addEventListener("mouseout", clickHide_mouseOut, false);
  document.addEventListener("click", clickHide_mouseClick, false);
  document.addEventListener("keyup", clickHide_keyUp, false);
}

// Called when user has clicked on something and we are waiting for confirmation
// on whether the user actually wants these filters
function clickHide_rulesPending() {
  clickHide_activated = false;
  document.removeEventListener("mouseover", clickHide_mouseOver, false);
  document.removeEventListener("mouseout", clickHide_mouseOut, false);
  document.removeEventListener("click", clickHide_mouseClick, false);
  document.removeEventListener("keyup", clickHide_keyUp, false);
}

// Turn off click-to-hide
function clickHide_deactivate()
{
  if (clickHideFiltersDialog)
  {
    document.body.removeChild(clickHideFiltersDialog);
    clickHideFiltersDialog = null;
    window.removeEventListener("message", clickHide_dialogMessage, true);
  }

  if(currentElement) {
    unhighlightElements();
    currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
    currentElement.style.backgroundColor = currentElement_backgroundColor;
    currentElement = null;
    clickHideFilters = null;
  }
  
  clickHide_activated = false;
  if(!document)
    return; // This can happen inside a nuked iframe...I think
  document.removeEventListener("mouseover", clickHide_mouseOver, false);
  document.removeEventListener("mouseout", clickHide_mouseOut, false);
  document.removeEventListener("click", clickHide_mouseClick, false);
  document.removeEventListener("keyup", clickHide_keyUp, false);
  
  // Remove overlays
  // For some reason iterating over the array returend by getElementsByClassName() doesn't work
  var elt;
  while(elt = document.querySelector('.__adblockplus__overlay'))
    elt.parentNode.removeChild(elt);
}

function clickHide_elementClickHandler(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  clickHide_mouseClick(ev);
}

// Hovering over an element so highlight it
function clickHide_mouseOver(e) {
  if(clickHide_activated == false)
    return;

  if(e.target.id || e.target.className || e.target.src) {
    currentElement = e.target;
    currentElement_boxShadow = e.target.style.getPropertyValue("-webkit-box-shadow");
    currentElement_backgroundColor = e.target.style.backgroundColor;
    e.target.style.setProperty("-webkit-box-shadow", "inset 0px 0px 5px #d6d84b");
    e.target.style.backgroundColor = "#f8fa47";

    // TODO: save old context menu
    e.target.addEventListener("contextmenu", clickHide_elementClickHandler, false);
  }
}

// No longer hovering over this element so unhighlight it
function clickHide_mouseOut(e) {
  if(!clickHide_activated || !currentElement)
    return;
  
  currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
  currentElement.style.backgroundColor = currentElement_backgroundColor;
  
  // TODO: restore old context menu
  currentElement.removeEventListener("contextmenu", clickHide_elementClickHandler, false);
}

// Selects the currently hovered-over filter
function clickHide_keyUp(e) {
  // Ctrl+Shift+E
  if(e.ctrlKey && e.shiftKey && e.keyCode == 69)
    clickHide_mouseClick(e);
}

// When the user clicks, the currentElement is the one we want.
// We should have ABP rules ready for when the
// popup asks for them.
function clickHide_mouseClick(e) {
  if(!currentElement || !clickHide_activated)
    return;
      
  var elt = currentElement;
  var url = null;
  if(currentElement.className && currentElement.className == "__adblockplus__overlay") {
    elt = currentElement.prisoner;
    url = currentElement.prisonerURL;
  } else if(elt.src) {
    url = elt.src;
  }

  // Only normalize when the element contains a URL (issue 328.)
  // The URL is not always normalized, so do it here
  if(url)
    url = normalizeURL(relativeToAbsoluteUrl(url));
  
  // Construct filters. The popup will retrieve these.
  // Only one ID
  var elementId = elt.id ? elt.id.split(' ').join('') : null;
  // Can have multiple classes, and there might be extraneous whitespace
  var elementClasses = null;
  if(elt.className) {
    elementClasses = elt.className.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').split(' ');
  }
  clickHideFilters = new Array();
  selectorList = new Array();
  if(elementId) {
    clickHideFilters.push(document.domain + "###" + elementId);
    selectorList.push("#" + elementId);
  }
  if(elementClasses) {
    for(var i = 0; i < elementClasses.length; i++) {
      clickHideFilters.push(document.domain + "##." + elementClasses[i]);
      selectorList.push("." + elementClasses[i]);
    }
  }
  if(url) {
    clickHideFilters.push(relativeToAbsoluteUrl(url));
    selectorList.push(elt.localName + '[src="' + url + '"]');
  }
  
  // Show popup
  clickHide_showDialog(e.clientX, e.clientY, clickHideFilters);

  // Highlight the unlucky elements
  // Restore currentElement's box-shadow and bgcolor so that highlightElements won't save those
  currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
  currentElement.style.backgroundColor = currentElement_backgroundColor;
  // Highlight the elements specified by selector in yellow
  highlightElements(selectorList.join(","));
  // Now, actually highlight the element the user clicked on in red
  currentElement.style.setProperty("-webkit-box-shadow", "inset 0px 0px 5px #fd1708");
  currentElement.style.backgroundColor = "#f6a1b5";

  // Half-deactivate click-hide so the user has a chance to click the page action icon.
  // currentElement is still set to the putative element to be blocked.
  clickHide_rulesPending();
}

// Called when a new filter is added.
// It would be a click-to-hide filter, so it's only an elemhide filter.
// Since this rarely happens, we can afford to do a full run of ad removal.
function removeAdsAgain()
{
  chrome.extension.sendRequest({reqtype: "get-settings", matcher: true, selectors: true, host: window.location.hostname}, function(response)
  {
    // Retrieve new set of selectors and build selector strings
    setElemhideCSSRules(response.selectors);
    defaultMatcher.clear();
    if (response.matcherData)
      defaultMatcher.fromCache(JSON.parse(response.matcherData));
    nukeElements();
  });
}

// Block ads in nodes inserted by scripts
function handleNodeInserted(e)
{
  // Remove ads relatively infrequently. If no timeout set, set one.
  if(enabled && nukeElementsTimeoutID == 0)
  {
    nukeElementsTimeoutID = setTimeout(nukeElements, (Date.now() - nukeElementsLastTime > 1000) ? 1 : 1000);
  }
}

// Extracts source URL from an IMG, OBJECT, EMBED, or IFRAME
function getElementURL(elt) {
  // Check children of object nodes for "param" nodes with name="movie" that specify a URL
  // in value attribute
  var url;
  if(elt.localName.toUpperCase() == "OBJECT" && !(url = elt.getAttribute("data"))) {
    // No data attribute, look in PARAM child tags for a URL for the swf file
    var params = elt.querySelectorAll("param[name=\"movie\"]");
    // This OBJECT could contain an EMBED we already nuked, in which case there's no URL
    if(params[0])
      url = params[0].getAttribute("value");
    else {
      params = elt.querySelectorAll("param[name=\"src\"]");
      if(params[0])
        url = params[0].getAttribute("value");
    }
  } else if(!url) {
    url = elt.getAttribute("src") || elt.getAttribute("href"); 
  }
  return url;
}

// Hides/removes image and Flash elements according to the external resources they load.
// (e.g. src attribute)
function nukeElements()
{
  var elts = document.querySelectorAll("img,object,iframe,embed,link");
  for (var i = 0; i < elts.length; i++)
  {
    // The URL is normalized in the background script so we don't need to do it here
    var url = getElementURL(elts[i]);
    // If the URL of the element is the same as the document URI, the user is trying to directly
    // view the ad for some reason and so we won't block it.
    if (url && url != document.baseURI && shouldBlock(url, TagToType[elts[i].localName.toUpperCase()]))
      nukeSingleElement(elts[i]);
  }
  
  nukeElementsTimeoutID = 0;
  nukeElementsLastTime = Date.now();
}

// Content scripts are apparently invoked on non-HTML documents, so we have to
// check for that before doing stuff. |document instanceof HTMLDocument| check
// will fail on some sites like planet.mozilla.org because WebKit creates
// Document instances for XHTML documents, have to test the root element.
if (document.documentElement instanceof HTMLElement)
{
  // Use a contextmenu handler to save the last element the user right-clicked on.
  // To make things easier, we actually save the DOM event.
  // We have to do this because the contextMenu API only provides a URL, not the actual
  // DOM element.
  document.addEventListener('contextmenu', function(e) {
    lastRightClickEvent = e;
  }, false);

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
    title = title.replace(/^\s+/, "").replace(/\s+$/, "");
    url = url.replace(/^\s+/, "").replace(/\s+$/, "");
    if (!/^(https?|ftp):/.test(url))
      return;

    chrome.extension.sendRequest({reqtype: "add-subscription", title: title, url: url});
  }, true);
  
  chrome.extension.onRequest.addListener(function(request, sender, sendResponse)
  {
    switch (request.reqtype)
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
        // The request is received by all frames, so ignore it if we're not the frame the
        // user right-clicked in
        if(!lastRightClickEvent)
          return;
        // We hope the URL we are given is the same as the one in the element referenced
        // by lastRightClickEvent.target. If not, we just discard
        var target = lastRightClickEvent.target;
        var url = relativeToAbsoluteUrl(target.src);
        // If we don't have the element with a src URL same as the filter, look for it.
        // Chrome's context menu API is terrible. Why can't it give us the friggin' element
        // to start with?
        if(request.filter !== url) {
          // Grab all elements with a src attribute.
          // This won't work for all object/embed tags, but the context menu API doesn't
          // work on those, so we're OK for now.
          var elts = document.querySelectorAll('[src]');
          for(var i=0; i<elts.length; i++) {
            url = relativeToAbsoluteUrl(elts[i].src);
            if(request.filter === url) {
              // This is hopefully our element. In case of multiple elements
              // with the same src, only one will be highlighted.
              target = elts[i];
              break;
            }
          }
        }
        // Following test will be true if we found the element with the filter URL
        if(request.filter === url)
        {
          // This request would have come from the chrome.contextMenu handler, so we
          // simulate the user having chosen the element to get rid of via the usual means.
          clickHide_activated = true;
          // FIXME: clickHideFilters is erased in clickHide_mouseClick anyway, so why set it?
          clickHideFilters = [request.filter];
          // Coerce red highlighted overlay on top of element to remove.
          // TODO: Wow, the design of the clickHide stuff is really dumb - gotta fix it sometime
          currentElement = addElementOverlay(target);
          // clickHide_mouseOver(lastRightClickEvent);
          clickHide_mouseClick(lastRightClickEvent);
        }
        else
          console.log("clickhide-new-filter: URLs don't match. Couldn't find that element.", request.filter, url, lastRightClickEvent.target.src);
        break;
      case "remove-ads-again":
        // Called when a new filter is added
        if (isExperimental != true)
          removeAdsAgain();
        break;
      default:
        sendResponse({});
        break;
    }
  });

  if (isExperimental != true)
  {
    chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response)
    {
      enabled = response.enabled;
      if(enabled)
      {
        // Nuke background if it's an ad
        var bodyBackground = getComputedStyle(document.body).backgroundImage;
        if (bodyBackground && /^url\((.*)\)$/.test(bodyBackground) && shouldBlock(RegExp.$1, "IMAGE"))
          document.body.style.setProperty("background-image", "none", "important");
      }
    });
  }
}
