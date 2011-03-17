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
 * Portions created by the Initial Developer are Copyright (C) 2009-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Wladimir Palant
 *
 * ***** END LICENSE BLOCK ***** */

// YouTube special case option
var shouldRemoveYouTubeAds = undefined;
var savedPlayer, savedPlayerVars;

function stripYouTubePlayerAds(player, newVars)
{
  player.setAttribute("flashvars", newVars.join("&"));

  // Remove the node and insert it back, the variables won't be reloaded otherwise
  var parent = player.parentNode;
  var insertBefore = player.nextSibling;
  parent.removeChild(player);
  parent.insertBefore(player, insertBefore);
}

function onYouTubeBeforeLoad(e)
{
  var eltDomain = extractDomainFromURL(e.url);
  var player = e.target;
  if (player && /\bytimg\.com$/.test(eltDomain) &&
      /^(embed|object)$/.test(player.localName) &&
      player.hasAttribute("flashvars"))
  {
    // Remove a bunch of known parameters from flashvars attribute of the player
    var flashVars = player.getAttribute("flashvars").split("&");
    var newVars = [];
    for (var i = 0; i < flashVars.length; i++)
      if (!/^(ad\d*_|instream|infringe|invideo|interstitial|mpu|prerolls|tpas_ad_type_id|trueview|watermark)/.test(flashVars[i]))
        newVars.push(flashVars[i]);
    if (newVars.length != flashVars.length)
    {
      if (typeof shouldRemoveYouTubeAds == "undefined")
      {
        // If enabled-check hasn't returned yet, save the event and new flashvars so that ad removal
        // can occur when it does return. We ought only to need to save one since there will only be
        // one video player loaded at a time.
        savedPlayer = player;
        savedPlayerVars = newVars;
      }
      else if (shouldRemoveYouTubeAds)
        stripYouTubePlayerAds(player, newVars);
    }
  }
}

// Ask the backend whether we are enabled. This may take a while, so we attach the beforeload listener
// no matter what. If this callback hasn't been invoked by the time we need to act on the YouTube
// player object, the beforeload handler will just save the target object and new flashvars so that
// this callback can modify the flashvars and reload the object.
chrome.extension.sendRequest({reqtype: "get-domain-enabled-state"}, function(response)
{
  shouldRemoveYouTubeAds = (response.enabled && response.specialCaseYouTube);
  if (shouldRemoveYouTubeAds)
  {
    if (savedPlayer)
      stripYouTubePlayerAds(savedPlayer, savedPlayerVars);
  }
  else
    document.removeEventListener("beforeload", onYouTubeBeforeLoad, true);
});

document.addEventListener("beforeload", onYouTubeBeforeLoad, true);
