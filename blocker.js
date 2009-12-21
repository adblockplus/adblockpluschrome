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

var enabled = false;
var experimentalEnabled = false;
var serial = 0; // ID number for elements, indexes elementCache
var elementCache = new Array(); // Keeps track of elements that we may want to get rid of
var elementCacheOrigDisplay = {};
var elemhideSelectorsString = null; // Cache the selectors
var nukeElementsTimeoutID = 0;
var hideElementsTimeoutID = 0;

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
var port = chrome.extension.connect({name: "filter-query"});

function nukeSingleElement(elt) {
    //console.log("nukeSingleElement " + document.domain );
    if(elt.innerHTML) elt.innerHTML = "";
    if(elt.innerText) elt.innerText = "";
    // Probably vain attempt to stop scripts
    if(elt.tagName == "SCRIPT" && elt.src) elt.src = "";
    if(elt.language) elt.language = "Blocked!";
    elt.style.width = elt.style.height = "0px !important";
    elt.style.visibility = "hidden !important";

	var pn = elt.parentNode;
	//if(pn) pn.removeChild(elt);

	// Get rid of OBJECT tag enclosing EMBED tag
	if(pn && pn.tagName == "EMBED" && pn.parentNode && pn.parentNode.tagName == "OBJECT")
		pn.parentNode.removeChild(pn);    
}

// Set up message handlers. These remove undesirable elements from the page.
port.onMessage.addListener(function(msg) {
    if(msg.shouldBlockList) {
        if(enabled == true) {
            var ptr = 0;
            for(var i = 0; i < elementCache.length; i++) {
                if(i == msg.shouldBlockList[ptr]) {
                    // It's an ad, nuke it
                    nukeSingleElement(elementCache[i]);
                    ptr++;
                }
            }
        }
        // Take away our injected CSS, leaving only ads hidden
        if(styleElm) {
            document.documentElement.removeChild(styleElm);
            styleElm = null;
        }
    }
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
    // background.html might want to know this document's domain
    if(request.reqtype == "get-domain") {
        sendResponse({domain: document.domain});
    } else if(request.reqtype == "clickhide-active?") {
        // No longer used...
        sendResponse({isActive: clickHide_activated});
    } else if(request.reqtype == "clickhide-activate") {
        clickHide_activate();
    } else if(request.reqtype == "clickhide-deactivate") {
        clickHide_deactivate();
    } else if(request.reqtype == "remove-ads-again") {
        removeAdsAgain();
    } else
        sendResponse({});
});

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
        unhighlightElements();
        currentElement.style.border = currentElement_border;
        currentElement.style.backgroundColor = currentElement_backgroundColor;
        currentElement = null;
        clickHideFilters = null;
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
    
    if(e.target.id || e.target.className) {
        currentElement = e.target;
        currentElement_border = e.target.style.border;
        currentElement_backgroundColor = e.target.style.backgroundColor;
        e.target.style.border = "1px solid #d6d84b";
        e.target.style.backgroundColor = "#f8fa47";
    }
}

function clickHide_mouseOut(e) {
    if(!clickHide_activated || !currentElement)
        return;
    
    currentElement.style.border = currentElement_border;
    currentElement.style.backgroundColor = currentElement_backgroundColor;
}

function clickHide_keyUp(e) {
    // Ctrl+Shift+E
    if(e.ctrlKey && e.shiftKey && e.keyCode == 69)
        clickHide_mouseClick(e);
}

// When the user clicks, the currentElement is the one we want.
// We should have ABP rules ready for when the
// popup asks for them.
function clickHide_mouseClick(e) {
    if(!clickHide_activated)
        return;
        
    // Eat the click event - could be a stray click
    e.preventDefault();
    e.stopPropagation();
    // If we don't have an element, let the user keep trying
    if(!currentElement)
        return;
        
    // Construct ABP filter(s). The popup will retrieve these.
    // Only one ID
    var elementId = currentElement.id ? currentElement.id.split(' ').join('') : null;
    // Can have multiple classes...
    var elementClasses = currentElement.className ? currentElement.className.split(' ') : null;
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
    chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response) {
        if(response.enabled) {
            elemhideSelectorsString = null; // Cache is dirty
            hideElements(document);
            nukeElements(document);
        }
    });
}

