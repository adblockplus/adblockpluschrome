/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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

  if (!ext.backgroundPage.sendMessageSync({type: "get-domain-enabled-state"}).enabled)
    return;

  var badArgumentsRegex = /^((.*_)?(ad|ads|afv|adsense)(_.*)?|(ad3|st)_module|prerolls|interstitial|infringe|iv_cta_url)$/;

  function rewriteFlashvars(flashvars)
  {
    var pairs = flashvars.split("&");
    for (var i = 0; i < pairs.length; i++)
      if (badArgumentsRegex.test(pairs[i].split("=")[0]))
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

  function runInPage(fn, arg)
  {
    var script = document.createElement("script");
    script.type = "application/javascript";
    script.async = false;
    script.textContent = "(" + fn + ")(" + arg + ");";
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  }

  document.addEventListener("beforeload", function(event)
  {
    if ((event.target.localName == "object" || event.target.localName == "embed") && /:\/\/[^\/]*\.ytimg\.com\//.test(event.url))
      patchPlayer(event.target);
  }, true);

  runInPage(function(badArgumentsRegex)
  {
    // If history.pushState is available, YouTube uses the history API
    // when navigation from one video to another, and tells the flash
    // player with JavaScript which video and which ads to show next,
    // bypassing our flashvars rewrite code. So we disable
    // history.pushState before YouTube's JavaScript runs.
    History.prototype.pushState = undefined;

    // The HTML5 player is configured via ytplayer.config.args. We have
    // to make sure that ad-related arguments are ignored as they are set.
    var ytplayer = undefined;
    Object.defineProperty(window, "ytplayer",
    {
      configurable: true,
      get: function()
      {
        return ytplayer;
      },
      set: function(rawYtplayer)
      {
        if (!rawYtplayer || typeof rawYtplayer != "object")
        {
          ytplayer = rawYtplayer;
          return;
        }

        var config = undefined;
        ytplayer = Object.create(rawYtplayer, {
          config: {
            enumerable: true,
            get: function()
            {
              return config;
            },
            set: function(rawConfig)
            {
              if (!rawConfig || typeof rawConfig != "object")
              {
                config = rawConfig;
                return;
              }

              var args = undefined;
              config = Object.create(rawConfig, {
                args: {
                  enumerable: true,
                  get: function()
                  {
                    return args;
                  },
                  set: function(rawArgs)
                  {
                    if (!rawArgs || typeof rawArgs != "object")
                    {
                      args = rawArgs;
                      return;
                    }

                    args = {};
                    for (var arg in rawArgs)
                    {
                      if (!badArgumentsRegex.test(arg))
                        args[arg] = rawArgs[arg];
                    }
                  }
                }
              });

              config.args = rawConfig.args;
            }
          }
        });

        ytplayer.config = rawYtplayer.config;
      }
    });
  }, badArgumentsRegex);
})();
