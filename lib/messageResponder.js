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

const {port} = require("messaging");
const {Prefs} = require("prefs");
const {Utils} = require("utils");
const {filterStorage} = require("filterStorage");
const {filterNotifier} = require("filterNotifier");
const {isSlowFilter, Matcher} = require("matcher");
const {Notification: NotificationStorage} = require("notification");
const {getActiveNotification, shouldDisplay} = require("notificationHelper");
const {HitLogger} = require("hitLogger");
const {
  Filter, ActiveFilter, InvalidFilter, RegExpFilter
} = require("filterClasses");
const {synchronizer} = require("synchronizer");
const info = require("info");
const {
  Subscription,
  DownloadableSubscription,
  SpecialSubscription,
  RegularSubscription
} = require("subscriptionClasses");
const {showOptions} = require("options");
const {recommendations} = require("recommendations");

port.on("types.get", (message, sender) =>
{
  const filterTypes = Array.from(require("requestBlocker").filterTypes);
  filterTypes.push(...filterTypes.splice(filterTypes.indexOf("OTHER"), 1));
  return filterTypes;
});

function convertObject(keys, obj)
{
  const result = {};
  for (const key of keys)
  {
    if (key in obj)
      result[key] = obj[key];
  }
  return result;
}

const convertRecommendation = convertObject.bind(null, [
  "languages", "title", "type", "url"
]);

function convertSubscriptionFilters(subscription)
{
  const filters = Array.from(subscription.filterText(), Filter.fromText);
  return filters.map(convertFilter);
}

function convertSubscription(subscription)
{
  const obj = convertObject(["disabled", "downloadStatus", "homepage",
                             "version", "lastDownload", "lastSuccess",
                             "softExpiration", "expires", "title",
                             "url"], subscription);
  if (subscription instanceof SpecialSubscription)
    obj.filters = convertSubscriptionFilters(subscription);

  obj.downloading = synchronizer.isExecuting(subscription.url);
  return obj;
}

// pollute a converted filter object with `slow` detail
// there are 3 kind of slow filters
//  1. filter instanceof RegExpFilter && isSlowFilter(filter)
//  2. filter instanceof ElemHideEmulationFilter
//  3. filter instanceof SnippetFilter
// for the time being, we want to simply expose the first kind
// since there's nothing users can do to avoid others being slow
function convertFilter(filter)
{
  const obj = convertObject(["disabled", "text"], filter);
  obj.slow = filter instanceof RegExpFilter && isSlowFilter(filter);
  return obj;
}

