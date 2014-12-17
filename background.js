/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
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
  this.SpecialSubscription = SpecialSubscription;
}
with(require("whitelisting"))
{
  this.isWhitelisted = isWhitelisted;
  this.isFrameWhitelisted = isFrameWhitelisted;
  this.processKey = processKey;
  this.getKey = getKey;
}
var FilterStorage = require("filterStorage").FilterStorage;
var ElemHide = require("elemHide").ElemHide;
var defaultMatcher = require("matcher").defaultMatcher;
var Prefs = require("prefs").Prefs;
var Synchronizer = require("synchronizer").Synchronizer;
var Utils = require("utils").Utils;
var Notification = require("notification").Notification;
var initAntiAdblockNotification = require("antiadblockInit").initAntiAdblockNotification;
var parseFilters = require("filterValidation").parseFilters;

// Some types cannot be distinguished
RegExpFilter.typeMap.OBJECT_SUBREQUEST = RegExpFilter.typeMap.OBJECT;
RegExpFilter.typeMap.MEDIA = RegExpFilter.typeMap.FONT = RegExpFilter.typeMap.OTHER;

// Chrome on Linux does not fully support chrome.notifications until version 35
// https://code.google.com/p/chromium/issues/detail?id=291485
var canUseChromeNotifications = require("info").platform == "chromium"
  && "notifications" in chrome
  && (navigator.platform.indexOf("Linux") == -1 || parseInt(require("info").applicationVersion, 10) > 34);

var seenDataCorruption = false;
var filterlistsReinitialized = false;
require("filterNotifier").FilterNotifier.addListener(function(action)
{
  if (action == "load")
  {
    var addonVersion = require("info").addonVersion;
    var prevVersion = ext.storage.currentVersion;

    // There are no filters stored so we need to reinitialize all filterlists
    if (!FilterStorage.firstRun && FilterStorage.subscriptions.length === 0)
    {
      filterlistsReinitialized = true;
      prevVersion = null;
    }

    if (prevVersion != addonVersion || FilterStorage.firstRun)
    {
      seenDataCorruption = prevVersion && FilterStorage.firstRun;
      ext.storage.currentVersion = addonVersion;
      addSubscription(prevVersion);
    }

    if (canUseChromeNotifications)
      initChromeNotifications();
    initAntiAdblockNotification();

    // The "Hide placeholders" option has been removed from the UI in 1.8.8.1285
    // So we reset the option for users updating from older versions.
    if (prevVersion && Services.vc.compare(prevVersion, "1.8.8.1285") < 0)
      Prefs.hidePlaceholders = true;
  }

  // update browser actions when whitelisting might have changed,
  // due to loading filters or saving filter changes
  if (action == "load" || action == "save")
    refreshIconAndContextMenuForAllPages();
});

// Special-case domains for which we cannot use style-based hiding rules.
// See http://crbug.com/68705.
var noStyleRulesHosts = ["mail.google.com", "mail.yahoo.com", "www.google.com"];

var htmlPages = new ext.PageMap();

function removeDeprecatedOptions()
{
  var deprecatedOptions = ["specialCaseYouTube", "experimental", "disableInlineTextAds"];
  deprecatedOptions.forEach(function(option)
  {
    if (option in ext.storage)
      delete ext.storage[option];
  });
}

// Remove deprecated options before we do anything else.
removeDeprecatedOptions();

var activeNotification = null;

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
  var whitelisted = isWhitelisted(page.url);

  var iconFilename;
  if (whitelisted && require("info").platform != "safari")
    // There is no grayscale version of the icon for whitelisted pages
    // when using Safari, because icons are grayscale already and icons
    // aren't per page in Safari.
    iconFilename = "icons/abp-$size-whitelisted.png";
  else
    iconFilename = "icons/abp-$size.png";

  page.browserAction.setIcon(iconFilename);
  iconAnimation.registerPage(page, iconFilename);

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

Prefs.addListener(function(name)
{
  if (name == "shouldShowBlockElementMenu")
    refreshIconAndContextMenuForAllPages();
});

// TODO: This hack should be removed, however currently
// the firstRun page still calls backgroundPage.openOptions()
openOptions = ext.showOptions;

