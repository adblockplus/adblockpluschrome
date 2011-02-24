/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus for Chrome.
 *
 * The Initial Developer of the Original Code is
 * T. Joseph <tom@adblockplus.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Wladimir Palant
 *
 * ***** END LICENSE BLOCK ***** */

// YouTube special case option

chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response)
{
  if (response.enabled && response.specialCaseYouTube)
  {
    document.addEventListener("beforeload", function(e)
    {
      var eltDomain = extractDomainFromURL(e.url);
      if (e.target && /\bytimg\.com$/.test(eltDomain) &&
          /^(embed|object)$/.test(e.target.localName) &&
          e.target.hasAttribute("flashvars"))
      {
        // Remove a bunch of known parameters from flashvars attribute of the player
        var flashVars = e.target.getAttribute("flashvars").split("&");
        var newVars = [];
        for (var i = 0; i < flashVars.length; i++)
          if (!/^(ad\d*_|instream|infringe|invideo|interstitial|mpu|prerolls|tpas_ad_type_id|trueview|watermark)/.test(flashVars[i]))
            newVars.push(flashVars[i]);
        if (newVars.length != flashVars.length)
        {
          e.target.setAttribute("flashvars", newVars.join("&"));

          // Remove the node and insert it back, the variables won't be reloaded otherwise
          var parent = e.target.parentNode;
          var insertBefore = e.target.nextSibling;
          parent.removeChild(e.target);
          parent.insertBefore(e.target, insertBefore);
        }
      }
    }, true);
  }
});
