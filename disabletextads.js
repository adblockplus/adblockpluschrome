// This file derived from:
// ==UserScript==
// @name          Disable Text Ads
// @namespace     http://www.fibble.org/
// @description   Disables inline text ads from Vibrant Media (IntelliTXT), AdBrite, Infolicious (lingoSpot), Kontera, Linkworth, EchoTopic, Targetpoint (defunct?), MediaText (defunct), ResultLinks, Chitika and Infolinks.
// @version 9.0
// @include       http://*
// ==/UserScript==

chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response2) {
    if(response2.enabled) {
        chrome.extension.sendRequest({reqtype: "get-localstorage-option", name: "disableInlineTextAds"}, function(response) {
            if(response.value === "true") {

var disableTextAds = {
    blockAds: function(elt) {
        var target = elt;
        var childNode;
        
        switch(elt.nodeName.toLowerCase()) {
        // EchoTopic and ResultLinks wrap their inserted links in a <nobr> tag.
        case 'nobr':
            if (elt.firstChild && elt.firstChild.nodeName != '#text') {
                if (elt.firstChild.getAttribute('class') == "tfTextLink") { //EchoTopic
                    childNode = elt.firstChild.firstChild;
                } else if (elt.firstChild.hasAttribute('id') && elt.firstChild.getAttribute('id').search(/RLLINK/) >= 0) { //ResultLinks
                    childNode = elt.firstChild.firstChild;        
                }
            }
            break;

            // AdBrite check
            case 'ispan':
            if (elt.hasAttribute('id')) {
                if (match = elt.getAttribute('id').match(/AdBriteInlineAd_(.*)/i)) {
                    childNode = document.createTextNode(match[1]);
                }
            }
            break;
      
        // Chitika
        case 'span':
            var span_class = elt.getAttribute('class');
            switch(span_class) {
                case 'IL_AD': // Infolinks
                childNode = elt.firstChild;
                break;
        
                default:
                if (elt.firstChild && elt.firstChild.nodeName.toLowerCase() == 'a') {
                    if (elt.getAttribute('class') != null && elt.getAttribute('class').search(/lx-link/) >= 0) {
                        childNode = elt.firstChild.firstChild;
                        break;          
                    }
                }
            }

        // The rest of the networks
        case 'a':
            var a_class = elt.getAttribute('class');

            switch(a_class) {
            // Infolinks
            case 'IL_LINK_STYLE':
            // Heyos
            case 'contextual':
                childNode = elt.firstChild;
                break;

            // Kontera
            case 'kLink':
                childNode = disableTextAds.findKonteraText(elt);
                break;        
            }
      
            // IntelliTXT
            if (elt.hasAttribute('itxtdid')) {
                childNode = elt.firstChild;
                break;
            }

            // Old AdBrite check - not sure if this is still relevant
            if (elt.hasAttribute('id')) {
                if (match = elt.getAttribute('id').match(/AdBriteInlineAd_(.*)/i)) {
                  childNode = document.createTextNode(match[1]);
                }
                break;
            }

            // Can't be too cautious.
            break;
        } // case

        // Grab the inner text and replace the inserted tag with it
        if (childNode) {
            target.parentNode.replaceChild(childNode, target);
        }
    },

    findKonteraText: function(elt) {
        // kontera triply-nests the original content: 
        // <a><font><span>text</span><span>here</span></font></a>

        var kTextNodes = document.evaluate("font/span[@class='kLink']/text()", elt, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        var kTextNode = kTextNodes.iterateNext();
        var content = '';
        while(kTextNode) {
            content += kTextNode.data + ' ';
            kTextNode = kTextNodes.iterateNext();
        }

        return document.createTextNode(content.substring(0,content.length-1));
    }
};

document.addEventListener('DOMNodeInserted', function(event) { disableTextAds.blockAds(event.target); }, true);

// Handle the cases that don't trigger our DOMNodeInserted hook.
window.addEventListener("load", function(event) {
    // According to LingoSpot, setting this global variable will disable all ads.  Doesn't actually see to have any effect.
    //unsafeWindow.LINGOSPOT_DISABLED = true;

    // Thanks to Descriptor for yet another way to block LingoSpot; doesn't on every page, unfortunately.
    // Still, it should reduce runtime for pages where it works.
    //unsafeWindow.tf_maxKeywords = 0;

    // Unfortunately, Linkworth has decided to remove their container div, so we're stuck crawling the entire document body.  Meh.
    var links = document.evaluate("//a[@class='lw_cad_link' or @itxtdid]", document.body, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    for (var i=0; i<links.snapshotLength; i++) { 
        var anchor = links.snapshotItem(i);
        anchor.parentNode.replaceChild(document.createTextNode(anchor.textContent), anchor);
    }

}, false);

// Look again for links - for some reason this doesn't always work if run in the window.load handler
$("a").each(function(i) { disableTextAds.blockAds(this); });

// Chrome calls
            }
        });
    }
}); 
