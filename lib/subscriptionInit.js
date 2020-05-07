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
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {filterEngine} = require("../adblockpluscore/lib/filterEngine");
const {recommendations} = require("../adblockpluscore/lib/recommendations");
const {synchronizer} = require("../adblockpluscore/lib/synchronizer");
const info = require("info");
const {port} = require("./messaging");
const {Prefs} = require("./prefs");
const {initNotifications} = require("./notificationHelper");
const {updatesVersion} = require("../adblockplusui/lib/prefs");
const {
  showProblemNotification,
  showUpdatesNotification
} = require("../adblockplusui/lib/notifications");

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
  firstRun = filterStorage.getSubscriptionCount() == 0;

  if (firstRun && (!filterStorage.firstRun || Prefs.currentVersion))
    reinitialized = true;

  Prefs.currentVersion = info.addonVersion;
}

/**
 * Determines whether to add the default ad blocking subscriptions.
 * Returns true, if there are no filter subscriptions besides those
 * other subscriptions added automatically, and no custom filters.
 *
 * On first run, this logic should always result in true since there
 * is no data and therefore no subscriptions. But it also causes the
 * default ad blocking subscriptions to be added again after some
 * data corruption or misconfiguration.
 *
 * @return {boolean}
 */
function shouldAddDefaultSubscriptions()
{
  for (let subscription of filterStorage.subscriptions())
  {
    if (subscription instanceof DownloadableSubscription &&
        subscription.url != Prefs.subscriptions_exceptionsurl &&
        subscription.type != "circumvention")
      return false;

    if (subscription instanceof SpecialSubscription &&
        subscription.filterCount > 0)
      return false;
  }

  return true;
}

/**
 * Finds the elements for the default ad blocking filter subscriptions based
 * on the user's locale.
 *
 * @param {Array.<object>} subscriptions
 * @return {Map.<string, object>}
 */
function chooseFilterSubscriptions(subscriptions)
{
  let chosenSubscriptions = new Map();

  let selectedLanguage = null;
  let matchCount = 0;

  for (let subscription of subscriptions)
  {
    let {languages, type} = subscription;
    let language = languages && languages.find(
      lang => new RegExp("^" + lang + "\\b").test(browser.i18n.getUILanguage())
    );

    if ((type == "ads" || type == "circumvention") &&
        !chosenSubscriptions.has(type))
      chosenSubscriptions.set(type, subscription);

    if (language)
    {
      // The "ads" subscription is the one driving the selection.
      if (type == "ads")
      {
        if (!selectedLanguage || selectedLanguage.length < language.length)
        {
          chosenSubscriptions.set(type, subscription);
          selectedLanguage = language;
          matchCount = 1;
        }
        else if (selectedLanguage && selectedLanguage.length == language.length)
        {
          matchCount++;

          // If multiple items have a matching language of the same length:
          // Select one of the items randomly, probability should be the same
          // for all items. So we replace the previous match here with
          // probability 1/N (N being the number of matches).
          if (Math.random() * matchCount < 1)
          {
            chosenSubscriptions.set(type, subscription);
            selectedLanguage = language;
          }
        }
      }
      else if (type == "circumvention")
      {
        chosenSubscriptions.set(type, subscription);
      }
    }
  }

  return chosenSubscriptions;
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

  // Add the "acceptable ads" subscription
  if (firstRun)
  {
    let acceptableAdsSubscription = Subscription.fromURL(
      Prefs.subscriptions_exceptionsurl
    );
    acceptableAdsSubscription.title = "Allow non-intrusive advertising";
    subscriptions.push(acceptableAdsSubscription);
  }

  // Add default ad blocking subscriptions (e.g. EasyList, Anti-Circumvention)
  let addDefaultSubscription = shouldAddDefaultSubscriptions();
  if (addDefaultSubscription || !Prefs.subscriptions_addedanticv)
  {
    for (let [, value] of chooseFilterSubscriptions(recommendations()))
    {
      let {url, type, title, homepage} = value;

      // Make sure that we don't add Easylist again if we want
      // to just add the Anti-Circumvention subscription.
      if (!addDefaultSubscription && type != "circumvention")
        continue;

      let subscription = Subscription.fromURL(url);
      subscription.disabled = false;
      subscription.title = title;
      subscription.homepage = homepage;
      subscriptions.push(subscription);

      if (subscription.type == "circumvention")
        Prefs.subscriptions_addedanticv = true;
    }

    return subscriptions;
  }

  return subscriptions;
}

function addSubscriptionsAndNotifyUser(subscriptions)
{
  if (subscriptionsCallback)
    subscriptions = subscriptionsCallback(subscriptions);

  for (let subscription of subscriptions)
  {
    filterStorage.addSubscription(subscription);
    if (subscription instanceof DownloadableSubscription &&
        !subscription.lastDownload)
      synchronizer.execute(subscription);
  }

  // Show first run page, update notification or problem notification.
  // The latter is only shown if the user hasn't been notified of the
  // latest major update yet.
  if (firstRun || updatesVersion > Prefs.last_updates_page_displayed)
  {
    return Prefs.set("last_updates_page_displayed", updatesVersion).catch(() =>
    {
      dataCorrupted = true;
    }).then(() =>
    {
      let canShowNotification = info.application != "fennec";
      let shouldShowWarning = dataCorrupted || reinitialized;

      // Show a notification if a data corruption was detected (either through
      // failure of reading from or writing to storage.local).
      if (shouldShowWarning && canShowNotification)
      {
        showProblemNotification();
        return;
      }

      if (!Prefs.suppress_first_run_page)
      {
        // Always show the first run page if a data corruption was detected
        // but we cannot show a notification. The first run page notifies the
        // user about the data corruption.
        if (firstRun || shouldShowWarning)
        {
          // Users with corrupted browser data may see this page each time their
          // browser starts. We avoid focusing the page for those users, in the
          // hope to make the situation less intrusive.
          browser.tabs.create({
            active: !shouldShowWarning,
            url: "first-run.html"
          });
          return;
        }

        // Show a notification to inform the user about the latest major update.
        showUpdatesNotification();
      }
    });
  }
}

Promise.all([
  filterEngine.initialize().then(() => synchronizer.start()),
  Prefs.untilLoaded.catch(() => { dataCorrupted = true; })
]).then(detectFirstRun)
  .then(getSubscriptions)
  .then(addSubscriptionsAndNotifyUser)
  // We have to require the "uninstall" module on demand,
  // as the "uninstall" module in turn requires this module.
  .then(() => { require("./uninstall").setUninstallURL(); })
  .then(() => initNotifications(firstRun));

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

// Exports for tests only
exports.chooseFilterSubscriptions = chooseFilterSubscriptions;

/**
 * @typedef {object} subscriptionsGetInitIssuesResult
 * @property {boolean} dataCorrupted
 *   true if it appears that the user's extension data was corrupted.
 * @property {boolean} reinitialized
 *   true if we have reset the user's settings due to data corruption.
 */

/**
 * Returns an Object with boolean flags for any subscription initialization
 * issues.
 *
 * @event "subscriptions.getInitIssues"
 * @returns {subscriptionsGetInitIssuesResult}
 */
port.on("subscriptions.getInitIssues",
        (message, sender) => ({dataCorrupted, reinitialized}));
