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

"use strict";

const {port} = require("./messaging");
const {Prefs} = require("./prefs");
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {isSlowFilter} = require("../adblockpluscore/lib/matcher");
const {isValidHostname} = require("../adblockpluscore/lib/url");
const {HitLogger} = require("./hitLogger");
const {Filter, InvalidFilter, URLFilter, isActiveFilter} =
  require("filterClasses");
const {synchronizer} = require("../adblockpluscore/lib/synchronizer");
const {Subscription, DownloadableSubscription,
       SpecialSubscription, RegularSubscription} =
  require("../adblockpluscore/lib/subscriptionClasses");
const {showOptions} = require("./options");
const {recommendations} = require("../adblockpluscore/lib/recommendations");
const {allowlistedDomainRegexp} = require("./allowlisting");
const {filterState} = require("../adblockpluscore/lib/filterState");

function convertObject(keys, obj)
{
  let result = {};
  for (let key of keys)
  {
    if (key in obj)
      result[key] = obj[key];
  }
  return result;
}

let convertRecommendation = convertObject.bind(null, [
  "languages", "title", "type", "url"
]);

function convertSubscriptionFilters(subscription)
{
  return Array.from(subscription.filterText(),
                    text => convertFilter(Filter.fromText(text)));
}

function convertSubscription(subscription)
{
  let obj = convertObject(["disabled", "downloadStatus", "homepage",
                           "version", "lastDownload", "lastSuccess",
                           "softExpiration", "expires", "title",
                           "url"], subscription);
  if (subscription instanceof SpecialSubscription)
    obj.filters = convertSubscriptionFilters(subscription);

  obj.downloading = synchronizer.isExecuting(subscription.url);
  obj.validURL = Subscription.isValidURL(subscription.url);
  return obj;
}

// pollute a converted filter object with `slow` detail
// there are 3 kind of slow filters
//  1. filter instanceof URLFilter && isSlowFilter(filter)
//  2. filter instanceof ElemHideEmulationFilter
//  3. filter instanceof SnippetFilter
// for the time being, we want to simply expose the first kind
// since there's nothing users can do to avoid others being slow
function convertFilter(filter)
{
  let obj = convertObject(["disabled", "text"], filter);
  obj.slow = filter instanceof URLFilter && isSlowFilter(filter);
  return obj;
}

let uiPorts = new Map();
let listenedPreferences = new Set();
let listenedFilterChanges = new Set();
let messageTypes = new Map([
  ["app", "app.respond"],
  ["filter", "filters.respond"],
  ["pref", "prefs.respond"],
  ["requests", "requests.respond"],
  ["subscription", "subscriptions.respond"]
]);

function sendMessage(type, action, ...args)
{
  if (uiPorts.size == 0)
    return;

  let convertedArgs = [];
  for (let arg of args)
  {
    if (arg instanceof Subscription)
      convertedArgs.push(convertSubscription(arg));
    else if (arg instanceof Filter)
      convertedArgs.push(convertFilter(arg));
    else
      convertedArgs.push(arg);
  }

  for (let [uiPort, filters] of uiPorts)
  {
    let actions = filters.get(type);
    if (actions && actions.indexOf(action) != -1)
    {
      uiPort.postMessage({
        type: messageTypes.get(type),
        action,
        args: convertedArgs
      });
    }
  }
}

function includeActiveRemoteSubscriptions(s)
{
  if (s.disabled || !(s instanceof RegularSubscription))
    return false;
  if (s instanceof DownloadableSubscription &&
      !/^(http|https|ftp):/i.test(s.url))
    return false;
  return true;
}

function addRequestListeners(dataCollectionTabId, issueReporterTabId)
{
  let logRequest = (request, filter) =>
  {
    let subscriptions = [];
    if (filter)
    {
      for (let subscription of filterStorage.subscriptions(filter.text))
      {
        if (includeActiveRemoteSubscriptions(subscription))
          subscriptions.push(subscription.url);
      }

      filter = convertFilter(filter);
    }
    request = convertObject(["url", "type", "docDomain", "thirdParty"],
                            request);
    sendMessage("requests", "hits", request, filter, subscriptions);
  };
  let removeTabListeners = tabId =>
  {
    if (tabId == dataCollectionTabId ||
        typeof issueReporterTabId == "number" && tabId == issueReporterTabId)
    {
      HitLogger.removeListener(dataCollectionTabId, logRequest);
      browser.tabs.onRemoved.removeListener(removeTabListeners);
    }
  };
  HitLogger.addListener(dataCollectionTabId, logRequest);
  browser.tabs.onRemoved.addListener(removeTabListeners);
}

