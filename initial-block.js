var elemhideSelectorsString = null; // Cache the elemhide selectors

var styleElm = document.createElement("style");
styleElm.title = "__adthwart__"; // So we know which one to remove later
chrome.extension.sendRequest({reqtype: "get-experimental-enabled-state"}, function(response) {
    if(response.enabled && response.experimentalEnabled) {
        elemhideSelectorsString = response.selectors.join(",");
        styleElm.innerText = "img, iframe { visibility: hidden } object, embed { display: none } " + elemhideSelectorsString + " { visibility: hidden }";
    }
    document.documentElement.insertBefore(styleElm, null);
});
