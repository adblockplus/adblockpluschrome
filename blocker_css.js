// Loads selectors, saves them, and adds CSS to the page that hides them.
// The elements themselves aren't there yet, but hopefully this will hide them a little more quickly.
// At document_end, we actually remove them.

function loadSelectorsAndAddCSS(selectors) {
/*    chrome.extension.sendRequest({reqtype: "get-elemhide-selectors", domain: document.domain}, function(response) {
        if(response.selectors) {
    	    allSelectors = response.selectors.join(",");
            chrome.extension.sendRequest({reqtype: "insert-css", code: allSelectors + " { visibility: hidden !important; width: 0px !important; height 0px !important }"});
        }
    });
    //chrome.extension.sendRequest({reqtype: "insert-css", code: "img { display: none !important; }"});
    //addCSS("img { display: none !important; }");*/
}

var allSelectors = null; // Cache the selectors
loadSelectorsAndAddCSS();
