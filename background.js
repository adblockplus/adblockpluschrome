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

with(require("filterClasses"))
{
  this.Filter = Filter;
  this.BlockingFilter = BlockingFilter;
  this.WhitelistFilter = WhitelistFilter;
  this.RegExpFilter = RegExpFilter;
}
with(require("subscriptionClasses"))
{
  this.Subscription = Subscription;
  this.DownloadableSubscription = DownloadableSubscription;
  this.SpecialSubscription = SpecialSubscription;
}
with(require("whitelisting"))
{
  this.isPageWhitelisted = isPageWhitelisted;
  this.isFrameWhitelisted = isFrameWhitelisted;
  this.processKey = processKey;
  this.getKey = getKey;
}
with(require("url"))
{
  this.stringifyURL = stringifyURL;
  this.isThirdParty = isThirdParty;
  this.extractHostFromFrame = extractHostFromFrame;
}
var FilterStorage = require("filterStorage").FilterStorage;
var FilterNotifier = require("filterNotifier").FilterNotifier;
var ElemHide = require("elemHide").ElemHide;
var defaultMatcher = require("matcher").defaultMatcher;
var Prefs = require("prefs").Prefs;
var Synchronizer = require("synchronizer").Synchronizer;
var Utils = require("utils").Utils;
var parseFilters = require("filterValidation").parseFilters;
var composeFilters = require("filterComposer").composeFilters;
var updateIcon = require("icon").updateIcon;
var initNotifications = require("notificationHelper").initNotifications;
var showNextNotificationForUrl = require("notificationHelper").showNextNotificationForUrl;

var seenDataCorruption = false;
var filterlistsReinitialized = false;

function init()
{
  var filtersLoaded = false;
  var prefsLoaded = false;

  var checkLoaded = function()
  {
    if (!filtersLoaded || !prefsLoaded)
      return;

    var info = require("info");
    var previousVersion = Prefs.currentVersion;

    // There are no filters stored so we need to reinitialize all filterlists
    if (!FilterStorage.firstRun && FilterStorage.subscriptions.length === 0)
    {
      filterlistsReinitialized = true;
      previousVersion = null;
    }

    if (previousVersion != info.addonVersion || FilterStorage.firstRun)
    {
      seenDataCorruption = previousVersion && FilterStorage.firstRun;
      Prefs.currentVersion = info.addonVersion;
      addSubscription(previousVersion);
    }

    // The "Hide placeholders" option has been removed from the UI in 1.8.8.1285
    // So we reset the option for users updating from older versions.
    if (previousVersion && Services.vc.compare(previousVersion, "1.8.8.1285") < 0)
      Prefs.hidePlaceholders = true;

    initNotifications();

    // Update browser actions and context menus when whitelisting might have
    // changed. That is now when initally loading the filters and later when
    // importing backups or saving filter changes.
    FilterNotifier.addListener(function(action)
    {
      if (action == "load" || action == "save")
        refreshIconAndContextMenuForAllPages();
    });
    refreshIconAndContextMenuForAllPages();
  };

  var onFilterAction = function(action)
  {
    if (action == "load")
    {
      FilterNotifier.removeListener(onFilterAction);
      filtersLoaded = true;
      checkLoaded();
    }
  };

  var onPrefsLoaded = function()
  {
    Prefs.onLoaded.removeListener(onPrefsLoaded);
    prefsLoaded = true;
    checkLoaded();
  };

  FilterNotifier.addListener(onFilterAction);
  Prefs.onLoaded.addListener(onPrefsLoaded);
}
init();

// Special-case domains for which we cannot use style-based hiding rules.
// See http://crbug.com/68705.
var noStyleRulesHosts = ["mail.google.com", "mail.yahoo.com", "www.google.com"];

var htmlPages = new ext.PageMap();

var contextMenuItem = {
  title: ext.i18n.getMessage("block_element"),
  contexts: ["image", "video", "audio"],
  onclick: function(page)
  {
    page.sendMessage({type: "clickhide-new-filter"});
  }
};

