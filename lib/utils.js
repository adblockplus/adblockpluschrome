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

let runAsyncQueue;

var Utils = exports.Utils = {
  systemPrincipal: null,
  getString: function(id)
  {
    if (typeof ext !== "undefined" && "i18n" in ext)
      return ext.i18n.getMessage("global_" + id);
    else
      return id;
  },

  // This function can take additional parameters. Second paramater will be
  // passed as this variable to the callback and any additional parameters as
  // callback parameters.
  runAsync: function(callback)
  {
    callback = callback.bind.apply(callback, Array.prototype.slice.call(arguments, 1));

    if (typeof runAsyncQueue == "undefined")
    {
      runAsyncQueue = (document.readyState == "loading" ? [] : null);
      if (runAsyncQueue)
      {
        // Hack: Opera will happily run asynchronous actions while scripts are
        // loading, queue them until the document is ready.
        let loadHandler = function()
        {
          document.removeEventListener("DOMContentLoaded", loadHandler, false);

          let queue = runAsyncQueue;
          runAsyncQueue = null;
          for (let callback of queue)
          {
            try
            {
              callback();
            }
            catch(e)
            {
              Cu.reportError(e);
            }
          }
        };
        document.addEventListener("DOMContentLoaded", loadHandler, false);
      }
    }

    if (runAsyncQueue)
      runAsyncQueue.push(callback);
    else
      window.setTimeout(callback, 0);
  },
  get appLocale()
  {
    var locale = ext.i18n.getMessage("@@ui_locale").replace(/_/g, "-");
    this.__defineGetter__("appLocale", function() {return locale});
    return this.appLocale;
  },
  generateChecksum: function(lines)
  {
    // We cannot calculate MD5 checksums yet :-(
    return null;
  },
  makeURI: function(url)
  {
    return Services.io.newURI(url);
  },

  checkLocalePrefixMatch: function(prefixes)
  {
    if (!prefixes)
      return null;

    var list = prefixes.split(",");
    for (var i = 0; i < list.length; i++)
      if (new RegExp("^" + list[i] + "\\b").test(this.appLocale))
        return list[i];

    return null;
  },

  chooseFilterSubscription: function(subscriptions)
  {
    var selectedItem = null;
    var selectedPrefix = null;
    var matchCount = 0;
    for (var i = 0; i < subscriptions.length; i++)
    {
      var subscription = subscriptions[i];
      if (!selectedItem)
        selectedItem = subscription;

      var prefix = require("utils").Utils.checkLocalePrefixMatch(subscription.getAttribute("prefixes"));
      if (prefix)
      {
        if (!selectedPrefix || selectedPrefix.length < prefix.length)
        {
          selectedItem = subscription;
          selectedPrefix = prefix;
          matchCount = 1;
        }
        else if (selectedPrefix && selectedPrefix.length == prefix.length)
        {
          matchCount++;

          // If multiple items have a matching prefix of the same length:
          // Select one of the items randomly, probability should be the same
          // for all items. So we replace the previous match here with
          // probability 1/N (N being the number of matches).
          if (Math.random() * matchCount < 1)
          {
            selectedItem = subscription;
            selectedPrefix = prefix;
          }
        }
      }
    }
    return selectedItem;
  },

  getDocLink: function(linkID)
  {
    var Prefs = require("prefs").Prefs;
    var docLink = Prefs.documentation_link;
    return docLink.replace(/%LINK%/g, linkID).replace(/%LANG%/g, Utils.appLocale);
  },

  yield: function()
  {
  }
};
