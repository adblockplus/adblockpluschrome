// This file (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this file without restriction.

var elemhideSelectorsString = null; // Cache the elemhide selectors
var FLASH_SELECTORS = 'embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';

// Use separate style elements for hiding all images and Flash (will be disabled later)
// and elemhide filters (won't be disabled later)
var styleElm = document.createElement("style");
styleElm.title = "__adthwart__"; // So we know which one to remove later
//styleElm.innerText = "img { visibility: hidden !important } iframe { display: none !important } " + FLASH_SELECTORS + " { display: none !important } ";
styleElm.innerText = "";

var elemhideStyleElm = document.createElement("style");
elemhideStyleElm.title = "__adthwart__elemhide";
chrome.extension.sendRequest({reqtype: "get-initialhide-options"}, function(response) {
    if(response.enabled) {
        elemhideSelectorsString = response.selectors.join(",");
        elemhideStyleElm.innerText = elemhideSelectorsString + " { display: none !important }";
        if(response.initialHideImg)
            styleElm.innerText += "img { visibility: hidden !important } ";
        if(response.initialHideFlash && !document.domain.match(/youtube.com$/i)) {
            // XXX: YouTube's new design apparently doesn't load the movie player if we hide it.
            // I'm guessing Chrome doesn't bother to load the Flash object if it isn't displayed,
            // but later removing that CSS rule doesn't cause it to actually be loaded. The
            // rest of the Internet - and YouTube's old design - seem to be OK, though, so I dunno.
            styleElm.innerText += FLASH_SELECTORS + " { display: none !important } ";
        }
        if(response.initialHideIframe)
            styleElm.innerText += "iframe { visibility: hidden !important } ";
        styleElm.innerText += elemhideSelectorsString + " { display: none !important }";
        document.documentElement.insertBefore(styleElm, null);
    }
});