function prepareNotificationIconAndPopup()
{
  var animateIcon = (activeNotification.type !== "question");
  activeNotification.onClicked = function()
  {
    if (animateIcon)
      iconAnimation.stop();
    notificationClosed();
  };
  if (animateIcon)
    iconAnimation.update(activeNotification.type);
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

function notificationButtonClick(buttonIndex)
{
  if (activeNotification.type === "question")
  {
    Notification.triggerQuestionListeners(activeNotification.id, buttonIndex === 0);
    Notification.markAsShown(activeNotification.id);
    activeNotification.onClicked();
  }
  else if (activeNotification.links && activeNotification.links[buttonIndex])
  {
    ext.windows.getLastFocused(function(win)
    {
      win.openTab(Utils.getDocLink(activeNotification.links[buttonIndex]));
    });
  }
}

function notificationClosed()
{
  activeNotification = null;
}

function imgToBase64(url, callback)
{
  var canvas = document.createElement("canvas"),
  ctx = canvas.getContext("2d"),
  img = new Image;
  img.src = url;
  img.onload = function()
  {
    canvas.height = img.height;
    canvas.width = img.width;
    ctx.drawImage(img, 0, 0);
    callback(canvas.toDataURL("image/png"));
    canvas = null;
  };
}

function initChromeNotifications()
{
  // Chrome hides notifications in notification center when clicked so we need to clear them
  function clearActiveNotification(notificationId)
  {
    if (activeNotification && activeNotification.type != "question" && !("links" in activeNotification))
      return;

    chrome.notifications.clear(notificationId, function(wasCleared)
    {
      if (wasCleared)
        notificationClosed();
    });
  }

  chrome.notifications.onButtonClicked.addListener(function(notificationId, buttonIndex)
  {
    notificationButtonClick(buttonIndex);
    clearActiveNotification(notificationId);
  });
  chrome.notifications.onClicked.addListener(clearActiveNotification);
  chrome.notifications.onClosed.addListener(notificationClosed);
}

function showNotification(notification)
{
  if (activeNotification && activeNotification.id === notification.id)
    return;

  activeNotification = notification;
  if (activeNotification.type === "critical" || activeNotification.type === "question")
  {
    var hasWebkitNotifications = typeof webkitNotifications !== "undefined";
    if (hasWebkitNotifications && "createHTMLNotification" in webkitNotifications)
    {
      var notification = webkitNotifications.createHTMLNotification("notification.html");
      notification.show();
      prepareNotificationIconAndPopup();
      return;
    }

    var texts = Notification.getLocalizedTexts(notification);
    var title = texts.title || "";
    var message = texts.message ? texts.message.replace(/<\/?(a|strong)>/g, "") : "";
    var iconUrl = ext.getURL("icons/abp-128.png");
    var hasLinks = activeNotification.links && activeNotification.links.length > 0;

    if (canUseChromeNotifications)
    {
      var opts = {
        type: "basic",
        title: title,
        message: message,
        buttons: [],
        priority: 2 // We use the highest priority to prevent the notification from closing automatically
      };
      if (activeNotification.type === "question")
      {
        opts.buttons.push({title: ext.i18n.getMessage("overlay_notification_button_yes")});
        opts.buttons.push({title: ext.i18n.getMessage("overlay_notification_button_no")});
      }
      else
      {
        var regex = /<a>(.*?)<\/a>/g;
        var plainMessage = texts.message || "";
        var match;
        while (match = regex.exec(plainMessage))
          opts.buttons.push({title: match[1]});
      }

      imgToBase64(iconUrl, function(iconData)
      {
        opts["iconUrl"] = iconData;
        chrome.notifications.create("", opts, function() {});
      });
    }
    else if (hasWebkitNotifications && "createNotification" in webkitNotifications && activeNotification.type !== "question")
    {
      if (hasLinks)
        message += " " + ext.i18n.getMessage("notification_without_buttons");

      imgToBase64(iconUrl, function(iconData)
      {
        var notification = webkitNotifications.createNotification(iconData, title, message);
        notification.show();
        notification.addEventListener("click", openNotificationLinks, false);
        notification.addEventListener("close", notificationClosed, false);
      });
    }
    else
    {
      var message = title + "\n" + message;
      if (hasLinks)
        message += "\n\n" + ext.i18n.getMessage("notification_with_buttons");

      var approved = confirm(message);
      if (activeNotification.type === "question")
        notificationButtonClick(approved ? 0 : 1);
      else if (approved)
        openNotificationLinks();
    }
  }
  prepareNotificationIconAndPopup();
}

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

      if (!isFrameWhitelisted(sender.page, sender.frame, "DOCUMENT") &&
          !isFrameWhitelisted(sender.page, sender.frame, "ELEMHIDE"))
      {
        var noStyleRules = false;
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
      if (isFrameWhitelisted(sender.page, sender.frame, "DOCUMENT"))
      {
        sendResponse(false);
        break;
      }

      var requestHost = extractHostFromURL(msg.url);
      var documentHost = extractHostFromFrame(sender.frame);
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
      if(sender.page)
      {
        sendResponse({enabled: !isWhitelisted(sender.page.url)});
        return;
      }
      break;
    case "add-filters":
      var filters;
      try
      {
        filters = parseFilters(msg.text);
      }
      catch (error)
      {
        sendResponse({status: "invalid", error: error});
        break;
      }

      for (var i = 0; i < filters.length; i++)
        FilterStorage.addFilter(filters[i]);

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
    case "forward":
      if (sender.page)
      {
        sender.page.sendMessage(msg.payload, sendResponse);
        // Return true to indicate that we want to call
        // sendResponse asynchronously
        return true;
      }
      break;
  }
});

// update icon when page changes location
ext.pages.onLoading.addListener(function(page)
{
  page.sendMessage({type: "clickhide-deactivate"});
  refreshIconAndContextMenu(page);
});

setTimeout(function()
{
  var notificationToShow = Notification.getNextToShow();
  if (notificationToShow)
    showNotification(notificationToShow);
}, 3 * 60 * 1000);
