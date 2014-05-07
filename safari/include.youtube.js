/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

(function() {
  if (document.domain != "www.youtube.com")
    return;

  function rewriteFlashvars(flashvars)
  {
    var pairs = flashvars.split("&");
    for (var i = 0; i < pairs.length; i++)
      if (/^((ad|afv|adsense)(_.*)?|(ad3|st)_module|prerolls|interstitial|infringe|iv_cta_url)=/.test(pairs[i]))
        pairs.splice(i--, 1);
    return pairs.join("&");
  }

  function patchPlayer(player) 
  {
    var newPlayer = player.cloneNode(true);
    var flashvarsChanged = false;

    var flashvars = newPlayer.getAttribute("flashvars");
    if (flashvars)
    {
      var newFlashvars = rewriteFlashvars(flashvars);
      if (flashvars != newFlashvars)
      {
        newPlayer.setAttribute("flashvars", newFlashvars);
        flashvarsChanged = true;
      }
    }

    var param = newPlayer.querySelector("param[name=flashvars]");
    if (param)
    {
      var value = param.getAttribute("value");
      if (value)
      {
        var newValue = rewriteFlashvars(value);
        if (value != newValue)
        {
          param.setAttribute("value", newValue);
          flashvarsChanged = true;
        }
      }
    }

    if (flashvarsChanged)
      player.parentNode.replaceChild(newPlayer, player);
  }

  var deferred = [];
  function patchPlayerDeferred(player)
  {
    deferred.push(player);
  }

  var onBeforeLoadYoutubeVideo = patchPlayerDeferred;
  function onBeforeLoad(event)
  {
    if ((event.target.localName == "object" || event.target.localName == "embed") && /:\/\/[^\/]*\.ytimg\.com\//.test(event.url))
      onBeforeLoadYoutubeVideo(event.target);
  }

  ext.backgroundPage.sendMessage({type: "get-domain-enabled-state"}, function(response)
  {
    if (response.enabled)
    {
      deferred.forEach(patchPlayer);
      onBeforeLoadYoutubeVideo = patchPlayer;
    }
    else
      document.removeEventListener("beforeload", onBeforeLoad, true);
  });

  document.addEventListener("beforeload", onBeforeLoad, true);

  // if history.pushState is available, YouTube uses the history API
  // when navigation from one video to another, and tells the flash
  // player with JavaScript which video and which ads to show next,
  // bypassing our flashvars rewrite code. So we disable
  // history.pushState before YouTube's JavaScript runs.
  var script = document.createElement("script");
  script.type = "application/javascript";
  script.async = false;
  script.textContent = "history.pushState = undefined;";
  document.documentElement.appendChild(script);
  document.documentElement.removeChild(script);
})();
