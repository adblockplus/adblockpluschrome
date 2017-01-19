/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

const {Subscription, DownloadableSubscription,
       SpecialSubscription} = require("subscriptionClasses");
const {FilterStorage} = require("filterStorage");
const {FilterNotifier} = require("filterNotifier");
const {Prefs} = require("prefs");
const {Synchronizer} = require("synchronizer");
const {Utils} = require("utils");
const {initNotifications} = require("notificationHelper");

let firstRun;
let subscriptionsCallback = null;

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
    exports.reinitialized = true;

  Prefs.currentVersion = require("info").addonVersion;
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

    let antiAdblockSubscription = Subscription.fromURL(
      Prefs.subscriptions_antiadblockurl
    );
    antiAdblockSubscription.disabled = true;
    subscriptions.push(antiAdblockSubscription);
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

        let node = Utils.chooseFilterSubscription(nodes);
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

function finishInitialization(subscriptions)
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

  if (firstRun && !Prefs.suppress_first_run_page)
    ext.pages.open(ext.getURL("firstRun.html"));

  initNotifications();
}

Promise.all([FilterNotifier.once("load"),
             Prefs.untilLoaded]).then(detectFirstRun)
                                .then(getSubscriptions)
                                .then(finishInitialization);

/**
 * Indicates whether the default filter subscriptions have been added
 * again because there weren't any subscriptions even though this wasn't
 * the first run.
 *
 * @type {boolean}
 */
exports.reinitialized = false;

/**
 * Sets a callback that is called with an array of subscriptions to be added
 * during initialization. The callback must return an array of subscriptions
 * that will effectively be added.
 *
 * @param {function}
 */
exports.setSubscriptionsCallback = callback =>
{
  subscriptionsCallback = callback;
};