function addFilterListeners(type, actions)
{
  for (let action of actions)
  {
    let name;
    if (type == "filter" && action == "loaded")
      name = "ready";
    else
      name = type + "." + action;

    if (!listenedFilterChanges.has(name))
    {
      listenedFilterChanges.add(name);
      filterNotifier.on(name, item =>
      {
        sendMessage(type, action, item);
      });
    }
  }
}

function addSubscription(subscription, properties)
{
  if (!Subscription.isValidURL(subscription.url))
    return false;

  subscription.disabled = false;
  if ("title" in properties)
    subscription.title = properties.title;
  if ("homepage" in properties)
    subscription.homepage = properties.homepage;

  filterStorage.addSubscription(subscription);
  if (subscription instanceof DownloadableSubscription &&
      !subscription.lastDownload)
    synchronizer.execute(subscription);

  return true;
}

class FilterError
{
  constructor(type, reason = null)
  {
    this.lineno = null;
    this.reason = reason;
    this.selector = null;
    this.type = type;
  }

  toJSON()
  {
    return {
      lineno: this.lineno,
      reason: this.reason,
      selector: this.selector,
      type: this.type
    };
  }
}

function parseFilter(text)
{
  let filter = null;
  let error = null;

  text = Filter.normalize(text);
  if (text)
  {
    if (text[0] == "[")
    {
      error = new FilterError("unexpected_filter_list_header");
    }
    else
    {
      filter = Filter.fromText(text);
      if (filter instanceof InvalidFilter)
      {
        error = new FilterError("invalid_filter", filter.reason);
      }
      else if (isActiveFilter(filter) && filter.domains)
      {
        for (let domain of filter.domains.keys())
        {
          if (domain && !isValidHostname(domain))
          {
            error = new FilterError("invalid_domain", domain);
            break;
          }
        }
      }
    }
  }

  return [filter, error];
}

/**
 * Attempts to add the given filter, or returns an error.
 *
 * @event "filters.add"
 * @property {string} text - The filter text to add
 * @returns {FilterError[]}
 */
port.on("filters.add", (message, sender) => filtersAdd(message.text));

/**
 * Returns a serialised version of all the filters that a given subscription
 * contains.
 *
 * @event "filters.get"
 * @property {string} subscriptionUrl - The subscription's URL.
 * @returns {object[]}
 */
port.on("filters.get", (message, sender) =>
{
  let subscription = Subscription.fromURL(message.subscriptionUrl);
  if (!subscription)
    return [];

  return convertSubscriptionFilters(subscription);
});

/**
 * Returns the available filter types, e.g. "FONT", "WEBSOCKET", etc.
 *
 * @event "filters.getTypes"
 * @returns {string[]}
 */
port.on("filters.getTypes", (message, sender) =>
{
  let filterTypes = Array.from(require("requestBlocker").filterTypes);
  filterTypes.push(...filterTypes.splice(filterTypes.indexOf("OTHER"), 1));

  return filterTypes;
});

/**
 * Import the given block of filter text as custom user filters, optionally
 * removing any previously add custom user filters.
 *
 * @event "filters.importRaw"
 * @property {string} text
 *   The filters to add.
 * @property {boolean} removeExisting
 *   If true we remove any previously added custom user filters after adding
 *   the new ones.
 * @returns {string[]} errors
 */
port.on("filters.importRaw", (message, sender) =>
{
  let [filters, errors] = filtersValidate(message.text);

  if (errors.length > 0)
    return errors;

  let addedFilters = new Set();
  for (let filter of filters)
  {
    if (isActiveFilter(filter))
      filterState.setEnabled(filter.text, true);

    filterStorage.addFilter(filter);
    addedFilters.add(filter.text);
  }

  if (!message.removeExisting)
    return errors;

  for (let subscription of filterStorage.subscriptions())
  {
    if (!(subscription instanceof SpecialSubscription))
      continue;

    // We have to iterate backwards for now due to
    // https://issues.adblockplus.org/ticket/7152
    for (let i = subscription.filterCount; i--;)
    {
      let text = subscription.filterTextAt(i);
      if (!allowlistedDomainRegexp.test(text) &&
          !addedFilters.has(text))
        filterStorage.removeFilter(Filter.fromText(text));
    }
  }

  return errors;
});

