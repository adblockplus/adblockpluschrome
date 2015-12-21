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

/** @module prefs */

const keyPrefix = "pref:";

/** @lends module:prefs.Prefs */
let defaults = Object.create(null);
let overrides = Object.create(null);

/**
 * Only for compatibility with core code. Please do not change!
 *
 * @type {boolean}
 */
defaults.enabled = true;
/**
 * The application version as set during initialization. Used to detect updates.
 *
 * @type {string}
 */
defaults.currentVersion = "";
/**
 * Only for compatibility with core code. Please do not change!
 *
 * @type {string}
 */
defaults.data_directory = "";
/**
 * @see https://adblockplus.org/en/preferences#patternsbackups
 * @type {number}
 */
defaults.patternsbackups = 5;
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
 * Only for compatibility with core code. Please do not change!
 *
 * @type {boolean}
 */
defaults.privateBrowsing = false;
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_fallbackerrors
 * @type {number}
 */
defaults.subscriptions_fallbackerrors = 5;
/**
 * @see https://adblockplus.org/en/preferences#subscriptions_fallbackurl
 * @type {string}
 */
defaults.subscriptions_fallbackurl = "https://adblockplus.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&channelStatus=%CHANNELSTATUS%&responseStatus=%RESPONSESTATUS%";
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
 * @see https://adblockplus.org/en/preferences#subscriptions_antiadblockurl
 * @type {string}
 */
defaults.subscriptions_antiadblockurl = "https://easylist-downloads.adblockplus.org/antiadblockfilters.txt";
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
 * Whether to show a badge in the toolbar icon indicating the number of blocked ads.
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
 * Whether to collapse placeholders for blocked elements.
 *
 * @type {boolean}
 */
defaults.hidePlaceholders = true;
/**
 * Whether to suppress the first run page. This preference isn't
 * set by the extension but can be pre-configured externally.
 *
 * @see https://adblockplus.org/development-builds/suppressing-the-first-run-page-on-chrome
 * @type {boolean}
 */
defaults.suppress_first_run_page = false;

/**
 * Whether notification opt-out UI should be shown.
 * @type {boolean}
 */
defaults.notifications_showui = false;

/**
 * Notification categories to be ignored.
 *
 * @type {string[]}
 */
defaults.notifications_ignoredcategories = [];

/**
  * @namespace
  * @static
  */
let Prefs = exports.Prefs = {
  /**
   * Fired when the value of a preference changes.
   *
   * @event
   * @property {string} pref The name of the preference that changed.
   */
  onChanged: new ext._EventTarget(),

  /**
   * Fired when all preferences have been loaded. You must wait for
   * this event before using preferences during extension initialization.
   *
   * @event
   */
  onLoaded: new ext._EventTarget()
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

function addPreference(pref)
{
  Object.defineProperty(Prefs, pref, {
    get: function()
    {
      return (pref in overrides ? overrides : defaults)[pref];
    },
    set: function(value)
    {
      let defaultValue = defaults[pref];

      if (typeof value != typeof defaultValue)
        throw new Error("Attempt to change preference type");

      if (value == defaultValue)
      {
        delete overrides[pref];
        ext.storage.remove(prefToKey(pref));
      }
      else
      {
        overrides[pref] = value;
        ext.storage.set(prefToKey(pref), value);
      }
    },
    enumerable: true
  });
}

function init()
{
  let prefs = Object.keys(defaults);
  prefs.forEach(addPreference);

  let localLoaded = false;
  let managedLoaded = false;

  let checkLoaded = function()
  {
    if (!localLoaded || !managedLoaded)
      return;

    ext.storage.onChanged.addListener(function(changes)
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

          Prefs.onChanged._dispatch(pref);
        }
      }
    });

    Prefs.onLoaded._dispatch();
  };

  ext.storage.get(prefs.map(prefToKey), function(items)
  {
    for (let key in items)
      overrides[keyToPref(key)] = items[key];

    localLoaded = true;
    checkLoaded();
  });

  if (require("info").platform == "chromium" && "managed" in chrome.storage)
  {
    chrome.storage.managed.get(null, function(items)
    {
      // Opera doesn't support chrome.storage.managed, but instead simply
      // removing the API, Opera sets chrome.runtime.lastError when using it.
      // So we have to retrieve that error, to prevent it from showing up
      // in the console.
      chrome.runtime.lastError;

      for (let key in items)
        defaults[key] = items[key];

      managedLoaded = true;
      checkLoaded();
    });
  }
  else
  {
    managedLoaded = true;
    checkLoaded();
  }
}

init();
