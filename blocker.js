// ABP content type flags - ignored for now
var TypeMap = {
  OTHER: 1, SCRIPT: 2, IMAGE: 4, STYLESHEET: 8, OBJECT: 16,
  SUBDOCUMENT: 32, DOCUMENT: 64, BACKGROUND: 256, XBL: 512,
  PING: 1024, XMLHTTPREQUEST: 2048, OBJECT_SUBREQUEST: 4096,
  DTD: 8192, MEDIA: 16384, FONT: 32768, ELEMHIDE: 0xFFFD
};

var enabled = false;
var serial = 0; // ID number for elements, indexes elementCache
var elementCache = new Array(); // Keeps track of elements that we may want to get rid of
var elementCacheOrigDisplay = {};
var allSelectors = null; // Cache the selectors

// Open a port to the extension
var port = chrome.extension.connect({name: "filter-query"});

function nukeSingleElement(elt) {
    //console.log("nukeSingleElement " + document.domain );
    if(elt.innerHTML) elt.innerHTML = "";
    if(elt.innerText) elt.innerText = "";
    // Probably vain attempt to stop scripts
    if(elt.src) elt.src = "";
    if(elt.language) elt.language = "Blocked!";
    elt.style.width = elt.style.height = "0px !important";

	var pn = elt.parentNode;
	//if(pn) pn.removeChild(elt);

	// Get rid of OBJECT tag enclosing EMBED tag
	if(pn && pn.tagName == "OBJECT" && pn.parentNode && pn.parentNode.tagName == "EMBED")
		pn.parentNode.removeChild(pn);    
}

// Set up message handlers. These remove undesirable elements from the page.
port.onMessage.addListener(function(msg) {
    if(msg.shouldBlockList) {
        if(enabled == true) {
            var ptr = 0;
            for(var i = 0; i < elementCache.length; i++) {
                var elt = elementCache[i];
                if(i == msg.shouldBlockList[ptr]) {
                    // It's an ad, nuke it
                    nukeSingleElement(elt);
                    ptr++;
                } else {
                    // Not an ad, show it
                    elt.style.visibility = "inherit";
                }
            }
        } else { // Restore visibility of all elements
            //console.log("Showing all in " + document.domain + " " + elementCache.length);
            for(var i = 0; i < elementCache.length; i++) {
                elementCache[i].style.visibility = "inherit";
            }
        }
        
    } else if(false && msg.shouldBlockList) {
        // Old code from when we weren't hiding everything and revealing non-ads
        // console.log("Nuking a list of things! " + msg.shouldBlockList.length);
        for(var i = 0; i < msg.shouldBlockList.length; i++) {
            var elt = elementCache[msg.shouldBlockList[i]];
            // if(elt.tagName == "IMG")
            //     console.log(msg.shouldBlockList[i] + "!!! " + elt.tagName + ":" + elt.src + " #" + elt.id + " ." + elt.className);
            nukeSingleElement(elt);
        }
        delete msg.shouldBlockList;
    }
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
    // background.html might want to know this document's domain
    if(request.reqtype == "get-domain") {
        sendResponse({domain: document.domain});
    } else if(request.reqtype == "clickhide-active?") {
        // Return any rules we might have constructed
        sendResponse({isActive: clickHide_activated, filters: clickHideFilters});
    } else if(request.reqtype == "clickhide-activate") {
        clickHide_activate();
    } else if(request.reqtype == "clickhide-deactivate") {
        clickHide_deactivate();
    } else if(request.reqtype == "remove-ads-again") {
        removeAdsAgain();
    } else
        sendResponse({});
});

var clickHide_activated = false;
var currentElement = null;
var currentElement_border = "";
var currentElement_backgroundColor;
var clickHideFilters = null;
var highlightedElementsSelector = null;
var highlightedElementsBorders = null;
var highlightedElementsBGColors = null;

