// This file (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this file without restriction.

var enabled = false; // Enabled for this particular domain.
var serial = 0; // ID number for elements, indexes elementCache
var elementCache = new Array(); // Keeps track of elements that we may want to get rid of
var nukeElementsTimeoutID = 0;
var nukeElementsLastTime = 0;

// Special cases
var specialCaseYouTube = false;
var pageIsYouTube = false;

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

// Port to background.htm
var port;

// We only remove the initial-hide stylesheet, leaving the elemhide stylesheet in place
// Sometimes there is, for some reason, more than one AdThwart stylesheet,
// so we replace all that we find.
function removeInitialHideStylesheet() {
    if(typeof initialHideElt == "undefined" || !initialHideElt) return;
    var elts = document.querySelectorAll("style[__adthwart__='InitialHide']");
    for(var i=0; i<elts.length; i++)
	    elts[i].innerText = "";
}

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
    if(!elt) return;
        
    // If element doesn't have at least one of class name, ID or URL, give up
    // because we don't know how to construct a filter rule for it
    var url = getElementURL(elt);
    if(!elt.className && !elt.id && !url) return;
    var thisStyle = getComputedStyle(elt, null);
    var overlay = document.createElement('div');
    overlay.prisoner = elt;
    overlay.prisonerURL = url;
    overlay.className = "__adthwart__overlay";
    overlay.setAttribute('style', 'opacity:0.4; background-color:#ffffff; display:inline-box; ' + 'width:' + thisStyle.width + '; height:' + thisStyle.height + '; position:absolute; overflow:hidden; -webkit-box-sizing:border-box; z-index: 9998');
    var pos = getAbsolutePosition(elt);
    overlay.style.left = pos[0] + "px";
    overlay.style.top = pos[1] + "px";
    // elt.parentNode.appendChild(overlay, elt);
    document.body.appendChild(overlay);
}

// Show dialog asking user whether she wants to add the proposed filters derived
// from selected page element
function clickHide_showDialog(left, top, filters) {
    // Limit the length the filters string shown so it doesn't clip
    var filtersString = "";
    for(var i = 0; i < filters.length; i++) {
        if(filters[i].length > 80)
            filtersString += filters[i].substring(0, 80) + "&hellip;";
        else
            filtersString += filters[i];
        filtersString += "<br/>";
    }
        
    clickHideFiltersDialog = document.createElement('div');
    clickHideFiltersDialog.setAttribute('style', 'visibility:hidden; -webkit-user-select:none; font-family: Helvetica,Arial,sans-serif !important; font-size: 10pt; color: #505050 !important; position: fixed; -webkit-box-shadow: 5px 5px 20px rgba(0,0,0,0.5); background: #ffffff; z-index: 99999; padding: 10px; border-radius: 5px');
    clickHideFiltersDialog.innerHTML = '<table style="margin:0px"><tr><td style="padding:0; background: #ffffff; padding-right: 5px; border: 0px; vertical-align: middle;"><img src="' + chrome.extension.getURL('icons/face-devilish-32.png') + '"/></td><td style="padding:0; background: #ffffff; text-align: left; vertical-align: middle; border: 0px;">' + chrome.i18n.getMessage('add_filters_msg') + '</td></tr></table><div style="border:1px solid #c0c0c0; padding:3px; min-width: 200px; font-size:8pt !important; line-height: 10pt !important; font-color: #909090 !important; background: #ffffff !important">' + filtersString + '</div>';

    buttonsDiv = document.createElement('div');
    buttonsDiv.setAttribute('style', 'text-align: right');
    function makeButton(id) {
        var b = document.createElement('button');
		b.setAttribute("id", id);
        // Use the jQuery UI style for the button explicitly
        b.setAttribute("style", "padding: 3px; margin-left: 5px; font-size: 8pt; border: 1px solid #d3d3d3; background: #e6e6e6 url(" + chrome.extension.getURL("jquery-ui/css/custom-theme/images/ui-bg_glass_75_e6e6e6_1x400.png") + ") 50% 50% repeat-x; color: #555555; -webkit-border-radius: 4px; font-family: Helvetica, Arial, sans-serif;");
        return b;
    }
    var addButton = makeButton("addButton");
    addButton.innerText = chrome.i18n.getMessage('add');
    addButton.onclick = function() {
        // Save the filters that the user created
        chrome.extension.sendRequest({reqtype: "cache-filters", filters: clickHideFilters});
    	chrome.extension.sendRequest({reqtype: "apply-cached-filters", filters: filters});
    	clickHide_deactivate();
    	removeAdsAgain();
    	clickHideFiltersDialog.setAttribute('style', 'visibility: hidden');
    	document.body.removeChild(clickHideFiltersDialog);
    	clickHideFiltersDialog = null;
    };
    var cancelButton = makeButton("cancelButton");
    cancelButton.innerText = chrome.i18n.getMessage('cancel');
    cancelButton.onclick = function() {
        // Tell popup (indirectly) to shut up about easy create filter
        chrome.extension.sendRequest({reqtype: "set-clickhide-active", active: false});
        clickHide_deactivate();
    	clickHideFiltersDialog.setAttribute('style', 'visibility: hidden');
    	document.body.removeChild(clickHideFiltersDialog);
    	clickHideFiltersDialog = null;
    }
    buttonsDiv.appendChild(addButton);
    buttonsDiv.appendChild(cancelButton);
    
    // Make dialog partly transparent when mouse isn't over it so user has a better
    // view of what's going to be blocked
    clickHideFiltersDialog.onmouseout = function() {
        clickHideFiltersDialog.style.setProperty("opacity", "0.7");
    }
    clickHideFiltersDialog.onmouseover = function() {
        clickHideFiltersDialog.style.setProperty("opacity", "1.0");
    } 
    
    clickHideFiltersDialog.appendChild(buttonsDiv);
    document.body.appendChild(clickHideFiltersDialog);
    // Position in upper-left all the time
    clickHideFiltersDialog.style.left = "50px";
    clickHideFiltersDialog.style.top = "50px";
    clickHideFiltersDialog.style.visibility = "visible";
}

