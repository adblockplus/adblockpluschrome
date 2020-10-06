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

/** @module prefs */

"use strict";

const info = require("info");
const {EventEmitter} = require("../adblockpluscore/lib/events");
const {port} = require("./messaging");

const keyPrefix = "pref:";

let eventEmitter = new EventEmitter();
let overrides = Object.create(null);

/** @lends module:prefs.Prefs */
let defaults = Object.create(null);

/**
 * @see https://adblockplus.org/en/preferences#analytics
 * @type {object}
 */
defaults.analytics = {
  trustedHosts: ["adblockplus.org", "notification.adblockplus.org",
                 "easylist-downloads.adblockplus.org"]
};
/**
 * The application version as set during initialization. Used to detect updates.
 *
 * @type {string}
 */
defaults.currentVersion = "";
/**
 * @see https://adblockplus.org/en/preferences#patternsbackups
 * @type {number}
 */
defaults.patternsbackups = 0;
/**
 * @see https://adblockplus.org/en/preferences#patternsbackupinterval
 * @type {number}
 */
defaults.patternsbackupinterval = 24;
/**
 * Only for compatibility with core code. Please do not change!
 *
 * @type {boolean}
 */
defaults.savestats = false;
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_fallbackerrors
 * @type {number}
 */
defaults.subscriptions_fallbackerrors = 5;
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_fallbackurl
 * @type {string}
 */
defaults.subscriptions_fallbackurl = "https://adblockplus.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&responseStatus=%RESPONSESTATUS%";
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_autoupdate
 * @type {boolean}
 */
defaults.subscriptions_autoupdate = true;
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_exceptionsurl
 * @type {string}
 */
defaults.subscriptions_exceptionsurl = "https://easylist-downloads.adblockplus.org/exceptionrules.txt";
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_exceptionsurl_privacy
 * @type {string}
 */
defaults.subscriptions_exceptionsurl_privacy = "https://easylist-downloads.adblockplus.org/exceptionrules-privacy-friendly.txt";
/**
 * Used to ensure the anti-circumvention subscription is opted in by default.
 * @type {boolean}
 */
defaults.subscriptions_addedanticv = false;
/**
 * @see https://adblockplus.org/en/preferences#documentation_link
 * @type {string}
 */
defaults.documentation_link = "https://adblockplus.org/redirect?link=%LINK%&lang=%LANG%";
/**
 * @see https://adblockplus.org/en/preferences#notificationdata
 * @type {object}
 */
defaults.notificationdata = {};
/**
 * @see https://adblockplus.org/en/preferences#notificationurl
 * @type {string}
 */
defaults.notificationurl = "https://notification.adblockplus.org/notification.json";
/**
 * The total number of requests blocked by the extension.
 *
 * @type {number}
 */
defaults.blocked_total = 0;
/**
 * Whether to show a badge in the toolbar icon indicating the number
 * of blocked ads.
 *
 * @type {boolean}
 */
defaults.show_statsinicon = true;
/**
 * Whether to show the number of blocked ads in the popup.
 *
 * @type {boolean}
 */
defaults.show_statsinpopup = true;
/**
 * Whether to show the "Block element" context menu entry.
 *
 * @type {boolean}
 */
defaults.shouldShowBlockElementMenu = true;

/**
 * Whether to show tracking warning in options page when both
 * Acceptable Ads and subscription of type "Privacy" are enabled.
 *
 * @type {boolean}
 */
defaults.ui_warn_tracking = true;

/**
 * Notification categories to be ignored.
 *
 * @type {string[]}
 */
defaults.notifications_ignoredcategories = [];

/**
 * Whether to show the developer tools panel.
 *
 * @type {boolean}
 */
defaults.show_devtools_panel = true;

/**
 * Prevents unsolicited UI elements from showing up after installation. This
 * preference isn't set by the extension but can be pre-configured externally.
 *
 * @see https://adblockplus.org/development-builds/suppressing-the-first-run-page-on-chrome
 * @type {boolean}
 */
defaults.suppress_first_run_page = false;

/**
 * Additonal subscriptions to be automatically added when the extension is
 * loaded. This preference isn't set by the extension but can be pre-configured
 * externally.
 *
 * @type {string[]}
 */
defaults.additional_subscriptions = [];

