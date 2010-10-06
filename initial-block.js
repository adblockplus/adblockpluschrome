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
    "LINK": TypeMap.STYLESHEET,
    "OBJECT": TypeMap.OBJECT,
    "EMBED": TypeMap.OBJECT,
    "IFRAME": TypeMap.SUBDOCUMENT
};

// Merely listening to the beforeload event messes up various websites that zoom thumbnail images
// and load replace them with full size images (e.g. Highslide, t.sina.com.cn. issue 166). This
// could be a Chrome bug, or else people depending on behavior that is not guaranteed by standards.
// So for these cases we avoid listening to beforeload and instead depend on handleNodeInserted()
// in blocker.js to get rid of ads by element src URL.
// Unfortunately we can't do this with filter rules because we would need to query the backend to
// check our domain, which cannot respond in time due to the lack of synchronous message passing.
var BEFORELOAD_MALFUNCTION_DOMAINS = {"t.sina.com.cn": true};
var workaroundBeforeloadMalfunction = document.domain in BEFORELOAD_MALFUNCTION_DOMAINS;

var elemhideSelectorStrings = []; // Cache the elemhide selector strings
var SELECTOR_GROUP_SIZE = 20;
var FLASH_SELECTORS = 'embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';
var TEMP_adservers = null;

var savedBeforeloadEvents = new Array();

// WebKit apparently chokes when the selector list in a CSS rule is huge.
// So we split the elemhide selectors into groups.
function makeSelectorStrings(selectors) {
    var ptr = 0;
    if(!selectors) return;
    for(var i = 0; i < selectors.length; i += SELECTOR_GROUP_SIZE) {
        elemhideSelectorStrings[ptr++] = selectors.slice(i, i + SELECTOR_GROUP_SIZE).join(",");
    }
}

// Makes a string containing CSS rules for elemhide filters
function getElemhideCSSString() {
    var s = "";
    for(var i in elemhideSelectorStrings) {
        s += elemhideSelectorStrings[i] + " { display: none !important } ";
    }
    return s;
}

// Remove a particular element.
function nukeSingleElement(elt) {
    if(elt.innerHTML) elt.innerHTML = "";
    if(elt.innerText) elt.innerText = "";
    elt.style.display = "none";
    elt.style.visibility = "hidden";

    var pn = elt.parentNode;
    if(pn) pn.removeChild(elt);

    // Get rid of OBJECT tag enclosing EMBED tag
    if(pn && pn.tagName == "EMBED" && pn.parentNode && pn.parentNode.tagName == "OBJECT") {
        pn.parentNode.removeChild(pn);
    }
}

