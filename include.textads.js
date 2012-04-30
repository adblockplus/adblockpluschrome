/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

// Explicitly removes inline text ads, in case we were unable to block the ad script itself
// in the beforeload handler.
function removeTextAdFromElement(elt) {
  // The DOMNodeInserted hooks means we get called for #text nodes, which means localName is null.
  // We don't touch those
  if(!elt.localName) return;
  var keepNode;
  switch(elt.localName.toUpperCase()) {
    // AdBrite
    case 'ISPAN':
      if(elt.id.indexOf('AdBriteInlineAd_') >= 0) {
        keepNode = document.createTextNode(elt.id.substr('AdBriteInlineAd_'.length));
      }
      break;
      
    // Chitika and InfoLinks
    case 'SPAN':
      var fc = elt.firstChild;
      if(!fc) break;
      if(elt.className == 'IL_AD') {
        keepNode = fc;
      } else if(fc.localName && fc.localName.toUpperCase() == 'A' && fc.className.indexOf('lx-link') >= 0) {
        keepNode = fc.firstChild;
      }
      break;
      
    // EchoTopic and ResultLinks
    case 'NOBR':
      var fc = elt.firstChild;
      if(fc && fc.nodeName != '#text' && (fc.className == 'tfTextLink' || fc.id.indexOf('RLLINK') >= 0)) {
        keepNode = fc.firstChild;
      }
      break;

    case 'A':
      // Some other ones, including LinkWorth, Kontera, Affinity
      switch(elt.className) {
        case 'IL_LINK_STYLE':
        case 'contextual':
        case 'lw_cad_link':
        case 'cm_word':
          keepNode = elt.firstChild;
          break;
        
        // Kontera really mangles the original text
        case 'kLink':
          var textNodes = elt.querySelectorAll('font > span'), text = "";
          for(var i = 0; i < textNodes.length; i++) text += textNodes[i].innerHTML;
          keepNode = document.createTextNode(text);
          break;
          
        default:
          // IntelliTxt
          if(elt.hasAttribute('itxtdid')) {
            keepNode = elt.firstChild;
            break;
          }

          // Not sure if this AdBrite check is still necessary
          if(elt.id.indexOf('AdBriteInlineAd_') >= 0) {
            keepNode = document.createTextNode(elt.id.substr('AdBriteInlineAd_'.length));
            break;
          }
      }
    break; // case 'A'
  }
  
  // Replace the offending node with the original content that was inside it
  if(keepNode) elt.parentNode.replaceChild(keepNode, elt);
}

chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response) {
  if(response.enabled && response.disableInlineTextAds) {
    // Listen for inserted nodes and process them as they come in
    var observer = new WebKitMutationObserver(function(mutations)
    {
      for (var i = 0; i < mutations.length; i++)
        for (var j = 0; j < mutations[i].addedNodes.length; j++)
          removeTextAdFromElement(mutations[i].addedNodes[j]);
    });

    // However, our event handler above may not have been inserted in time, so we also scan the document.
    // We use setTimeout here because there is no way to ensure that we are running after the ad scripts have run.
    // So we hope that the delay is long enough.
    setTimeout(function() {
      var elts = document.querySelectorAll("a.IL_LINK_STYLE, a.lw_cad_link, a.cm_word, a.contextual, a.kLink, a[itxtdid], nobr, ispan, span.IL_AD");
      for (var i=0; i<elts.length; i++) removeTextAdFromElement(elts[i]);
    }, 50);
  }
});
