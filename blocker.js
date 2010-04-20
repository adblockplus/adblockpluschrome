// This file (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this file without restriction.

// ABP content type flags
var TypeMap = {
  OTHER: 1, SCRIPT: 2, IMAGE: 4, STYLESHEET: 8, OBJECT: 16,
  SUBDOCUMENT: 32, DOCUMENT: 64, BACKGROUND: 256, XBL: 512,
  PING: 1024, XMLHTTPREQUEST: 2048, OBJECT_SUBREQUEST: 4096,
  DTD: 8192, MEDIA: 16384, FONT: 32768, ELEMHIDE: 0xFFFD
};

var TagToType = {
    "SCRIPT": TypeMap.SCRIPT,
    "IMG": TypeMap.IMAGE,
    "STYLE": TypeMap.STYLESHEET,
    "OBJECT": TypeMap.OBJECT,
    "EMBED": TypeMap.OBJECT,
    "IFRAME": TypeMap.SUBDOCUMENT
};

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
var currentElement_border = "";
var currentElement_backgroundColor;
var clickHideFilters = null;
var highlightedElementsSelector = null;
var highlightedElementsBorders = null;
var highlightedElementsBGColors = null;

// Open a port to the extension
var port;
if (document instanceof HTMLDocument)
    port = chrome.extension.connect({name: "filter-query"});

// Nuke a particular element.
function nukeSingleElement(elt) {
    if(elt.innerHTML) elt.innerHTML = "";
    if(elt.innerText) elt.innerText = "";
    // Probably vain attempt to stop scripts
    if(elt.tagName == "SCRIPT" && elt.src) elt.src = "";
    if(elt.language) elt.language = "Blocked!";
    elt.style.display = "none !important";
    elt.style.visibility = "hidden !important";

    var pn = elt.parentNode;
    if(pn) pn.removeChild(elt);

    // Get rid of OBJECT tag enclosing EMBED tag
    if(pn && pn.tagName == "EMBED" && pn.parentNode && pn.parentNode.tagName == "OBJECT")
        pn.parentNode.removeChild(pn);    
}

// Replaces our stylesheet with elemhide rules. This would in principle
// nuke the initial image, iframe, Flash hiding rules.
// Sometimes there is, for some reason, more than one AdThwart stylesheet,
// so we replace all that we find.
function removeInitialBlockStylesheet() {
    if(typeof styleElm == "undefined" || !styleElm) return;
    var theStyleElm = $("style[title=\"__adthwart__\"]").each(function(i) {
        this.innerText = getElemhideCSSString();
    });
}

// Set up message handlers. These remove undesirable elements from the page.
if (port)
port.onMessage.addListener(function(msg) {
    if(msg.shouldBlockList && enabled == true) {
        var ptr = 0;
        for(var i = 0; i < elementCache.length; i++) {
            if(i == msg.shouldBlockList[ptr]) {
                // It's an ad, nuke it
                nukeSingleElement(elementCache[i]);
                ptr++;
            }
        }
        // Take away our injected CSS, leaving only ads hidden
        removeInitialBlockStylesheet();
    }
});

if (document instanceof HTMLDocument)
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

// Highlight elements according to selector string. This would include
// all elements that would be affected by proposed filters.
function highlightElements(selectorString) {
    if(highlightedElementsSelector)
        unhighlightElements();
    
    highlightedElements = $(selectorString);
    highlightedElementsSelector = selectorString;
    highlightedElementsBorders = new Array();
    highlightedElementsBGColors = new Array();

    for(var i = 0; i < highlightedElements.length; i++) {
        highlightedElementsBorders[i] = highlightedElements[i].style.border;
        highlightedElementsBGColors[i] = highlightedElements[i].style.backgroundColor;
        highlightedElements[i].style.border = "1px solid #fd6738";
        highlightedElements[i].style.backgroundColor = "#f6e1e5";
    }
}

// Unhighlight all elements, including those that would be affected by
// the proposed filters
function unhighlightElements() {
    if(highlightedElementsSelector == null)
        return;
    highlightedElements = $(highlightedElementsSelector);
    for(var i = 0; i < highlightedElements.length; i++) {
        highlightedElements[i].style.border = highlightedElementsBorders[i];
        highlightedElements[i].style.backgroundColor = highlightedElementsBGColors[i];
    }
    highlightedElementsSelector = null;
}

// Add an overlay to an element, which is probably a Flash object
function addFlashOverlay(index, elt) {
    if(elt == null) elt = index;
    // If this element is enclosed in an object tag, we prefer to block that instead
    if(!elt /* || elt.parentNode.tagName == 'OBJECT' */)
        return;
        
    // check for URL
    var url = getFlashOrIframeURL(elt);
    if(!elt.className && !elt.id && !url)
        return;
    var thisStyle = getComputedStyle(elt, null);
    var overlay = document.createElement('div');
    overlay.prisoner = elt;
    overlay.prisonerURL = url;
    overlay.className = "__adthwart__overlay";
    overlay.setAttribute('style', 'opacity:0.5; background-color:#ffffff; display:inline-box; ' + 'width:' + thisStyle.width + '; height:' + thisStyle.height + '; position:absolute; overflow:hidden; -webkit-box-sizing:border-box;');
        
    // We use a zero-size enclosing div to position the overlay box correctly
    var outer = document.createElement('div');
    outer.setAttribute('style', 'position:relative; width: 0x; height: 0px;');
    outer.appendChild(overlay);        
    elt.parentNode.insertBefore(outer, elt);
    elt.overlayOuter = outer;
    return outer;
}

