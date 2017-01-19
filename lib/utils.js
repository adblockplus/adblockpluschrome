/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

"use strict";

let Utils = exports.Utils = {
  systemPrincipal: null,
  getString(id)
  {
    return ext.i18n.getMessage("global_" + id);
  },
  runAsync(callback)
  {
    if (document.readyState == "loading")
    {
      // Make sure to not run asynchronous actions before all
      // scripts loaded. This caused issues on Opera in the past.
      let onDOMContentLoaded = () =>
      {
        document.removeEventListener("DOMContentLoaded", onDOMContentLoaded);
        callback();
      };
      document.addEventListener("DOMContentLoaded", onDOMContentLoaded);
    }
    else
    {
      setTimeout(callback, 0);
    }
  },
  get appLocale()
  {
    let locale = ext.i18n.getMessage("@@ui_locale").replace(/_/g, "-");
    Object.defineProperty(this, "appLocale", {value: locale, enumerable: true});
    return this.appLocale;
  },
  generateChecksum(lines)
  {
    // We cannot calculate MD5 checksums yet :-(
    return null;
  },
  checkLocalePrefixMatch(prefixes)
  {
    if (!prefixes)
      return null;

    for (let prefix of prefixes.split(","))
      if (new RegExp("^" + prefix + "\\b").test(this.appLocale))
        return prefix;

    return null;
  },

  chooseFilterSubscription(subscriptions)
  {
    let selectedItem = null;
    let selectedPrefix = null;
    let matchCount = 0;
    for (let subscription of subscriptions)
    {
      if (!selectedItem)
        selectedItem = subscription;

      let prefix = Utils.checkLocalePrefixMatch(subscription.getAttribute("prefixes"));
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

  getDocLink(linkID)
  {
    let docLink = require("prefs").Prefs.documentation_link;
    return docLink.replace(/%LINK%/g, linkID).replace(/%LANG%/g, Utils.appLocale);
  },

  yield()
  {
  }
};