// Block ads in nodes inserted by scripts
function handleNodeInserted(e) {
    // Remove ads relatively infrequently. If no timeout set, set one.
    if(enabled) { 
        if(nukeElementsTimeoutID == 0)
            nukeElementsTimeoutID = setTimeout(nukeElements, 1000);
        // Querying with all those selectors takes a lot of time (whether with
        // jQuery or querySelectorsAll) so do this even more rarely
        if(hideElementsTimeoutID == 0)
            hideElementsTimeoutID = setTimeout(hideElements, 5000);
    }
}

function hideAndNukeElements(parent) {
    //var now = new Date().getTime();
    hideElements(parent); // Really slow!
    nukeElements(parent);
    //console.log("That took " + ((new Date()).getTime() - now) + " ms");
}

// Slow! Don't call this too often.
function hideBySelectorsString(selectorsString, parent) {
    //var now = new Date().getTime();
    if(enabled) {
        var elts = $(selectorsString, parent);
        for(var i = 0; i < elts.length; i++) {
            // TODO: Sometimes style isn't defined, for some reason...
            try { elts[i].style.visibility = "hidden"; } catch(err) {}
            try { elts[i].style.display = "none"; } catch(err) {}
        }
    }
    //console.log("That took " + ((new Date()).getTime() - now) + " ms");
}

function hideElements(parent) {
    if(elemhideSelectorsString == null) {
        chrome.extension.sendRequest({reqtype: "get-elemhide-selectors", domain: document.domain}, function(response) {
            elemhideSelectorsString = response.selectors.join(",");
            hideBySelectorsString(elemhideSelectorsString, parent);
        });
    } else {
        hideBySelectorsString(elemhideSelectorsString, parent);
    }
    
    // Allow running again after some interval
    hideElementsTimeoutID = 0;
}

function nukeElements(parent) {
    elts = $("img,object,iframe,embed", parent);
    // console.log("nukeElements " + elts.length);
	types = new Array();
	urls = new Array();
	serials = new Array();
	for(var i = 0; i < elts.length; i++) {
		elementCache.push(elts[i]);
		var url;
		// Check children of object nodes for "param" nodes with name="movie" that specify a URL
		// in value attribute
		if(elts[i].tagName == "OBJECT" && !(url = elts[i].getAttribute("data"))) {
		    // No data attribute, look in PARAM child tags
		    var params = $("param[name=\"movie\"]", elts[i]);
		    // This OBJECT could contain an EMBED we already nuked, in which case there's no URL
		    if(params[0]) url = params[0].getAttribute("value");
	    } else {
	        url = elts[i].getAttribute("src");
        }

		if(url) {
		    // TODO: Some rules don't include the domain, and the blacklist
		    // matcher doesn't match on queries that don't include the domain
		    if(!url.match(/^http/)) url = "http://" + document.domain + url;
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
	// Special case many Google and BBC ads.
	// TODO: move this into a user-editable list
    // if(enabled) { 
    //     $("object[width=\"728\" height=\"90\"],[id^=google_ads_div],[id^=AdBrite],[id^=AD_]").remove();
    // }
	
    nukeElementsTimeoutID = 0;
}

chrome.extension.sendRequest({reqtype: "get-experimental-enabled-state"}, function(response2) {
    experimentalEnabled = response2.experimentalEnabled;
    chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response) {
        enabled = response.enabled;
        if(enabled) {
            // Hide ads by selector using CSS
            hideElements(document);
            // Nuke ads by src
            nukeElements(document);
            document.addEventListener("DOMNodeInserted", handleNodeInserted, false);
        } else if (styleElm) {
            // Disabled, so take away initially injected stylesheet
            document.documentElement.removeChild(styleElm);
            styleElm = null;
        }
        
    });
});