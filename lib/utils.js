/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
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
    let locale = browser.i18n.getUILanguage();
    Object.defineProperty(this, "appLocale", {value: locale, enumerable: true});
    return this.appLocale;
  },
  get readingDirection()
  {
    let direction = browser.i18n.getMessage("@@bidi_dir");
    // This fallback is only necessary for Microsoft Edge
    if (!direction)
      direction = /^(?:ar|fa|he|ug|ur)\b/.test(this.appLocale) ? "rtl" : "ltr";
    Object.defineProperty(
      this,
      "readingDirection",
      {value: direction, enumerable: true}
    );
    return this.readingDirection;
  },

  getDocLink(linkID)
  {
    let docLink = require("./prefs").Prefs.documentation_link;
    return docLink.replace(/%LINK%/g, linkID)
                  .replace(/%LANG%/g, Utils.appLocale);
  },

  yield()
  {
  }
};
