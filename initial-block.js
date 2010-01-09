var elemhideSelectorsString = null; // Cache the elemhide selectors
var FLASH_SELECTORS = 'embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';

// Use separate style elements for hiding all images and Flash (will be disabled later)
// and elemhide filters (won't be disabled later)
var styleElm = document.createElement("style");
styleElm.title = "__adthwart__"; // So we know which one to remove later
var elemhideStyleElm = document.createElement("style");
elemhideStyleElm.title = "__adthwart__elemhide";
chrome.extension.sendRequest({reqtype: "get-experimental-enabled-state"}, function(response) {
    if(response.enabled && response.experimentalEnabled) {
        elemhideSelectorsString = response.selectors.join(",");
        styleElm.innerText = "img { visibility: hidden !important } iframe { display: none !important } " + FLASH_SELECTORS + " { display: none !important } ";
        elemhideStyleElm.innerText = elemhideSelectorsString + " { display: none !important }";
    }
    document.documentElement.insertBefore(styleElm, null);
    document.documentElement.insertBefore(elemhideStyleElm, null);
});