// Turn on the choose element to create filter thing
function clickHide_activate() {
    if(document == null) return;
    
    if(currentElement) {
        currentElement.style.border = currentElement_border;
        currentElement.style.backgroundColor = currentElement_backgroundColor;
        currentElement = null;
        clickHideFilters = null;
    }
    
    // Add overlays for Flash elements so user can actually click them
    $('object,embed').map(addFlashOverlay);
    
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
        currentElement.style.border = currentElement_border;
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
    $('.__adthwart__overlay').remove();
}

// Hovering over an element so highlight it
function clickHide_mouseOver(e) {
    if(clickHide_activated == false)
        return;
    
    if(e.target.id || e.target.className) {
        currentElement = e.target;
        currentElement_border = e.target.style.border;
        currentElement_backgroundColor = e.target.style.backgroundColor;
        e.target.style.border = "1px solid #d6d84b";
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
    
    currentElement.style.border = currentElement_border;
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
    // Can have multiple classes...
    var elementClasses = elt.className ? elt.className.split(' ') : null;
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
    
    // Save the filters that the user created
    chrome.extension.sendRequest({reqtype: "cache-filters", filters: clickHideFilters});

    // Highlight the unlucky elements
    // Restore currentElement's border and bgcolor so that highlightElements won't save those
    currentElement.style.border = currentElement_border;
    currentElement.style.backgroundColor = currentElement_backgroundColor;
    highlightElements(selectorList.join(","));
    currentElement.style.border = "1px solid #fd1708";
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
        if(nukeElementsTimeoutID == 0)
            nukeElementsTimeoutID = setTimeout(nukeElements, (Date.now() - nukeElementsLastTime > 1000) ? 1 : 1000);
    
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
            var elts = $(elemhideSelectorStrings[i], parent).get();
            if(!elts) continue;
            for(var i = 0; i < elts.length; i++) {
                // TODO: Sometimes style isn't defined, for some reason...
                try { elts[i].style.visibility = "hidden"; } catch(err) {}
                try { elts[i].style.display = "none"; } catch(err) {}
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
    if(url.match(/^http/))
        return url;
    // Leading / means absolute path
    if(url[0] == '/')
        return document.location.protocol + "//" + document.location.host + url;

    // Remove filename and add relative URL to it
    var base = document.baseURI.match(/.+\//);
    if(!base) return document.baseURI + "/" + url;
    return base[0] + url;
}

// Extracts source URL from an OBJECT, EMBED, or IFRAME
function getFlashOrIframeURL(elt) {
    // Check children of object nodes for "param" nodes with name="movie" that specify a URL
    // in value attribute
    var url;
    if(elt.tagName == "OBJECT" && !(url = elt.getAttribute("data"))) {
        // No data attribute, look in PARAM child tags for a URL for the swf file
        var params = $("param[name=\"movie\"]", elt);
        // This OBJECT could contain an EMBED we already nuked, in which case there's no URL
        if(params[0])
            url = params[0].getAttribute("value");
        else {
            params = $("param[name=\"src\"]", elt);
            if(params[0]) url = params[0].getAttribute("value");
        }
    } else {
        url = elt.getAttribute("src");
    }
    return url;
}

// Hides/removes image and Flash elements according to the external resources they load.
// (e.g. src attribute)
function nukeElements(parent) {
    var elts = $("img,object,iframe,embed", parent);
    var types = new Array();
    var urls = new Array();
    var serials = new Array();
    for(var i = 0; i < elts.length; i++) {
        elementCache.push(elts[i]);
        var url = getFlashOrIframeURL(elts[i]);
        if(url) {
            // Some rules don't include the domain, and the blacklist
            // matcher doesn't match on queries that don't include the domain
            url = relativeToAbsoluteUrl(url);
            // Guaranteed by call to $() above to be one of img, iframe, object, embed
            // and therefore in this list
            types.push(TagToType[elts[i].tagName]);
            urls.push(url);
            serials.push(serial);
        }
        serial++;
    }
    // Ask background.html which of these elements we should nuke
    port.postMessage({reqtype: "should-block-list?", urls: urls, types: types, serials: serials, domain: document.domain});
    
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
            newParam = replacement.querySelector('param[name="flashvars"]');;
            newParam.setAttribute("value", newFlashVars);
        } else {
            replacement.setAttribute("flashvars", newFlashVars);
        }
        // Add a delay between removing and re-adding the movie player to make it more
        // likely it will reinitialize properly.
        // Thanks Michael Gundlach and fryn for this idea and code
        var parent = elt.parentNode;
        parent.removeChild(elt);
        setTimeout(function(parent, replacement) {
		// Empty container - user may have clicked another video during
		// the timeout and another video would have been inserted.
		// This results in the wrong (first) video being shown, but it's better
		// than two videos at once.
		if (parent.firstChild) parent.innerHTML = "";
        	parent.appendChild(replacement);
        	pageIsYouTube = true;
        }, 200, parent, replacement);
    }
}

if (document instanceof HTMLDocument)
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
    }
});
