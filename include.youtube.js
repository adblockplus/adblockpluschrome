/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

var isExperimental;

// Don't do anything in experimental builds, webRequest API will handle this
if (isExperimental == true)
  return;

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