/**
 * Remove the given filter.
 *
 * @event "filters.remove"
 * @property {string} text
 *   The text of the filter to remove.
 * @property {string} [subscriptionUrl]
 *   The URL of the subscription to remove the filter from, defaults to all
 *   subscriptions.
 * @property {number} [index]
 *   The index of the filter in the given subscription to remove, defaults to
 *   all instances and ignored if subscriptionUrl isn't given.
 * @returns {string[]} errors
 */
port.on("filters.remove", (message, sender) => filtersRemove(message));

/**
 * Replaces one custom user filter with another.
 *
 * @event "filters.replace"
 * @property {} new - The new filter text to add.
 * @property {} old - The old filter text to remove.
 * @returns {string[]} errors
 */
port.on("filters.replace", (message, sender) =>
{
  let errors = filtersAdd(message.new);
  if (errors.length)
    return errors;
  filtersRemove({text: message.old});
  return [];
});

/**
 * Enabled or disables the given filter.
 *
 * @event "filters.toggle"
 * @property {string} text - The filter text.
 * @property {boolean} disabled - True to disable the filter, false to enable.
 */
port.on("filters.toggle", (message, sender) =>
{
  filterState.setEnabled(message.text, !message.disabled);
});

/**
 * Validates the filters inside the given block of filter text.
 *
 * @event "filters.validate"
 * @property {string} text - The filters to validate
 * @returns {string[]} errors
 */
port.on("filters.validate", (message, sender) =>
{
  let [, errors] = filtersValidate(message.text);
  return errors;
});

/**
 * Adds a subscription, either in the background or with the user's
 * confirmation.
 *
 * @event "subscriptions.add"
 * @property {string} url
 *   The subscription's URL.
 * @property {boolean} confirm
 *   If true the user will first be asked to confirm the subscription's details
 *   before it is added.
 * @property {string} [title]
 *   The subscription's title.
 * @property {string} [homepage]
 *   The subscription's homepage.
 * @returns {?boolean}
 *   true if the subscription was added, false if the URL is invalid,
 *   null if the "confirm" property was set
 */
port.on("subscriptions.add", (message, sender) =>
{
  let subscription = Subscription.fromURL(message.url);

  if (message.confirm)
  {
    if ("title" in message)
      subscription.title = message.title;
    if ("homepage" in message)
      subscription.homepage = message.homepage;

    showOptions().then(() =>
    {
      sendMessage("app", "addSubscription", subscription);
    });

    return null;
  }

  return addSubscription(subscription, message);
});

/**
 * Returns a serialised version of all the subscriptions which meet the given
 * criteria. Optionally include the disabled filters for those subscriptions.
 *
 * @event "subscriptions.get"
 * @property {boolean} ignoreDisabled
 *   Skip disabled subscriptions if true.
 * @property {boolean} downloadable
 *   Skip all but downloadable subscriptions if true.
 * @property {boolean} special
 *   Skip all but special subscriptions if true.
 * @property {boolean} disabledFilters
 *   Include a subscription's disabled filters if true.
 * @returns {object[]} subscriptions
 */
port.on("subscriptions.get", (message, sender) =>
{
  let subscriptions = [];
  for (let s of filterStorage.subscriptions())
  {
    if (message.ignoreDisabled && s.disabled)
      continue;

    if (!(message.downloadable && s instanceof DownloadableSubscription ||
          message.special && s instanceof SpecialSubscription))
      continue;

    let subscription = convertSubscription(s);
    if (message.disabledFilters)
    {
      subscription.disabledFilters =
        Array.from(s.filterText(), Filter.fromText)
        .filter(f => isActiveFilter(f) && !filterState.isEnabled(f.text))
        .map(f => f.text);
    }
    subscriptions.push(subscription);
  }
  return subscriptions;
});

/**
 * Returns a list of serialised recommended subscriptions for the user.
 *
 * @event "subscriptions.getRecommendations"
 * @returns {object[]} recommendedSubscriptions
 */
port.on("subscriptions.getRecommendations",
        (message, sender) => Array.from(recommendations(),
                                        convertRecommendation));

/**
 * Remove the given subscription if it exists.
 *
 * @event "subscriptions.remove"
 * @property {string} url - The subscription's URL.
 */
port.on("subscriptions.remove", (message, sender) =>
{
  let subscription = Subscription.fromURL(message.url);
  if (filterStorage.hasSubscription(subscription))
    filterStorage.removeSubscription(subscription);
});