/**
 * The version of major updates that the user is aware of. If it's too low,
 * the updates page will be shown to inform the user about intermediate changes.
 *
 * @type {number}
 */
defaults.last_updates_page_displayed = 0;

/**
 * Causes elements targeted by element hiding (and element hiding emulation)
 * to be highlighted instead of hidden.
 *
 * @type {boolean}
 */
defaults.elemhide_debug = false;

/**
 * Address of page to open on first run.
 *
 * @type {string}
 */
defaults.remote_first_run_page_url = "https://welcome.adblockplus.org/%LANG%/installed?an=%ADDON_NAME%&av=%ADDON_VERSION%&ap=%APPLICATION_NAME%&apv=%APPLICATION_VERSION%&p=%PLATFORM_NAME%&pv=%PLATFORM_VERSION%";

/**
  * @namespace
  * @static
  */
let Prefs = exports.Prefs = {
  /**
   * Sets the given preference.
   *
   * @param {string} preference
   * @param {any}    value
   * @return {Promise} A promise that resolves when the underlying
                       browser.storage.local.set/remove() operation completes
   */
  set(preference, value)
  {
    let defaultValue = defaults[preference];

    if (typeof value != typeof defaultValue)
      throw new Error("Attempt to change preference type");

    if (value == defaultValue)
    {
      let oldValue = overrides[preference];
      delete overrides[preference];

      // Firefox 66 fails to emit storage.local.onChanged events for falsey
      // values. https://bugzilla.mozilla.org/show_bug.cgi?id=1541449
      if (!oldValue &&
          info.platform == "gecko" && parseInt(info.platformVersion, 10) == 66)
        onChanged({[prefToKey(preference)]: {oldValue}}, "local");

      return browser.storage.local.remove(prefToKey(preference));
    }

    overrides[preference] = value;
    return (customSave.get(preference) || savePref)(preference);
  },

  /**
   * Adds a callback that is called when the
   * value of a specified preference changed.
   *
   * @param {string}   preference
   * @param {function} callback
   */
  on(preference, callback)
  {
    eventEmitter.on(preference, callback);
  },

  /**
   * Removes a callback for the specified preference.
   *
   * @param {string}   preference
   * @param {function} callback
   */
  off(preference, callback)
  {
    eventEmitter.off(preference, callback);
  },

  /**
   * Reads the documentation_link preference and substitutes placeholders.
   *
   * @param {string} linkID
   * @return {string}
   */
  getDocLink(linkID)
  {
    return this.documentation_link
      .replace(/%LINK%/g, linkID)
      .replace(/%LANG%/g, browser.i18n.getUILanguage());
  },

  /**
   * A promise that is fullfilled when all preferences have been loaded.
   * Wait for this promise to be fulfilled before using preferences during
   * extension initialization.
   *
   * @type {Promise}
   */
  untilLoaded: null
};

function keyToPref(key)
{
  if (key.indexOf(keyPrefix) != 0)
    return null;

  return key.substr(keyPrefix.length);
}

function prefToKey(pref)
{
  return keyPrefix + pref;
}

function savePref(pref)
{
  return browser.storage.local.set({[prefToKey(pref)]: overrides[pref]});
}

let customSave = new Map();
if (info.platform == "gecko" && parseInt(info.platformVersion, 10) < 66)
{
  // Saving one storage value causes all others to be saved as well for
  // Firefox versions <66. Make sure that updating ad counter doesn't cause
  // the filters data to be saved frequently as a side-effect.
  let promise = null;
  customSave.set("blocked_total", pref =>
  {
    if (!promise)
    {
      promise = new Promise((resolve, reject) =>
      {
        setTimeout(
          () =>
          {
            promise = null;
            savePref(pref).then(resolve, reject);
          },
          60 * 1000
        );
      });
    }
    return promise;
  });
}

function addPreference(pref)
{
  Object.defineProperty(Prefs, pref, {
    get() { return (pref in overrides ? overrides : defaults)[pref]; },
    set(value)
    {
      Prefs.set(pref, value);
    },
    enumerable: true
  });
}

function onChanged(changes)
{
  for (let key in changes)
  {
    let pref = keyToPref(key);
    if (pref && pref in defaults)
    {
      let change = changes[key];
      if ("newValue" in change && change.newValue != defaults[pref])
        overrides[pref] = change.newValue;
      else
        delete overrides[pref];

      eventEmitter.emit(pref);
    }
  }
}