// Adds or removes browser action icon according to options.
function refreshIconAndContextMenu(page)
{
  var whitelisted = isPageWhitelisted(page);
  updateIcon(page, whitelisted);

  // show or hide the context menu entry dependent on whether
  // adblocking is active on that page
  page.contextMenus.removeAll();
  if (Prefs.shouldShowBlockElementMenu && !whitelisted && htmlPages.has(page))
    page.contextMenus.create(contextMenuItem);
}

function refreshIconAndContextMenuForAllPages()
{
  ext.pages.query({}, function(pages)
  {
    pages.forEach(refreshIconAndContextMenu);
  });
}

/**
 * This function is called on an extension update. It will add the default
 * filter subscription if necessary.
 */
function addSubscription(prevVersion)
{
  // Make sure to remove "Recommended filters", no longer necessary
  var toRemove = "https://easylist-downloads.adblockplus.org/chrome_supplement.txt";
  if (toRemove in FilterStorage.knownSubscriptions)
    FilterStorage.removeSubscription(FilterStorage.knownSubscriptions[toRemove]);

  // Add "acceptable ads" subscription for new users
  var addAcceptable = !prevVersion;
  if (addAcceptable)
  {
    addAcceptable = !FilterStorage.subscriptions.some(function(subscription)
    {
      return subscription.url == Prefs.subscriptions_exceptionsurl;
    });
  }

  // Don't add subscription if the user has a subscription already
  var addSubscription = !FilterStorage.subscriptions.some(function(subscription)
  {
    return subscription instanceof DownloadableSubscription &&
           subscription.url != Prefs.subscriptions_exceptionsurl;
  });

  // If this isn't the first run, only add subscription if the user has no custom filters
  if (addSubscription && prevVersion)
  {
    addSubscription = !FilterStorage.subscriptions.some(function(subscription)
    {
      return subscription.url != Prefs.subscriptions_exceptionsurl &&
             subscription.filters.length;
    });
  }

  // Add "acceptable ads" subscription
  if (addAcceptable)
  {
    var subscription = Subscription.fromURL(Prefs.subscriptions_exceptionsurl);
    if (subscription)
    {
      subscription.title = "Allow non-intrusive advertising";
      FilterStorage.addSubscription(subscription);
      if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
        Synchronizer.execute(subscription);
    }
    else
      addAcceptable = false;
  }

  // Add "anti-adblock messages" subscription for new users and users updating from old ABP versions
  if (!prevVersion || Services.vc.compare(prevVersion, "1.8") < 0)
  {
    var subscription = Subscription.fromURL(Prefs.subscriptions_antiadblockurl);
    if (subscription && !(subscription.url in FilterStorage.knownSubscriptions))
    {
      subscription.disabled = true;
      FilterStorage.addSubscription(subscription);
      if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
        Synchronizer.execute(subscription);
    }
  }

  if (!addSubscription && !addAcceptable)
    return;

  function notifyUser()
  {
    if (!Prefs.suppress_first_run_page)
      ext.pages.open(ext.getURL("firstRun.html"));
  }

  if (addSubscription)
  {
    // Load subscriptions data
    var request = new XMLHttpRequest();
    request.open("GET", "subscriptions.xml");
    request.addEventListener("load", function()
    {
      var node = Utils.chooseFilterSubscription(request.responseXML.getElementsByTagName("subscription"));
      var subscription = (node ? Subscription.fromURL(node.getAttribute("url")) : null);
      if (subscription)
      {
        FilterStorage.addSubscription(subscription);
        subscription.disabled = false;
        subscription.title = node.getAttribute("title");
        subscription.homepage = node.getAttribute("homepage");
        if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
          Synchronizer.execute(subscription);

          notifyUser();
      }
    }, false);
    request.send(null);
  }
  else
    notifyUser();
}

Prefs.onChanged.addListener(function(name)
{
  if (name == "shouldShowBlockElementMenu")
    refreshIconAndContextMenuForAllPages();
});

// This is a hack to speedup loading of the options page on Safari.
// Once we replaced the background page proxy with message passing
// this global function should removed.
function getUserFilters()
{
  var filters = [];
  var exceptions = [];

  for (var i = 0; i < FilterStorage.subscriptions.length; i++)
  {
    var subscription = FilterStorage.subscriptions[i];
    if (!(subscription instanceof SpecialSubscription))
      continue;

    for (var j = 0; j < subscription.filters.length; j++)
    {
      var filter = subscription.filters[j];
      if (filter instanceof WhitelistFilter &&  /^@@\|\|([^\/:]+)\^\$document$/.test(filter.text))
        exceptions.push(RegExp.$1);
      else
        filters.push(filter.text);
    }
  }

  return {filters: filters, exceptions: exceptions};
}

