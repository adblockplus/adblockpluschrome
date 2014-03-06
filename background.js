/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
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
  this.RegExpFilter = RegExpFilter;
  this.BlockingFilter = BlockingFilter;
  this.WhitelistFilter = WhitelistFilter;
}
with(require("subscriptionClasses"))
{
  this.Subscription = Subscription;
  this.DownloadableSubscription = DownloadableSubscription;
}
with(require("whitelisting"))
{
  this.isWhitelisted = isWhitelisted;
  this.isFrameWhitelisted = isFrameWhitelisted;
  this.processKeyException = processKeyException;
}
var FilterStorage = require("filterStorage").FilterStorage;
var ElemHide = require("elemHide").ElemHide;
var defaultMatcher = require("matcher").defaultMatcher;
var Prefs = require("prefs").Prefs;
var Synchronizer = require("synchronizer").Synchronizer;
var Utils = require("utils").Utils;
var Notification = require("notification").Notification;

// Some types cannot be distinguished
RegExpFilter.typeMap.OBJECT_SUBREQUEST = RegExpFilter.typeMap.OBJECT;
RegExpFilter.typeMap.MEDIA = RegExpFilter.typeMap.FONT = RegExpFilter.typeMap.OTHER;

var isFirstRun = false;
var seenDataCorruption = false;
require("filterNotifier").FilterNotifier.addListener(function(action)
{
  if (action == "load")
  {
    var importingOldData = importOldData();

    var addonVersion = require("info").addonVersion;
    var prevVersion = localStorage.currentVersion;
    if (prevVersion != addonVersion)
    {
      isFirstRun = !prevVersion;
      localStorage.currentVersion = addonVersion;
      if (!importingOldData)
        addSubscription(prevVersion);
    }
  }

  // update browser actions when whitelisting might have changed,
  // due to loading filters or saving filter changes
  if (action == "load" || action == "save")
  {
    ext.windows.getAll(function(windows)
    {
      for (var i = 0; i < windows.length; i++)
      {
        windows[i].getAllTabs(function(tabs)
        {
          tabs.forEach(refreshIconAndContextMenu);
        });
      }
    });
  }
});

// Special-case domains for which we cannot use style-based hiding rules.
// See http://crbug.com/68705.
var noStyleRulesHosts = ["mail.google.com", "mail.yahoo.com", "www.google.com"];

function removeDeprecatedOptions()
{
  var deprecatedOptions = ["specialCaseYouTube", "experimental", "disableInlineTextAds"];
  deprecatedOptions.forEach(function(option)
  {
    if (option in localStorage)
      delete localStorage[option];
  });
}

// Remove deprecated options before we do anything else.
removeDeprecatedOptions();

var activeNotification = null;

// Adds or removes browser action icon according to options.
function refreshIconAndContextMenu(tab)
{
  var whitelisted = isWhitelisted(tab.url);

  var iconFilename;
  if (require("info").platform == "safari")
    // There is no grayscale version of the icon for whitelisted tabs
    // when using Safari, because icons are grayscale already and icons
    // aren't per tab in Safari.
    iconFilename = "icons/abp-16.png"
  else
    iconFilename = whitelisted ? "icons/abp-19-whitelisted.png" : "icons/abp-19.png";

  tab.browserAction.setIcon(iconFilename);
  iconAnimation.registerTab(tab, iconFilename);

  // Set context menu status according to whether current tab has whitelisted domain
  if (whitelisted || !/^https?:/.test(tab.url))
    ext.contextMenus.hideMenuItems();
  else
    ext.contextMenus.showMenuItems();
}

/**
 * Old versions for Opera stored patterns.ini in the localStorage object, this
 * will import it into FilterStorage properly.
 * @return {Boolean} true if data import is in progress
 */
