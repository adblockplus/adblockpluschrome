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

/** @module subscriptionInit */

"use strict";

const {Subscription,
       DownloadableSubscription,
       SpecialSubscription} =
  require("../adblockpluscore/lib/subscriptionClasses");
const {FilterStorage} = require("../adblockpluscore/lib/filterStorage");
const {FilterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const info = require("info");
const {Prefs} = require("./prefs");
const {Synchronizer} = require("../adblockpluscore/lib/synchronizer");
const {Utils} = require("./utils");
const {initNotifications} = require("./notificationHelper");
const {updatesVersion} = require("../adblockplusui/lib/prefs");

let firstRun;
let subscriptionsCallback = null;
let reinitialized = false;
let dataCorrupted = false;

/**
 * If there aren't any filters, the default subscriptions are added.
 * However, if patterns.ini already did exist and/or any preference
 * is set to a non-default value, this indicates that this isn't the
 * first run, but something went wrong.
 *
 * This function detects the first run, and makes sure that the user
 * gets notified (on the first run page) if the data appears incomplete
 * and therefore will be reinitialized.
 */
function detectFirstRun()
{
  firstRun = FilterStorage.subscriptions.length == 0;

  if (firstRun && (!FilterStorage.firstRun || Prefs.currentVersion))
    reinitialized = true;

  Prefs.currentVersion = info.addonVersion;
}

/**
 * Determines whether to add the default ad blocking subscription.
 * Returns true, if there are no filter subscriptions besides those
 * other subscriptions added automatically, and no custom filters.
 *
 * On first run, this logic should always result in true since there
 * is no data and therefore no subscriptions. But it also causes the
 * default ad blocking subscription to be added again after some
 * data corruption or misconfiguration.
 *
 * @return {boolean}
 */
function shouldAddDefaultSubscription()
{
  for (let subscription of FilterStorage.subscriptions)
  {
    if (subscription instanceof DownloadableSubscription &&
        subscription.url != Prefs.subscriptions_exceptionsurl &&
        subscription.url != Prefs.subscriptions_antiadblockurl)
      return false;

    if (subscription instanceof SpecialSubscription &&
        subscription.filters.length > 0)
      return false;
  }

  return true;
}

/**
 * Finds the element for the default ad blocking filter subscription based
 * on the user's locale.
 *
 * @param {HTMLCollection} subscriptions
 * @return {Element}
 */
function chooseFilterSubscription(subscriptions)
{
  let selectedItem = null;
  let selectedPrefix = null;
  let matchCount = 0;
  for (let subscription of subscriptions)
  {
    if (!selectedItem)
      selectedItem = subscription;

    let prefixes = subscription.getAttribute("prefixes");
    let prefix = prefixes && prefixes.split(",").find(
      lang => new RegExp("^" + lang + "\\b").test(Utils.appLocale)
    );

    let subscriptionType = subscription.getAttribute("type");

    if (prefix && subscriptionType == "ads")
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
}

function supportsNotificationsWithButtons()
{
  // Microsoft Edge (as of EdgeHTML 16) doesn't have the notifications API.
  // Opera gives an asynchronous error when buttons are provided (we cannot
  // detect that behavior without attempting to show a notification).
  if (!("notifications" in browser) || info.application == "opera")
    return false;

  // Firefox throws synchronously if the "buttons" option is provided.
  // If buttons are supported (i.e. on Chrome), this fails with
  // an asynchronous error due to missing required options.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1190681
  try
  {
    browser.notifications.create({buttons: []}).catch(() => {});
  }
  catch (e)
  {
    if (e.toString().includes('"buttons" is unsupported'))
      return false;
  }

  return true;
}

/**
 * Gets the filter subscriptions to be added when the extnesion is loaded.
 *
 * @return {Promise|Subscription[]}
 */
function getSubscriptions()
{
  let subscriptions = [];

  // Add pre-configured subscriptions
  for (let url of Prefs.additional_subscriptions)
    subscriptions.push(Subscription.fromURL(url));

  // Add "acceptable ads" and "anti-adblock messages" subscriptions
  if (firstRun)
  {
    let acceptableAdsSubscription = Subscription.fromURL(
      Prefs.subscriptions_exceptionsurl
    );
    acceptableAdsSubscription.title = "Allow non-intrusive advertising";
    subscriptions.push(acceptableAdsSubscription);

    // Only add the anti-adblock messages subscription if
    // the related notification can be shown on this browser.
    if (supportsNotificationsWithButtons())
    {
      let antiAdblockSubscription = Subscription.fromURL(
        Prefs.subscriptions_antiadblockurl
      );
      antiAdblockSubscription.disabled = true;
      subscriptions.push(antiAdblockSubscription);
    }
  }

  // Add default ad blocking subscription (e.g. EasyList)
  if (shouldAddDefaultSubscription())
  {
    return fetch("subscriptions.xml")
      .then(response => response.text())
      .then(text =>
      {
        let doc = new DOMParser().parseFromString(text, "application/xml");
        let nodes = doc.getElementsByTagName("subscription");

        let node = chooseFilterSubscription(nodes);
        if (node)
        {
          let url = node.getAttribute("url");
          if (url)
          {
            let subscription = Subscription.fromURL(url);
            subscription.disabled = false;
            subscription.title = node.getAttribute("title");
            subscription.homepage = node.getAttribute("homepage");
            subscriptions.push(subscription);
          }
        }

        return subscriptions;
      });
  }

  return subscriptions;
}

function addSubscriptionsAndNotifyUser(subscriptions)
{
  if (subscriptionsCallback)
    subscriptions = subscriptionsCallback(subscriptions);

  for (let subscription of subscriptions)
  {
    FilterStorage.addSubscription(subscription);
    if (subscription instanceof DownloadableSubscription &&
        !subscription.lastDownload)
      Synchronizer.execute(subscription);
  }

  // Show first run page or the updates page. The latter is only shown
  // on Chromium (since the current updates page announces features that
  // aren't new to Firefox users), and only if this version of the
  // updates page hasn't been shown yet.
  if (firstRun || info.platform == "chromium" &&
                  updatesVersion > Prefs.last_updates_page_displayed)
  {
    return Prefs.set("last_updates_page_displayed", updatesVersion).catch(() =>
    {
      dataCorrupted = true;
    }).then(() =>
    {
      if (!Prefs.suppress_first_run_page)
      {
        // Always show the first run page if a data corruption was detected
        // (either through failure of reading from or writing to storage.local).
        // The first run page notifies the user about the data corruption.
        let url;
        if (firstRun || dataCorrupted)
          url = "firstRun.html";
        else
          url = "updates.html";
        browser.tabs.create({url});
      }
    });
  }
}

Promise.all([
  FilterNotifier.once("load"),
  Prefs.untilLoaded.catch(() => { dataCorrupted = true; })
]).then(detectFirstRun)
  .then(getSubscriptions)
  .then(addSubscriptionsAndNotifyUser)
  // We have to require the "uninstall" module on demand,
  // as the "uninstall" module in turn requires this module.
  .then(() => { require("./uninstall").setUninstallURL(); })
  .then(initNotifications);

/**
 * Gets a value indicating whether the default filter subscriptions have been
 * added again because there weren't any subscriptions even though this wasn't
 * the first run.
 *
 * @return {boolean}
 */
exports.isReinitialized = () => reinitialized;

/**
 * Gets a value indicating whether a data corruption was detected.
 *
 * @return {boolean}
 */
exports.isDataCorrupted = () => dataCorrupted;

/**
 * Sets a callback that is called with an array of subscriptions to be added
 * during initialization. The callback must return an array of subscriptions
 * that will effectively be added.
 *
 * @param {function} callback
 */
exports.setSubscriptionsCallback = callback =>
{
  subscriptionsCallback = callback;
};
