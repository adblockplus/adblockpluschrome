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

/** @module uninstall */

"use strict";

const info = require("info");
const {isDataCorrupted} = require("./subscriptionInit.js");
const {Prefs} = require("./prefs");
const {Utils} = require("./utils");

let setUninstallURL =
/**
 * Sets (or updates) the URL that is openend when the extension is uninstalled.
 *
 * Must be called after prefs got initialized and a data corruption
 * if any was detected, as well when notification data change.
 */
exports.setUninstallURL = () =>
{
  let search = [];
  for (let key of ["addonName", "addonVersion", "application",
                   "applicationVersion", "platform", "platformVersion"])
    search.push(key + "=" + encodeURIComponent(info[key]));

  let downlCount = Prefs.notificationdata.downloadCount || 0;

  if (downlCount > 4)
  {
    if (downlCount < 8)
      downlCount = "5-7";
    else if (downlCount < 30)
      downlCount = "8-29";
    else if (downlCount < 90)
      downlCount = "30-89";
    else if (downlCount < 180)
      downlCount = "90-179";
    else
      downlCount = "180+";
  }

  search.push("notificationDownloadCount=" + encodeURIComponent(downlCount));
  search.push("corrupted=" + (isDataCorrupted() ? "1" : "0"));

  browser.runtime.setUninstallURL(Utils.getDocLink("uninstalled") + "&" +
                                  search.join("&"));
};

Prefs.on("notificationdata", setUninstallURL);