function highlightElements(selectorString) {
    if(highlightedElementsSelector)
        unhighlightElements();
    
    highlightedElements = document.querySelectorAll(selectorString);
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

function unhighlightElements() {
    if(highlightedElementsSelector == null)
        return;
    highlightedElements = document.querySelectorAll(highlightedElementsSelector);
    for(var i = 0; i < highlightedElements.length; i++) {
        highlightedElements[i].style.border = highlightedElementsBorders[i];
        highlightedElements[i].style.backgroundColor = highlightedElementsBGColors[i];
    }
    highlightedElementsSelector = null;
}

// Turn on the choose element to create filter thing
function clickHide_activate() {
    if(currentElement) {
        currentElement.style.border = currentElement_border;
        currentElement.style.backgroundColor = currentElement_backgroundColor;
        currentElement = null;
        clickHideFilters = null;
    }
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

function clickHide_deactivate() {
    if(currentElement) {
        //currentElement.style.border = currentElement_border;
        //currentElement.style.backgroundColor = currentElement_backgroundColor;
        currentElement = null;
        clickHideFilters = null;
        unhighlightElements();
    }
    clickHide_activated = false;
    document.removeEventListener("mouseover", clickHide_mouseOver, false);
    document.removeEventListener("mouseout", clickHide_mouseOut, false);
    document.removeEventListener("click", clickHide_mouseClick, false);
    document.removeEventListener("keyup", clickHide_keyUp, false);
}


function clickHide_mouseOver(e) {
    if(clickHide_activated == false)
        return;
    
    if((e.target.id && e.target.id != "") || (e.target.className && e.target.className != "")) {
        currentElement = e.target;
        currentElement_border = e.target.style.border;
        currentElement_backgroundColor = e.target.style.backgroundColor;
        e.target.style.border = "1px solid #d6d84b";
        e.target.style.backgroundColor = "#f8fa47";
    }
}

function clickHide_mouseOut(e) {
    if(clickHide_activated == false || currentElement == null)
        return;
    
    currentElement.style.border = currentElement_border;
    currentElement.style.backgroundColor = currentElement_backgroundColor;
}

function clickHide_keyUp(e) {
    if(e.altKey && e.keyCode == 66)
        clickHide_mouseClick(e);
}

// When the user clicks, the currentElement is the one we want.
// We should have ABP rules ready for when the
// popup asks for them.
function clickHide_mouseClick(e) {
    if(clickHide_activated == false)
        return;
        
    // Eat the click event - could be a stray click
    e.preventDefault();
    e.stopPropagation();
    // If we don't have an element, let the user keep trying
    if(currentElement == null)
        return;

    // Construct ABP filter(s). The popup will retrieve these.
    // Only one ID
    var elementId = currentElement.id ? currentElement.id.split(' ').join('') : null;
    // Can have multiple classes...
    var elementClasses = currentElement.className ? currentElement.className.split(' ') : null;
    clickHideFilters = new Array();
    selectorList = new Array();
    if(elementId && elementId != "") {
        clickHideFilters.push(document.domain + "###" + elementId);
        selectorList.push("#" + elementId);
    }
    if(elementClasses && elementClasses.length > 0) {
        for(var i = 0; i < elementClasses.length; i++) {
            clickHideFilters.push(document.domain + "##." + elementClasses[i]);
            selectorList.push("." + elementClasses[i]);
        }
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
function removeAdsAgain() {
    if(enabled) {
        allSelectors = null;
        loadSelectorsAndAddCSS();
        nukeElements();
    }
}

// Block ads in nodes inserted by scripts
function handleNodeInserted(e) {
    nukeElements(e.relatedNode);
}

function nukeElements(parent) {
    elts = $("img,object,iframe", parent);
	types = new Array();
	urls = new Array();
	serials = new Array();
//	elementCache = new Array();
	for(i = 0; i < elts.length; i++) {
		elementCache.push(elts[i]);
		//var url = elts[i].tagName == "OBJECT" ? elts[i].getAttribute("data") : elts[i].getAttribute("src");
		var url = elts[i].getAttribute("src");
		if(url) {
		    // TODO: Some rules don't include the domain, and the blacklist
		    // matcher doesn't match on queries that don't include the domain
		    if(!url.match(/^http/)) url = "http://" + document.domain + url;
    		types.push(4); // TypeMap constants are ignored for now
    		urls.push(url);
    		serials.push(serial);
	    }
		serial++;
	}
	// Ask background.html which of these elements we should nuke
	port.postMessage({reqtype: "should-block-list?", urls: urls, types: types, serials: serials, domain: document.domain});
	// Special case many Google and BBC ads.
	// TODO: move this into a user-editable list
    if(enabled) $("[id^=google_ads_div],[id^=bbccom_mpu],[id^=bbccom_leaderboard]").remove();
	
}
// DOMContentLoaded seems to fire earlier than the Chrome-specific
// document_end thing that is specified in manifest.json. I don't know if that's
// actually true but anecdotally it looks better.

chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response) {
    enabled = response.enabled;
    // Nuke (or show) ads by src
    nukeElements(document);
    document.addEventListener("DOMNodeInserted", handleNodeInserted, false);
    // Restore the ads if ad blocking is disabled for this domain. How sad!
    chrome.extension.sendRequest({reqtype: "get-elemhide-selectors", domain: document.domain}, function(response) {
        var elts = $(response.selectors.join(","));
        if(!enabled) {
            for(var i = 0; i < elts.length; i++) {
                elts[i].style.visibility = "inherit";
            }
        } else {
            for(var i = 0; i < elts.length; i++)
                elts[i].style.visibility = "hidden";
        }
    });
});