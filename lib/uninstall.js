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

const abbreviations = new Map([
  ["an", "addonName"], ["av", "addonVersion"],
  ["ap", "application"], ["apv", "applicationVersion"],
  ["p", "platform"], ["pv", "platformVersion"],
  ["ndc", "notificationDownloadCount"], ["c", "corrupted"]
]);

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
  let params = Object.create(info);

  params.corrupted = isDataCorrupted() ? "1" : "0";

  let notificationDownloadCount = Prefs.notificationdata.downloadCount || 0;
  if (notificationDownloadCount < 5)
    params.notificationDownloadCount = notificationDownloadCount;
  else if (notificationDownloadCount < 8)
    params.notificationDownloadCount = "5-7";
  else if (notificationDownloadCount < 30)
    params.notificationDownloadCount = "8-29";
  else if (notificationDownloadCount < 90)
    params.notificationDownloadCount = "30-89";
  else if (notificationDownloadCount < 180)
    params.notificationDownloadCount = "90-179";
  else
    params.notificationDownloadCount = "180+";

  for (let [abbreviation, key] of abbreviations)
    search.push(abbreviation + "=" + encodeURIComponent(params[key]));

  browser.runtime.setUninstallURL(Utils.getDocLink("uninstalled") + "&" +
                                  search.join("&"));
};

Prefs.on("notificationdata", setUninstallURL);
