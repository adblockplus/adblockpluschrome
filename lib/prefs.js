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

//
// The values are hardcoded for now.
//

let defaults = Object.create(null);
defaults.enabled = true;
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

let listeners = [];

function defineProperty(key)
{
  let value = null;
  Prefs.__defineGetter__(key, function()
  {
    if (value === null)
    {
      if (key in ext.storage)
      {
        try
        {
          value = JSON.parse(ext.storage[key]);
        }
        catch(e)
        {
          Cu.reportError(e);
        }
      }

      if (value === null)
        value = JSON.parse(JSON.stringify(defaults[key]));
    }
    return value;
  });
  Prefs.__defineSetter__(key, function(newValue)
  {
    if (typeof newValue != typeof defaults[key])
      throw new Error("Attempt to change preference type");

    let stringified = JSON.stringify(newValue);
    if (stringified != JSON.stringify(defaults[key]))
      ext.storage[key] = stringified;
    else
      delete ext.storage[key];

    value = newValue;

    for (let listener of listeners)
      listener(key);

    return value;
  });
}


let Prefs = exports.Prefs = {
  addListener: function(listener)
  {
    if (listeners.indexOf(listener) < 0)
      listeners.push(listener);
  },

  removeListener: function(listener)
  {
    let index = listeners.indexOf(listener);
    if (index >= 0)
      listeners.splice(index, 1);
  },
};

for (let key in defaults)
  defineProperty(key);