function importOldData()
{
  if ("patterns.ini" in localStorage)
  {
    FilterStorage.loadFromDisk(localStorage["patterns.ini"]);

    var remove = [];
    for (var key in localStorage)
      if (key.indexOf("patterns.ini") == 0 || key.indexOf("patterns-backup") == 0)
        remove.push(key);
    for (var i = 0; i < remove.length; i++)
      delete localStorage[remove[i]];

    return true;
  }
  else
    return false;
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

  if (!addSubscription && !addAcceptable)
    return;

  function notifyUser()
  {
    ext.windows.getLastFocused(function(win)
    {
      win.openTab(ext.getURL("firstRun.html"));
    });
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

function setContextMenu()
{
  if (Prefs.shouldShowBlockElementMenu)
  {
    // Register context menu item
    ext.contextMenus.addMenuItem(ext.i18n.getMessage("block_element"), ["image", "video", "audio"], function(srcUrl, tab)
    {
      if (srcUrl)
        tab.sendMessage({type: "clickhide-new-filter", filter: srcUrl});
    });
  }
  else
    ext.contextMenus.removeMenuItems();
}

Prefs.addListener(function(name)
{
  if (name == "shouldShowBlockElementMenu")
    setContextMenu();
});
setContextMenu();

/**
  * Opens options tab or focuses an existing one, within the last focused window.
  * @param {Function} callback  function to be called with the
                                Tab object of the options tab
  */
function openOptions(callback)
{
  ext.windows.getLastFocused(function(win)
  {
    win.getAllTabs(function(tabs)
    {
      var optionsUrl = ext.getURL("options.html");

      for (var i = 0; i < tabs.length; i++)
      {
        if (tabs[i].url == optionsUrl)
        {
          tabs[i].activate();
          if (callback)
            callback(tabs[i]);
          return;
        }
      }

      win.openTab(optionsUrl, callback && function(tab)
      {
        tab.onCompleted.addListener(callback);
      });
    });
  });
}

function prepareNotificationIconAndPopup()
{
  activeNotification.onClicked = function()
  {
    iconAnimation.stop();
    activeNotification = null;
  };
  iconAnimation.update(activeNotification.severity);
}

function openNotificationLinks() 
{
  if (activeNotification.links)
  {
    activeNotification.links.forEach(function(link)
    {
      ext.windows.getLastFocused(function(win)
      {
        win.openTab(Utils.getDocLink(link));
      });
    });
  }
}

function notificationButtonClick(id, index)
{
  if (activeNotification.links && activeNotification.links[index])
  {
    ext.windows.getLastFocused(function(win)
    {
      win.openTab(Utils.getDocLink(activeNotification.links[index]));
    });
  }
}

function showNotification(notification)
{
  activeNotification = notification;
  if (activeNotification.severity === "critical")
  {
    var hasWebkitNotifications = typeof webkitNotifications !== "undefined";
    if (hasWebkitNotifications && "createHTMLNotification" in webkitNotifications)
    {
      var notification = webkitNotifications.createHTMLNotification("notification.html");
      notification.show();
      notification.addEventListener("close", prepareNotificationIconAndPopup, false);
      return;
    }
    
    var texts = Notification.getLocalizedTexts(notification);
    var title = texts.title || "";
    var message = texts.message ? texts.message.replace(/<\/?(a|strong)>/g, "") : "";
    var iconUrl = ext.getURL("icons/abp-128.png");
    var hasLinks = activeNotification.links && activeNotification.links.length > 0;
    // Chrome on Linux does not fully support chrome.notifications yet 
    // https://code.google.com/p/chromium/issues/detail?id=291485
    if (require("info").platform == "chromium" && 
        "notifications" in chrome && 
        navigator.platform.indexOf("Linux") == -1)
    {
      var opts = {
        type: "basic",
        title: title,
        message: message,
        iconUrl: iconUrl,
        buttons: []
      };
      var regex = /<a>(.*?)<\/a>/g;
      var plainMessage = texts.message || "";
      var match;
      while (match = regex.exec(plainMessage))
        opts.buttons.push({title: match[1]});
      
      var notification = chrome.notifications;
      notification.create("", opts, function() {});
      notification.onClosed.addListener(prepareNotificationIconAndPopup);
      notification.onButtonClicked.addListener(notificationButtonClick);
    }
    else if (hasWebkitNotifications && "createNotification" in webkitNotifications)
    {
      if (hasLinks)
        message += " " + ext.i18n.getMessage("notification_without_buttons");
        
      var notification = webkitNotifications.createNotification(iconUrl, title, message);
      notification.show();
      notification.addEventListener("close", prepareNotificationIconAndPopup, false);
      notification.addEventListener("click", openNotificationLinks, false);
    }
    else
    {
      var message = title + "\n" + message;
      if (hasLinks)
        message += "\n\n" + ext.i18n.getMessage("notification_with_buttons");
        
      if (confirm(message))
        openNotificationLinks();
      prepareNotificationIconAndPopup();
    }
  }
  else
    prepareNotificationIconAndPopup();
}

ext.onMessage.addListener(function (msg, sender, sendResponse)
{
  switch (msg.type)
  {
    case "get-selectors":
      var selectors = null;

      if (!isFrameWhitelisted(sender.tab, sender.frame, "DOCUMENT") &&
          !isFrameWhitelisted(sender.tab, sender.frame, "ELEMHIDE"))
      {
        var noStyleRules = false;
        var host = extractHostFromURL(sender.frame.url);
        for (var i = 0; i < noStyleRulesHosts.length; i++)
        {
          var noStyleHost = noStyleRulesHosts[i];
          if (host == noStyleHost || (host.length > noStyleHost.length &&
                                      host.substr(host.length - noStyleHost.length - 1) == "." + noStyleHost))
          {
            noStyleRules = true;
          }
        }
        selectors = ElemHide.getSelectorsForDomain(host, false);
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
      if (isFrameWhitelisted(sender.tab, sender.frame, "DOCUMENT"))
      {
        sendResponse(false);
        break;
      }

      var requestHost = extractHostFromURL(msg.url);
      var documentHost = extractHostFromURL(sender.frame.url);
      var thirdParty = isThirdParty(requestHost, documentHost);
      var filter = defaultMatcher.matchesAny(msg.url, msg.mediatype, documentHost, thirdParty);
      if (filter instanceof BlockingFilter)
      {
        var collapse = filter.collapse;
        if (collapse == null)
          collapse = Prefs.hidePlaceholders;
        sendResponse(collapse);
      }
      else
        sendResponse(false);
      break;
    case "get-domain-enabled-state":
      // Returns whether this domain is in the exclusion list.
      // The browser action popup asks us this.
      if(sender.tab)
      {
        sendResponse({enabled: !isWhitelisted(sender.tab.url)});
        return;
      }
      break;
    case "add-filters":
      if (msg.filters && msg.filters.length)
      {
        for (var i = 0; i < msg.filters.length; i++)
          FilterStorage.addFilter(Filter.fromText(msg.filters[i]));
      }
      break;
    case "add-subscription":
      openOptions(function(tab)
      {
        tab.sendMessage(msg);
      });
      break;
    case "add-key-exception":
      processKeyException(msg.token, sender.tab, sender.frame);
      break;
    case "forward":
      if (sender.tab)
      {
        sender.tab.sendMessage(msg.payload, sendResponse);
        // Return true to indicate that we want to call
        // sendResponse asynchronously
        return true;
      }
      break;
    default:
      sendResponse({});
      break;
  }
});

// Update icon if a tab changes location
ext.tabs.onLoading.addListener(function(tab)
{
  tab.sendMessage({type: "clickhide-deactivate"});
  refreshIconAndContextMenu(tab);
});

setTimeout(function()
{
  var notificationToShow = Notification.getNextToShow();
  if (notificationToShow)
    showNotification(notificationToShow);
}, 3 * 60 * 1000);
