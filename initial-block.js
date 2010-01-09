var elemhideSelectorsString = null; // Cache the elemhide selectors
var FLASH_SELECTORS = '__adthwart__, embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';

// Use separate style elements for hiding all images and Flash (will be disabled later)
// and elemhide filters (won't be disabled later)
var styleElm = document.createElement("style");
styleElm.title = "__adthwart__"; // So we know which one to remove later
styleElm.innerText = "__adthwart__, img { visibility: hidden !important } __adthwart__, iframe { display: none !important } " + FLASH_SELECTORS + " { display: none !important } ";

var elemhideStyleElm = document.createElement("style");
elemhideStyleElm.title = "__adthwart__elemhide";
chrome.extension.sendRequest({reqtype: "get-experimental-enabled-state"}, function(response) {
    if(response.enabled && response.experimentalEnabled) {
        elemhideSelectorsString = response.selectors.join(",");
        elemhideStyleElm.innerText = elemhideSelectorsString + " { display: none !important }";
        styleElm.innerText = styleElm.innerText + elemhideSelectorsString + " { display: none !important }";
    }
    document.documentElement.insertBefore(styleElm, null);
    // This doesn't actually appear to be added
    //document.documentElement.insertBefore(elemhideStyleElm, styleElm);
});