// Turn on the choose element to create filter thing
function clickHide_activate() {
    if(document == null) return;
    
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
function clickHide_deactivate() {
    if(currentElement) {
        unhighlightElements();
        currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
        currentElement.style.backgroundColor = currentElement_backgroundColor;
        currentElement = null;
        clickHideFilters = null;
    }
    
    clickHide_activated = false;
    if(!document) return; // This can happen inside a nuked iframe...I think
    document.removeEventListener("mouseover", clickHide_mouseOver, false);
    document.removeEventListener("mouseout", clickHide_mouseOut, false);
    document.removeEventListener("click", clickHide_mouseClick, false);
    document.removeEventListener("keyup", clickHide_keyUp, false);
    
    // Remove overlays
    var overlays = document.querySelectorAll('.__adthwart__overlay');
	for (var i=0; i<overlays.length; i++) {
		overlays[i].parentNode.removeChild(overlays[i]);
	}
}

// Hovering over an element so highlight it
function clickHide_mouseOver(e) {
    if(clickHide_activated == false)
        return;
    
    if(e.target.id || e.target.className) {
        currentElement = e.target;
        currentElement_boxShadow = e.target.style.getPropertyValue("-webkit-box-shadow");
        currentElement_backgroundColor = e.target.style.backgroundColor;
        e.target.style.setProperty("-webkit-box-shadow", "inset 0px 0px 5px #d6d84b");
        e.target.style.backgroundColor = "#f8fa47";

        // TODO: save old context menu
        e.target.oncontextmenu = function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            clickHide_mouseClick(ev);
        };
    }
}

// No longer hovering over this element so unhighlight it
function clickHide_mouseOut(e) {
    if(!clickHide_activated || !currentElement)
        return;
    
    currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
    currentElement.style.backgroundColor = currentElement_backgroundColor;
    
    // TODO: restore old context menu
    currentElement.oncontextmenu = function(ev) {};
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
    if(currentElement.className && currentElement.className == "__adthwart__overlay") {
        elt = currentElement.prisoner;
        url = currentElement.prisonerURL;
    }
        
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
        selectorList.push(elt.tagName + '[src="' + url + '"]');
    }
    
    // Show popup
    clickHide_showDialog(e.clientX, e.clientY, clickHideFilters);

    // Highlight the unlucky elements
    // Restore currentElement's box-shadow and bgcolor so that highlightElements won't save those
    currentElement.style.setProperty("-webkit-box-shadow", currentElement_boxShadow);
    currentElement.style.backgroundColor = currentElement_backgroundColor;
    highlightElements(selectorList.join(","));
    currentElement.style.setProperty("-webkit-box-shadow", "inset 0px 0px 5px #fd1708");
    currentElement.style.backgroundColor = "#f6a1b5";

    // Half-deactivate click-hide so the user has a chance to click the page action icon.
    // currentElement is still set to the putative element to be blocked.
    clickHide_rulesPending();
}

// Called when a new filter is added.
// It would be a click-to-hide filter, so it's only an elemhide filter.
// Since this rarely happens, we can afford to do a full run of ad removal.
function removeAdsAgain() {
    chrome.extension.sendRequest({reqtype: "get-elemhide-selectors", domain: document.domain}, function(response) {
        // Retrieve new set of selectors and build selector strings
        makeSelectorStrings(response.selectors);
        hideBySelectorStrings(document);
        nukeElements(document);
    });
}

