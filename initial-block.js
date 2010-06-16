// This file (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this file without restriction.

var elemhideSelectorStrings = []; // Cache the elemhide selector strings
var SELECTOR_GROUP_SIZE = 20;
var FLASH_SELECTORS = 'embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';
var TEMP_adservers = null;

// WebKit apparently chokes when the selector list in a CSS rule is huge.
// So we split the elemhide selectors into groups.
function makeSelectorStrings(selectors) {
    var ptr = 0;
    if(!selectors) return;
    for(i = 0; i < selectors.length; i += SELECTOR_GROUP_SIZE) {
        elemhideSelectorStrings[ptr++] = selectors.slice(i, i + SELECTOR_GROUP_SIZE).join(",");
    }
}

// Makes a string containing CSS rules for elemhide filters
function getElemhideCSSString() {
    var s = "";
    for(i in elemhideSelectorStrings) {
        s += elemhideSelectorStrings[i] + " { display: none !important } ";
    }
    return s;
}

// Extracts a domain name from a URL
function TEMP_extractDomainFromURL(url) {
    if(!url) return "";
    x = url.substr(url.indexOf("://") + 3);
    x = x.substr(0, x.indexOf("/"));
    x = x.substr(x.indexOf("@") + 1);
    colPos = x.indexOf(":");
    if(colPos >= 0)
        x = x.substr(0, colPos);
    return x;
}

// Horrible hack
function TEMP_isAdServer(docDomain) {
  docDomain = docDomain.replace(/\.+$/, "").toLowerCase();

  for(;;) {
    if (docDomain in TEMP_adservers)
      return true;
    var nextDot = docDomain.indexOf(".");
    if(nextDot < 0)
      break;
    docDomain = docDomain.substr(nextDot + 1);
  }
  return false;
}

// Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
if (document instanceof HTMLDocument) {
    // Use a style element for elemhide selectors and to hide page elements that might be ads.
    // We'll remove the latter CSS rules later.
    var styleElm = document.createElement("style");
    styleElm.title = "__adthwart__"; // So we know which one to remove later

    chrome.extension.sendRequest({reqtype: "get-initialhide-options"}, function(response) {
        makeSelectorStrings(response.selectors);
        if(response.enabled) {
            if(!document.domain.match(/youtube.com$/i)) {
                // XXX: YouTube's new design apparently doesn't load the movie player if we hide it.
                // I'm guessing Chrome doesn't bother to load the Flash object if it isn't displayed,
                // but later removing that CSS rule doesn't cause it to actually be loaded. The
                // rest of the Internet - and YouTube's old design - seem to be OK, though, so I dunno.
                styleElm.innerText += FLASH_SELECTORS + " { display: none !important } ";
            }
            styleElm.innerText += "iframe { visibility: hidden !important } ";
            styleElm.innerText += getElemhideCSSString();
            if(response.shouldInject)
    	        document.documentElement.insertBefore(styleElm, null);

            // HACK to hopefully block stuff on beforeload event.
            // Because we are in an asynchronous callback, the page may be partially loaded before
            // the event handler gets attached. So some things might get through at the beginning.
            if(response.beforeloadBlocking) {
                TEMP_adservers = response.TEMP_adservers;
                document.addEventListener("beforeload", function (e) {
                    var eltDomain = TEMP_extractDomainFromURL(e.url);
                    // Primitive version of third-party check
                    if(eltDomain && !TEMP_isAdServer(document.domain) && TEMP_isAdServer(eltDomain)) {
                        e.preventDefault();
                    }
                }, true);
            }
        }
    });
}