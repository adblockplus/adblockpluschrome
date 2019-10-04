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

/** @module utils */

"use strict";

const info = require("info");
const {port} = require("./messaging");

let Utils = exports.Utils = {
  systemPrincipal: null,
  get appLocale()
  {
    let locale = browser.i18n.getUILanguage();

    // Firefox <56 separates the locale parts with an underscore instead of
    // hyphen. https://bugzilla.mozilla.org/show_bug.cgi?id=1374552
    locale = locale.replace("_", "-");

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
  },

  logError(e)
  {
    console.error(e);
    console.trace();
  }
};

/**
 * Returns a link to a page on our website, in the user's locale if possible.
 *
 * @event "prefs.getDocLink"
 * @property {string} link
 *   The link ID to generate the doc link for.
 * @returns {string}
 */
port.on("prefs.getDocLink", (message, sender) =>
{
  let {application, platform} = info;
  if (platform == "chromium" && application != "opera")
    application = "chrome";
  else if (platform == "gecko")
    application = "firefox";

  let link = Utils.getDocLink(
    message.link.replace("{browser}", application)
  );

  // Edge 42 does not always return the link as given by Utils.getDocLink,
  // for some reason .toString() is enough to get it working. This seems
  // to have been fixed in Edge 44. (See issue 7222.)
  if (platform == "edgehtml")
    return link.toString();

  return link;
});

/**
 * @typedef {object} infoGetResult
 * @property {string} addonName
 *   The extension's name, e.g. "adblockpluschrome".
 * @property {string} addonVersion
 *   The extension's version, e.g. "3.6.3".
 * @property {string} application
 *   The browser's name, e.g. "chrome".
 * @property {string} applicationVersion
 *   The browser's version, e.g. "77.0.3865.90".
 * @property {string} platform
 *   The browser platform, e.g. "chromium".
 * @property {string} platformVersion
 *   The browser platform's version, e.g. "77.0.3865.90".
 */

/**
 * Returns the browser platform information.
 *
 * @event "info.get"
 * @returns {infoGetResult}
 */
port.on("info.get", (message, sender) => info);