function init()
{
  let prefs = Object.keys(defaults);
  prefs.forEach(addPreference);

  let isEdgeChromium = info.application == "edge" &&
                       info.platform == "chromium";

  // When upgrading from EdgeHTML to Edge Chromium (v79) data stored in
  // browser.storage.local gets corrupted.
  // To fix it, we have to call JSON.parse twice.
  // See: https://gitlab.com/eyeo/adblockplus/adblockpluschrome/issues/152
  let fixPrefsForEdgeChromium = isEdgeChromium ?
    browser.storage.local.get(null).then(items =>
    {
      let fixedItems = {};
      for (let key in items)
      {
        if (typeof items[key] == "string")
        {
          try
          {
            fixedItems[key] = JSON.parse(JSON.parse(items[key]));
          }
          catch (e) {}
        }
      }
      return browser.storage.local.set(fixedItems);
    }) :
    Promise.resolve();

  let localLoaded = fixPrefsForEdgeChromium
    .then(() => browser.storage.local.get(prefs.map(prefToKey)))
    .then(items =>
    {
      for (let key in items)
        overrides[keyToPref(key)] = items[key];
    });

  let managedLoaded;
  if ("managed" in browser.storage)
  {
    managedLoaded = browser.storage.managed.get(null).then(
      items =>
      {
        for (let key in items)
          defaults[key] = items[key];
      },

      // Opera doesn't support browser.storage.managed, but instead of simply
      // removing the API, it gives an asynchronous error which we ignore here.
      () => {}
    );
  }
  else
  {
    managedLoaded = Promise.resolve();
  }

  function onLoaded()
  {
    browser.storage.onChanged.addListener(onChanged);

    // Migrate the first and current version from notificationdata over to the
    // new analytics preference for existing users. The analytics module takes
    // care of new users.
    if (!("data" in Prefs.analytics) &&
        "firstVersion" in Prefs.notificationdata &&
        Prefs.notificationdata.firstVersion != "0")
    {
      // JSON values aren't saved unless they are assigned a different object
      // and we don't want to mutate the default value of Prefs.analytics.
      let notificationdata = JSON.parse(JSON.stringify(Prefs.notificationdata));
      let analytics = JSON.parse(JSON.stringify(Prefs.analytics));

      // Migrate the version data.
      analytics.data = {
        firstVersion: notificationdata.firstVersion,
        currentVersion: notificationdata.data.version
      };
      delete notificationdata.firstVersion;

      // Write the changes back to Prefs and storage.
      Prefs.notificationdata = notificationdata;
      Prefs.analytics = analytics;
    }
  }

  Prefs.untilLoaded = Promise.all([localLoaded, managedLoaded]).then(onLoaded);
}

init();

/**
 * Returns the value of the given preference key.
 *
 * @event "prefs.get"
 * @property {string} key - The preference key.
 * @returns {string|string[]|number|boolean}
 */
port.on("prefs.get", (message, sender) => Prefs[message.key]);

/**
 * Sets the value of the given preference key to the given value.
 *
 * @event "prefs.set"
 * @property {string} key - The preference key.
 * @property {string} key - The value to set.
 * @returns {string|string[]|number|boolean|undefined}
 */
port.on("prefs.set", (message, sender) =>
{
  if (message.key == "notifications_ignoredcategories")
  {
    const {notifications} = require("../adblockpluscore/lib/notifications");
    return notifications.toggleIgnoreCategory("*", !!message.value);
  }

  return Prefs[message.key] = message.value;
});

/**
 * Toggles the value of the given preference key.
 *
 * @event "prefs.toggle"
 * @property {string} key - The preference key
 * @returns {?boolean}
 */
port.on("prefs.toggle", (message, sender) =>
{
  if (message.key == "notifications_ignoredcategories")
  {
    const {notifications} = require("../adblockpluscore/lib/notifications");
    return notifications.toggleIgnoreCategory("*");
  }

  return Prefs[message.key] = !Prefs[message.key];
});

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
  if (platform == "chromium" && application != "opera" && application != "edge")
    application = "chrome";
  else if (platform == "gecko")
    application = "firefox";

  return Prefs.getDocLink(message.link.replace("{browser}", application));
});