ext.onMessage.addListener(function (msg, sender, sendResponse)
{
  switch (msg.type)
  {
    case "get-selectors":
      var selectors = [];

      if (!isFrameWhitelisted(sender.page, sender.frame,
                              RegExpFilter.typeMap.DOCUMENT | RegExpFilter.typeMap.ELEMHIDE))
      {
        var noStyleRules = false;
        var specificOnly = isFrameWhitelisted(sender.page, sender.frame,
                                              RegExpFilter.typeMap.GENERICHIDE);
        var host = extractHostFromFrame(sender.frame);

        for (var i = 0; i < noStyleRulesHosts.length; i++)
        {
          var noStyleHost = noStyleRulesHosts[i];
          if (host == noStyleHost || (host.length > noStyleHost.length &&
                                      host.substr(host.length - noStyleHost.length - 1) == "." + noStyleHost))
          {
            noStyleRules = true;
          }
        }
        selectors = ElemHide.getSelectorsForDomain(host, specificOnly);
        if (noStyleRules)
        {
          selectors = selectors.filter(function(s)
          {
            return !/\[style[\^\$]?=/.test(s);
          });
        }
      }

      sendResponse(selectors);
      break;
    case "should-collapse":
      if (isFrameWhitelisted(sender.page, sender.frame, RegExpFilter.typeMap.DOCUMENT))
      {
        sendResponse(false);
        break;
      }

      var typeMask = RegExpFilter.typeMap[msg.mediatype];
      var documentHost = extractHostFromFrame(sender.frame);
      var sitekey = getKey(sender.page, sender.frame);
      var blocked = false;

      for (var i = 0; i < msg.urls.length; i++)
      {
        var url = new URL(msg.urls[i], msg.baseURL);
        var filter = defaultMatcher.matchesAny(
          stringifyURL(url), typeMask,
          documentHost, isThirdParty(url, documentHost), sitekey
        );

        if (filter instanceof BlockingFilter)
        {
          if (filter.collapse != null)
          {
            sendResponse(filter.collapse);
            return;
          }

          blocked = true;
        }
      }

      sendResponse(blocked && Prefs.hidePlaceholders);
      break;
    case "get-domain-enabled-state":
      // Returns whether this domain is in the exclusion list.
      // The browser action popup asks us this.
      if(sender.page)
      {
        sendResponse({enabled: !isPageWhitelisted(sender.page)});
        return;
      }
      break;
    case "add-filters":
      var result = parseFilters(msg.text);

      if (result.errors.length > 0)
      {
        sendResponse({status: "invalid", error: result.errors.join("\n")});
        break;
      }

      for (var i = 0; i < result.filters.length; i++)
        FilterStorage.addFilter(result.filters[i]);

      sendResponse({status: "ok"});
      break;
    case "add-subscription":
      ext.showOptions(function(page)
      {
        page.sendMessage(msg);
      });
      break;
    case "add-sitekey":
      processKey(msg.token, sender.page, sender.frame);
      break;
    case "report-html-page":
      htmlPages.set(sender.page, null);
      refreshIconAndContextMenu(sender.page);
      break;
    case "compose-filters":
      sendResponse(composeFilters({
        tagName: msg.tagName,
        id: msg.id,
        src: msg.src,
        style: msg.style,
        classes: msg.classes,
        urls: msg.urls,
        type: msg.mediatype,
        baseURL: msg.baseURL,
        page: sender.page,
        frame: sender.frame
      }));
      break;
    case "forward":
      if (sender.page)
      {
        if (msg.expectsResponse)
        {
          sender.page.sendMessage(msg.payload, sendResponse);
          return true;
        }

        sender.page.sendMessage(msg.payload);
      }
      break;
  }
});

// update icon when page changes location
ext.pages.onLoading.addListener(function(page)
{
  page.sendMessage({type: "clickhide-deactivate"});
  refreshIconAndContextMenu(page);
  showNextNotificationForUrl(page.url);
});