// Converts relative to absolute URL
// e.g.: foo.swf on http://example.com/whatever/bar.html
//  -> http://example.com/whatever/foo.swf 
function relativeToAbsoluteUrl(url) {
    // If URL is already absolute, don't mess with it
    if(!url || url.match(/^http/i)) return url;
    // Leading / means absolute path
    if(url[0] == '/') {
        return document.location.protocol + "//" + document.location.host + url;
    }
    // Remove filename and add relative URL to it
    var base = document.baseURI.match(/.+\//);
    if(!base) return document.baseURI + "/" + url;
    return base[0] + url;
}

// Extracts a domain name from a URL
function TEMP_extractDomainFromURL(url) {
    if(!url) return "";
    var x = url.substr(url.indexOf("://") + 3);
    x = x.substr(0, x.indexOf("/"));
    x = x.substr(x.indexOf("@") + 1);
    colPos = x.indexOf(":");
    if(colPos >= 0)
        x = x.substr(0, colPos);
    return x;
}

// Horrible hack
function TEMP_isAdServer(domain) {
  domain = domain.replace(/\.+$/, "").toLowerCase();

  for(;;) {
    if (domain in TEMP_adservers)  return true;
    var nextDot = domain.indexOf(".");
    if(nextDot < 0) break;
    domain = domain.substr(nextDot + 1);
  }
  return false;
}

// This beforeload handler is used before we hear back from the background process about
// whether we're enabled etc. It saves the events so we can replay them to the normal
// beforeload handler once we know whether we're enabled - to catch ads that might have
// snuck by.
function saveBeforeloadEvent(e) {
    savedBeforeloadEvents.push(e);
}

// Responds to beforeload events by nuking the element if it's an ad.
// First just checks the server to avoid an asynchronous call to the back end.
// If it isn't a known ad server, we have to ask the backend, which won't
// return in time for preventDefault().
// We don't normalize the URL here because the backend will do it.
function beforeloadHandler(e) {
    var eltDomain = TEMP_extractDomainFromURL(e.url);
    // Primitive version of third-party check
    if(eltDomain && !TEMP_isAdServer(document.domain) && TEMP_isAdServer(eltDomain)) {
        e.preventDefault();
        if(e.target) nukeSingleElement(e.target);
    } else {
        var url = relativeToAbsoluteUrl(e.url);
        chrome.extension.sendRequest({reqtype: "should-block?", url: url, type: TagToType[e.target.tagName], domain: document.domain}, function(response) {
            if(response.block) nukeSingleElement(e.target);
        });
    }
}

if(!workaroundBeforeloadMalfunction) {
    document.addEventListener("beforeload", saveBeforeloadEvent, true);
}

// Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
if (document instanceof HTMLDocument) {
    // Use a style element for elemhide selectors and to hide page elements that might be ads.
    // We'll remove the latter CSS rules later.
    var initialHideElt = document.createElement("style");
    var elemhideElt = document.createElement("style");
    elemhideElt.setAttribute("__adthwart__", "ElemHide");
    
    // So we know which one to remove later. We can't use the title attribute because:
    // On sites where there is a <script> before a <link> or <style>, the styles are recalculated
    // an extra time because scripts can change styles. When this happens, the first stylesheet
    // with a title is considered to be the preferred stylesheet and the others are considered
    // to be alternates and thus ignored. This is a moronic way to specify the preferred stylesheet
    // and this is just another example of how miserably bad W3C is at designing the DOM.
    // The only reason this wasn't broken to start with was that WebKit didn't notice the title
    // attribute on the __adthwart__ style element without the extra style recalc triggered by the
    // script tag. Sheesh.
    initialHideElt.setAttribute("__adthwart__", "InitialHide");

    chrome.extension.sendRequest({reqtype: "get-initialhide-options"}, function(response) {
        makeSelectorStrings(response.selectors);
        elemhideElt.innerText += getElemhideCSSString();
        if(response.enabled) {
            if(!document.domain.match(/youtube.com$/i)) {
                // XXX: YouTube's new design apparently doesn't load the movie player if we hide it.
                // I'm guessing Chrome doesn't bother to load the Flash object if it isn't displayed,
                // but later removing that CSS rule doesn't cause it to actually be loaded. The
                // rest of the Internet - and YouTube's old design - seem to be OK, though, so I dunno.
                initialHideElt.innerText += FLASH_SELECTORS + " { display: none !important } ";
            }
            initialHideElt.innerText += "iframe { visibility: hidden !important } ";
            if(!response.noInitialHide) document.documentElement.insertBefore(initialHideElt, null);
	        document.documentElement.insertBefore(elemhideElt, null);

            // HACK to hopefully block stuff on beforeload event.
            // Because we are in an asynchronous callback, the page may be partially loaded before
            // the event handler gets attached. So some things might get through at the beginning.
            TEMP_adservers = response.priorityAdServers;
            if(!workaroundBeforeloadMalfunction) {
                document.removeEventListener("beforeload", saveBeforeloadEvent, true);
                document.addEventListener("beforeload", beforeloadHandler, true);
                // Replay the events that were saved while we were waiting to learn whether we are enabled
                for(var i = 0; i < savedBeforeloadEvents.length; i++) {
                    beforeloadHandler(savedBeforeloadEvents[i]);
                }
                delete savedBeforeloadEvents;
            }
        }
    });
}