/**
 * Toggles a subscription by either enabling/disabling, or by adding/removing
 * it.
 *
 * @event "subscriptions.toggle"
 * @property {string} url
 *   The subscription's URL.
 * @property {boolean} keepInstalled
 *   If true enable/disable the subscription, otherwise add/remove.
 * @returns {boolean}
 *   true if the subscription was toggled successfully,
 *   false if it's a new subscription with an invalid URL
 */
port.on("subscriptions.toggle", (message, sender) =>
{
  let subscription = Subscription.fromURL(message.url);

  if (filterStorage.hasSubscription(subscription))
  {
    if (subscription.disabled || message.keepInstalled)
      subscription.disabled = !subscription.disabled;
    else
      filterStorage.removeSubscription(subscription);
    return true;
  }

  return addSubscription(subscription, message);
});

/**
 * Trigger either the given subscription, or all subscriptions, to update.
 *
 * @event "subscriptions.update"
 * @property {string} [url]
 *   The subscription to update, if not specified all subscriptions will be
 *   updated.
 */
port.on("subscriptions.update", (message, sender) =>
{
  let subscriptions;
  if (message.url)
    subscriptions = [Subscription.fromURL(message.url)];
  else
    subscriptions = filterStorage.subscriptions();

  for (let subscription of subscriptions)
  {
    if (subscription instanceof DownloadableSubscription)
      synchronizer.execute(subscription, true);
  }
});

function filtersAdd(text)
{
  let [filter, error] = parseFilter(text);

  if (error)
    return [error];

  if (filter)
  {
    if (isActiveFilter(filter))
      filterState.setEnabled(text, true);
    filterStorage.addFilter(filter);
  }

  return [];
}

function filtersValidate(text)
{
  let filters = [];
  let errors = [];

  let lines = text.split("\n");
  for (let i = 0; i < lines.length; i++)
  {
    let [filter, error] = parseFilter(lines[i]);

    if (error)
    {
      // We don't treat filter headers like invalid filters,
      // instead we simply ignore them and don't show any errors
      // in order to allow pasting complete filter lists.
      // If there are no filters, we do treat it as an invalid filter
      // to inform users about it and to give them a chance to edit it.
      if (error.type === "unexpected_filter_list_header" &&
          lines.length > 1)
        continue;

      if (lines.length > 1)
        error.lineno = i + 1;

      errors.push(error);
    }
    else if (filter)
    {
      filters.push(filter);
    }
  }

  return [filters, errors];
}

function filtersRemove(message)
{
  let filter = Filter.fromText(message.text);
  let subscription = null;
  if (message.subscriptionUrl)
    subscription = Subscription.fromURL(message.subscriptionUrl);

  if (!subscription)
    filterStorage.removeFilter(filter);
  else
    filterStorage.removeFilter(filter, subscription, message.index);
  // in order to behave, from consumer perspective, like any other
  // method that could produce errors, return an Array, even if empty
  return [];
}

function listen(type, filters, newFilter, message, senderTabId)
{
  switch (type)
  {
    case "app":
      filters.set("app", newFilter);
      break;
    case "filters":
      filters.set("filter", newFilter);
      addFilterListeners("filter", newFilter);
      break;
    case "prefs":
      filters.set("pref", newFilter);
      for (let preference of newFilter)
      {
        if (!listenedPreferences.has(preference))
        {
          listenedPreferences.add(preference);
          Prefs.on(preference, () =>
          {
            sendMessage("pref", preference, Prefs[preference]);
          });
        }
      }
      break;
    case "subscriptions":
      filters.set("subscription", newFilter);
      addFilterListeners("subscription", newFilter);
      break;
    case "requests":
      filters.set("requests", newFilter);
      addRequestListeners(message.tabId, senderTabId);
      break;
  }
}

function onConnect(uiPort)
{
  if (uiPort.name != "ui")
    return;

  let filters = new Map();
  uiPorts.set(uiPort, filters);

  uiPort.onDisconnect.addListener(() =>
  {
    uiPorts.delete(uiPort);
  });

  uiPort.onMessage.addListener(message =>
  {
    let [type, action] = message.type.split(".", 2);

    // For now we're only using long-lived connections for handling
    // "*.listen" messages to tackle #6440
    if (action == "listen")
    {
      listen(type, filters, message.filter, message,
             uiPort.sender && uiPort.sender.tab && uiPort.sender.tab.id);
    }
  });
}

browser.runtime.onConnect.addListener(onConnect);