// Block ads in nodes inserted by scripts
function handleNodeInserted(e) {
    // Remove ads relatively infrequently. If no timeout set, set one.
    if(enabled) {
        if(nukeElementsTimeoutID == 0) {
            nukeElementsTimeoutID = setTimeout(nukeElements, (Date.now() - nukeElementsLastTime > 1000) ? 1 : 1000);
        }
    
        if(pageIsYouTube && e.target.id == "movie_player") {
            handleYouTubeFlashPlayer(e.target);
        }
    }
}

function hideBySelectorStrings(parent) {
    // In rare cases (don't know which ones exactly), initial-block.js might not have been run. 
    if(enabled && typeof(elemhideSelectorStrings) != "undefined") {
        // var now = new Date().getTime();
        for(i in elemhideSelectorStrings) {
            var elts = parent.querySelectorAll(elemhideSelectorStrings[i]);
            if(!elts) continue;
            for(var i = 0; i < elts.length; i++) {
                // TODO: Sometimes style isn't defined, for some reason...
                if(elts[i].style) {
                    elts[i].style.setProperty("visibility", "hidden");
                    elts[i].style.setProperty("display", "none");
                }
            }
        }        
        // console.log("That took " + ((new Date()).getTime() - now) + " ms");
    }
}

// Converts relative to absolute URL
// e.g.: foo.swf on http://example.com/whatever/bar.html
//  -> http://example.com/whatever/foo.swf 
function relativeToAbsoluteUrl(url) {
    if(!url)
        return url;
    // If URL is already absolute, don't mess with it
    if(url.match(/^http/i))
        return url;
    // Leading / means absolute path
    if(url[0] == '/')
        return document.location.protocol + "//" + document.location.host + url;

    // Remove filename and add relative URL to it
    var base = document.baseURI.match(/.+\//);
    if(!base) return document.baseURI + "/" + url;
    return base[0] + url;
}

// Extracts source URL from an IMG, OBJECT, EMBED, or IFRAME
function getElementURL(elt) {
    // Check children of object nodes for "param" nodes with name="movie" that specify a URL
    // in value attribute
    var url;
    if(elt.tagName == "OBJECT" && !(url = elt.getAttribute("data"))) {
        // No data attribute, look in PARAM child tags for a URL for the swf file
        var params = elt.querySelectorAll("param[name=\"movie\"]");
        // This OBJECT could contain an EMBED we already nuked, in which case there's no URL
        if(params[0])
            url = params[0].getAttribute("value");
        else {
            params = elt.querySelectorAll("param[name=\"src\"]");
            if(params[0]) url = params[0].getAttribute("value");
        }
    } else if(!url) {
        url = elt.getAttribute("src") || elt.getAttribute("href"); 
    }
    return url;
}

// Hides/removes image and Flash elements according to the external resources they load.
// (e.g. src attribute)
function nukeElements(parent) {
    if(typeof parent == 'undefined')
        parent = document;
    var elts = parent.querySelectorAll("img,object,iframe,embed,link");
    var types = new Array();
    var urls = new Array();
    var serials = new Array();
    var url;
    // Reinitialize elementCache since we won't reuse what's already in there
    delete elementCache;
    serial = 0;
    elementCache = new Array();
    for(var i = 0; i < elts.length; i++) {
        url = getElementURL(elts[i]);
        // If the URL of the element is the same as the document URI, the user is trying to directly
        // view the ad for some reason and so we won't block it.
        if(url && url != document.baseURI) {
            // Some rules don't include the domain, and the blacklist
            // matcher doesn't match on queries that don't include the domain
            url = relativeToAbsoluteUrl(url);
            // Guaranteed by call to querySelectorAll() above to be one of img, iframe, object, embed
            // and therefore we put it in this list
            elementCache.push(elts[i]);
            types.push(TagToType[elts[i].tagName]);
            urls.push(url);
            serials.push(serial);
            serial++;
        }
    }
    // Ask background.html which of these elements we should nuke
    port.postMessage({reqtype: "should-block-list?", urls: urls, types: types, serials: serials, domain: document.domain});
    // Clean up a bit in case GC doesn't do it
    delete urls;
    delete types;
    delete serials;
    
    nukeElementsTimeoutID = 0;
    nukeElementsLastTime = Date.now();
}

// flashvars is URL-encoded and dictates what ads will be shown in this video. So we modify it.
function handleYouTubeFlashPlayer(elt) {
    if(specialCaseYouTube && pageIsYouTube && elt) {
        var origFlashVars = elt.getAttribute("flashvars");
        // In the new YouTube design, flashvars could be in a <param> child node
        var inParam = false;
        if(!origFlashVars) {
            origFlashVars = elt.querySelector('param[name="flashvars"]');
            // Give up if we still can't find it
            if(!origFlashVars)
                return;
            inParam = true;
            origFlashVars = origFlashVars.getAttribute("value");
        }
        // Don't mess with the movie player object if we don't actually find any ads
        var adCheckRE = /&(ad_|prerolls|invideo|interstitial).*?=.+?(&|$)/gi;
        if(!origFlashVars.match(adCheckRE))
            return;
        // WTF. replace() just gives up after a while, missing things near the end of the string. So we run it again.
        var re = /&(ad_|prerolls|invideo|interstitial|watermark|infringe).*?=.+?(&|$)/gi;
        var newFlashVars = origFlashVars.replace(re, "&").replace(re, "&") + "&invideo=false&autoplay=1";
        var replacement = elt.cloneNode(true); // Clone child nodes also
        // Doing this stuff fires a DOMNodeInserted, which will cause infinite recursion into this function.
        // So we inhibit it using pageIsYouTube.
        pageIsYouTube = false;
        if(inParam) {
            // Grab new <param> and set its flashvars
            newParam = replacement.querySelector('param[name="flashvars"]');
            newParam.setAttribute("value", newFlashVars);
        } else {
            replacement.setAttribute("flashvars", newFlashVars);
        }
        // Add a delay between removing and re-adding the movie player to make it more
        // likely it will reinitialize properly.
        // Thanks Michael Gundlach and fryn for this idea and code
        var parent = elt.parentNode;
        // This seems to make Flash reload better; not sure why
        elt.style.visibility = "hidden";
        parent.removeChild(elt);
        
        setTimeout(function(parent, replacement) {
    		// Empty container - user may have clicked another video during
    		// the timeout and another video would have been inserted.
    		// This results in the wrong (first) video being shown, but it's better
    		// than two videos at once.
    		while(parent.firstChild)
    		    parent.removeChild(parent.firstChild);
        	parent.appendChild(replacement);
        	pageIsYouTube = true;
        }, 200, parent, replacement);
    }
}

// Content scripts are apparently invoked on non-HTML documents, so we have to
// check for that before doing stuff
if (document instanceof HTMLDocument) {
    port = chrome.extension.connect({name: "filter-query"});
    // Set up message handlers. These remove undesirable elements from the page.
    port.onMessage.addListener(function(msg) {
        if(msg.shouldBlockList && enabled == true) {
            for(var i = 0; i < msg.shouldBlockList.length; i++)
                nukeSingleElement(elementCache[msg.shouldBlockList[i]]);
            // Take away our initial-hide CSS, leaving only ads hidden
            removeInitialHideStylesheet();
        }
    });
    
    chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
        // background.html might want to know this document's domain
        if(request.reqtype == "get-domain") {
            sendResponse({domain: document.domain});
        } else if(request.reqtype == "clickhide-activate") {
            // So that popup can figure out what it's supposed to show
            chrome.extension.sendRequest({reqtype: "set-clickhide-active", active: true});
            clickHide_activate();
        } else if(request.reqtype == "clickhide-deactivate") {
            chrome.extension.sendRequest({reqtype: "set-clickhide-active", active: false});
            clickHide_deactivate();
        } else if(request.reqtype == "remove-ads-again") {
            // Called when a new filter is added
            removeAdsAgain();
        } else
            sendResponse({});
    });

    chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response) {
        enabled = response.enabled;
        specialCaseYouTube = response.specialCaseYouTube;
        if(enabled) {
            // Hide ads by selector using CSS
            // In some weird cases the elemhide style element might not stick, so we do this.
            hideBySelectorStrings(document);

            // Special-case YouTube video ads because they are so popular.
            if(document.domain.match(/youtube.com$/)) {
                pageIsYouTube = true;
                var elt = document.getElementById("movie_player");
                handleYouTubeFlashPlayer(elt);
            }        

            // Nuke ads by src. This will also cause removal of initial-block stylesheet.
            nukeElements(document);
            document.addEventListener("DOMNodeInserted", handleNodeInserted, false);

            // Nuke background if it's an ad
            var bodyBackground = getComputedStyle(document.body).getPropertyValue("background-image");
            if(bodyBackground && bodyBackground.substr(0, 4) == "url(") {
                bodyBackground = bodyBackground.substr(4, bodyBackground.length-5);
                chrome.extension.sendRequest({reqtype: "should-block?", type: TypeMap.BACKGROUND, url: bodyBackground}, function(response) {
                    document.body.style.setProperty("background-image", "none");
                });
            }
        }
    });

}
