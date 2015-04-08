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

const keyPrefix = "pref:";

let defaults = Object.create(null);
let overrides = Object.create(null);

defaults.enabled = true;
defaults.currentVersion = "";
defaults.data_directory = "";
defaults.patternsbackups = 5;
defaults.patternsbackupinterval = 24;
defaults.savestats = false;
defaults.privateBrowsing = false;
defaults.subscriptions_fallbackerrors = 5;
defaults.subscriptions_fallbackurl = "https://adblockplus.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&channelStatus=%CHANNELSTATUS%&responseStatus=%RESPONSESTATUS%";
defaults.subscriptions_autoupdate = true;
defaults.subscriptions_exceptionsurl = "https://easylist-downloads.adblockplus.org/exceptionrules.txt";
defaults.subscriptions_antiadblockurl = "https://easylist-downloads.adblockplus.org/antiadblockfilters.txt";
defaults.documentation_link = "https://adblockplus.org/redirect?link=%LINK%&lang=%LANG%";
defaults.notificationdata = {};
defaults.notificationurl = "https://notification.adblockplus.org/notification.json";
defaults.stats_total = {};
defaults.show_statsinicon = true;
defaults.show_statsinpopup = true;
defaults.shouldShowBlockElementMenu = true;
defaults.hidePlaceholders = true;
defaults.suppress_first_run_page = false;

let Prefs = exports.Prefs = {
  onChanged: new ext._EventTarget(),
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

  // Migrate preferences for users updating from old versions.
  // TODO: Remove the migration code after a few releases.
  ext.storage.migratePrefs({
    map: function(key, value)
    {
      if (key in defaults)
      {
        if (key != "currentVersion")
        {
          try
          {
            value = JSON.parse(value);
          }
          catch (e)
          {
            return null;
          }
        }

        return {key: prefToKey(key), value: value};
      }

      return null;
    },

    done: function()
    {
      ext.storage.get(prefs.map(prefToKey), function(items)
      {
        for (let key in items)
          overrides[keyToPref(key)] = items[key];

        localLoaded = true;
        checkLoaded();
      });
    }
  });

  if (require("info").platform == "chromium" && "managed" in chrome.storage)
  {
    chrome.storage.managed.get(null, function(items)
    {
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
