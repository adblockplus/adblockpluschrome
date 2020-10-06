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
const {analytics} = require("../adblockpluscore/lib/analytics");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {recommendations} = require("../adblockpluscore/lib/recommendations");
const {isDataCorrupted} = require("./subscriptionInit");
const {Prefs} = require("./prefs");

const abbreviations = [
  ["an", "addonName"], ["av", "addonVersion"],
  ["ap", "application"], ["apv", "applicationVersion"],
  ["p", "platform"], ["fv", "firstVersion"], ["pv", "platformVersion"],
  ["ndc", "notificationDownloadCount"], ["c", "corrupted"],
  ["s", "subscriptions"]
];

/**
 * Retrieves set of URLs of recommended ad blocking filter lists
 *
 * @return {Set}
 */
function getAdsSubscriptions()
{
  let subscriptions = new Set();
  for (let subscription of recommendations())
  {
    if (subscription.type == "ads")
      subscriptions.add(subscription.url);
  }
  return subscriptions;
}

/**
 * Determines whether any of the given subscriptions are installed and enabled
 *
 * @param {Set} urls
 *
 * @return {boolean}
 */
function isAnySubscriptionActive(urls)
{
  for (let subscription of filterStorage.subscriptions())
  {
    if (!subscription.disabled && urls.has(subscription.url))
      return true;
  }

  return false;
}

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
  params.firstVersion = analytics.getFirstVersion();

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

  let aaSubscriptions = new Set([Prefs.subscriptions_exceptionsurl]);
  let adsSubscriptions = getAdsSubscriptions();
  let isAcceptableAdsActive = isAnySubscriptionActive(aaSubscriptions);
  let isAdBlockingActive = isAnySubscriptionActive(adsSubscriptions);
  params.subscriptions = (isAcceptableAdsActive << 1) | isAdBlockingActive;

  for (let [abbreviation, key] of abbreviations)
    search.push(abbreviation + "=" + encodeURIComponent(params[key]));

  browser.runtime.setUninstallURL(Prefs.getDocLink("uninstalled") + "&" +
                                  search.join("&"));
};

filterNotifier.on("subscription.added", setUninstallURL);
filterNotifier.on("subscription.disabled", setUninstallURL);
filterNotifier.on("subscription.removed", setUninstallURL);
Prefs.on("notificationdata", setUninstallURL);