const uiPorts = new Map();
const listenedPreferences = Object.create(null);
const listenedFilterChanges = Object.create(null);
const messageTypes = new Map([
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

  const convertedArgs = [];
  for (const arg of args)
  {
    if (arg instanceof Subscription)
      convertedArgs.push(convertSubscription(arg));
    else if (arg instanceof Filter)
      convertedArgs.push(convertFilter(arg));
    else
      convertedArgs.push(arg);
  }

  for (const [uiPort, filters] of uiPorts)
  {
    const actions = filters.get(type);
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
  const logRequest = (request, filter) =>
  {
    let subscriptions = [];
    if (filter)
    {
      subscriptions = filterStorage.subscriptions(filter.text);
      subscriptions = Array.from(subscriptions)
        .filter(includeActiveRemoteSubscriptions)
        .map(s => s.url);
      filter = convertFilter(filter);
    }
    request = convertObject(["url", "type", "docDomain", "thirdParty"],
                            request);
    sendMessage("requests", "hits", request, filter, subscriptions);
  };
  const removeTabListeners = (tabId) =>
  {
    if (tabId == dataCollectionTabId || tabId == issueReporterTabId)
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
  for (const action of actions)
  {
    let name;
    if (type == "filter" && action == "loaded")
      name = "ready";
    else
      name = type + "." + action;

    if (!(name in listenedFilterChanges))
    {
      listenedFilterChanges[name] = null;
      filterNotifier.on(name, (item) =>
      {
        sendMessage(type, action, item);
      });
    }
  }
}

function addSubscription(subscription, properties)
{
  subscription.disabled = false;
  if ("title" in properties)
    subscription.title = properties.title;
  if ("homepage" in properties)
    subscription.homepage = properties.homepage;

  filterStorage.addSubscription(subscription);
  if (subscription instanceof DownloadableSubscription &&
      !subscription.lastDownload)
    synchronizer.execute(subscription);
}

port.on("app.get", (message, sender) =>
{
  if (message.what == "issues")
  {
    const subscriptionInit = require("subscriptionInit");
    return {
      dataCorrupted: subscriptionInit.isDataCorrupted(),
      filterlistsReinitialized: subscriptionInit.isReinitialized()
    };
  }

  if (message.what == "doclink")
  {
    let {application} = info;
    if (info.platform == "chromium" && application != "opera")
      application = "chrome";
    else if (info.platform == "gecko")
      application = "firefox";

    const link = Utils.getDocLink(
      message.link.replace("{browser}", application)
    );

    // Edge 42 does not always return the link as given by Utils.getDocLink,
    // for some reason .toString() is enough to get it working. This seems
    // to have been fixed in Edge 44. (See issue 7222.)
    if (info.platform == "edgehtml")
      return link.toString();

    return link;
  }

  if (message.what == "localeInfo")
  {
    let bidiDir;
    if ("chromeRegistry" in Utils)
    {
      const isRtl = Utils.chromeRegistry.isLocaleRTL("adblockplus");
      bidiDir = isRtl ? "rtl" : "ltr";
    }
    else
      bidiDir = Utils.readingDirection;

    return {locale: Utils.appLocale, bidiDir};
  }

  if (message.what == "features")
  {
    return {
      devToolsPanel: info.platform == "chromium" ||
                     info.application == "firefox" &&
                     parseInt(info.applicationVersion, 10) >= 54
    };
  }

  if (message.what == "recommendations")
    return Array.from(recommendations(), convertRecommendation);

  if (message.what == "senderId")
    return sender.page.id;

  return info[message.what];
});

port.on("app.open", (message, sender) =>
{
  if (message.what == "options")
  {
    showOptions().then(() =>
    {
      if (!message.action)
        return;

      sendMessage("app", message.action, ...message.args);
    });
  }
});

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
        error = new FilterError("invalid_filter", filter.reason);
    }
  }

  return [filter, error];
}

port.on("filters.add", (message) => filtersAdd(message.text));

port.on("filters.get", (message, sender) =>
{
  const subscription = Subscription.fromURL(message.subscriptionUrl);
  if (!subscription)
    return [];

  return convertSubscriptionFilters(subscription);
});

port.on("filters.importRaw", (message, sender) =>
{
  const [filters, errors] = filtersValidate(message.text);

  if (errors.length > 0)
    return errors;

  const addedFilters = new Set();
  for (const filter of filters)
  {
    if (filter instanceof ActiveFilter)
    {
      filter.disabled = false;
    }
    filterStorage.addFilter(filter);
    addedFilters.add(filter.text);
  }

  if (!message.removeExisting)
    return errors;

  for (const subscription of filterStorage.subscriptions())
  {
    if (!(subscription instanceof SpecialSubscription))
      continue;

    // We have to iterate backwards for now due to
    // https://issues.adblockplus.org/ticket/7152
    for (let i = subscription.filterCount; i--;)
    {
      const text = subscription.filterTextAt(i);
      if (!/^@@\|\|([^/:]+)\^\$document$/.test(text) &&
          !addedFilters.has(text))
      {
        filterStorage.removeFilter(Filter.fromText(text));
      }
    }
  }

  return errors;
});

port.on("filters.remove", (message) => filtersRemove(message));

port.on("filters.replace", (message, sender) =>
{
  const errors = filtersAdd(message.new);
  if (errors.length)
    return errors;
  filtersRemove({text: message.old});
  return [];
});

port.on("filters.toggle", (message, sender) =>
{
  const filter = Filter.fromText(message.text);
  filter.disabled = message.disabled;
});

port.on("filters.validate", (message, sender) =>
{
  const [, errors] = filtersValidate(message.text);
  return errors;
});

port.on("prefs.get", (message, sender) =>
{
  return Prefs[message.key];
});

port.on("prefs.set", (message, sender) =>
{
  if (message.key == "notifications_ignoredcategories")
    return NotificationStorage.toggleIgnoreCategory("*", !!message.value);

  return Prefs[message.key] = message.value;
});

port.on("prefs.toggle", (message, sender) =>
{
  if (message.key == "notifications_ignoredcategories")
    return NotificationStorage.toggleIgnoreCategory("*");

  return Prefs[message.key] = !Prefs[message.key];
});

port.on("notifications.get", (message, sender) =>
{
  const notification = getActiveNotification();

  if (!notification ||
      "displayMethod" in message &&
      !shouldDisplay(message.displayMethod, notification.type))
    return;

  // Determine whether to return a notification that's targeting certain sites
  // See also https://hg.adblockplus.org/adblockpluscore/file/56c681657836/lib/notification.js#l301
  if (notification.urlFilters instanceof Array)
  {
    let {url} = message;
    if (!url)
      return;

    try
    {
      url = new URL(url);
    }
    catch (e)
    {
      return;
    }

    const matcher = new Matcher();
    for (const urlFilter of notification.urlFilters)
    {
      matcher.add(Filter.fromText(urlFilter));
    }

    const {DOCUMENT} = RegExpFilter.typeMap;
    if (!matcher.matchesAny(url, DOCUMENT, url.hostname))
      return;
  }

  const texts = NotificationStorage.getLocalizedTexts(notification,
                                                    message.locale);
  return Object.assign({texts}, notification);
});

port.on("subscriptions.add", (message, sender) =>
{
  const subscription = Subscription.fromURL(message.url);
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
  }
  else
  {
    addSubscription(subscription, message);
  }
});

port.on("subscriptions.get", (message, sender) =>
{
  const subscriptions = [];
  for (const s of filterStorage.subscriptions())
  {
    if (message.ignoreDisabled && s.disabled)
      continue;

    if (message.downloadable && !(s instanceof DownloadableSubscription))
      continue;

    if (message.special && !(s instanceof SpecialSubscription))
      continue;

    const subscription = convertSubscription(s);
    if (message.disabledFilters)
    {
      subscription.disabledFilters =
        Array.from(s.filterText(), Filter.fromText)
        .filter((f) => f instanceof ActiveFilter && f.disabled)
        .map((f) => f.text);
    }
    subscriptions.push(subscription);
  }
  return subscriptions;
});

port.on("subscriptions.remove", (message, sender) =>
{
  const subscription = Subscription.fromURL(message.url);
  if (filterStorage.knownSubscriptions.has(subscription.url))
    filterStorage.removeSubscription(subscription);
});

port.on("subscriptions.toggle", (message, sender) =>
{
  const subscription = Subscription.fromURL(message.url);
  if (filterStorage.knownSubscriptions.has(subscription.url))
  {
    if (subscription.disabled || message.keepInstalled)
      subscription.disabled = !subscription.disabled;
    else
      filterStorage.removeSubscription(subscription);
  }
  else
  {
    addSubscription(subscription, message);
  }
});

port.on("subscriptions.update", (message, sender) =>
{
  let subscriptions;
  if (message.url)
  {
    subscriptions = [Subscription.fromURL(message.url)];
  }
  else
  {
    subscriptions = filterStorage.subscriptions();
  }

  for (const subscription of subscriptions)
  {
    if (subscription instanceof DownloadableSubscription)
      synchronizer.execute(subscription, true);
  }
});

function filtersAdd(text)
{
  const [filter, error] = parseFilter(text);

  if (error)
    return [error];

  if (filter)
  {
    if (filter instanceof ActiveFilter)
    {
      filter.disabled = false;
    }
    filterStorage.addFilter(filter);
  }

  return [];
}

function filtersValidate(text)
{
  const filters = [];
  const errors = [];

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++)
  {
    const [filter, error] = parseFilter(lines[i]);

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
      {
        error.lineno = i + 1;
      }
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
  const filter = Filter.fromText(message.text);
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
      for (const preference of newFilter)
      {
        if (!(preference in listenedPreferences))
        {
          listenedPreferences[preference] = null;
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

  const filters = new Map();
  uiPorts.set(uiPort, filters);

  uiPort.onDisconnect.addListener(() =>
  {
    uiPorts.delete(uiPort);
  });

  uiPort.onMessage.addListener((message) =>
  {
    const [type, action] = message.type.split(".", 2);

    // For now we're only using long-lived connections for handling
    // "*.listen" messages to tackle #6440
    if (action == "listen")
    {
      listen(type, filters, message.filter, message, uiPort.sender.tab.id);
    }
  });
}

browser.runtime.onConnect.addListener(onConnect);
