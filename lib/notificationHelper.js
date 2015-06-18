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

/** @module notificationHelper */

let {startIconAnimation, stopIconAnimation} = require("icon");
let {Utils} = require("utils");
let {Notification: NotificationStorage} = require("notification");
let {stringifyURL} = require("url");
let {initAntiAdblockNotification} = require("antiadblockInit");

let activeNotification = null;

// Chrome on Linux does not fully support chrome.notifications until version 35
// https://code.google.com/p/chromium/issues/detail?id=291485
let canUseChromeNotifications = (function()
{
  let info = require("info");
  if (info.platform == "chromium" && "notifications" in chrome)
  {
    if (navigator.platform.indexOf("Linux") == -1)
      return true;
    if (Services.vc.compare(info.applicationVersion, "35") >= 0)
      return true;
  }
  return false;
})();

function prepareNotificationIconAndPopup()
{
  let animateIcon = (activeNotification.type != "question");
  activeNotification.onClicked = function()
  {
    if (animateIcon)
      stopIconAnimation();
    notificationClosed();
  };
  if (animateIcon)
    startIconAnimation(activeNotification.type);
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
  if (activeNotification.type == "question")
  {
    NotificationStorage.triggerQuestionListeners(activeNotification.id, buttonIndex == 0);
    NotificationStorage.markAsShown(activeNotification.id);
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
  let canvas = document.createElement("canvas"),
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
  if (activeNotification && activeNotification.id == notification.id)
    return;

  activeNotification = notification;
  if (activeNotification.type == "critical" || activeNotification.type == "question")
  {
    let texts = NotificationStorage.getLocalizedTexts(notification);
    let title = texts.title || "";
    let message = texts.message ? texts.message.replace(/<\/?(a|strong)>/g, "") : "";
    let iconUrl = ext.getURL("icons/detailed/abp-128.png");
    let hasLinks = activeNotification.links && activeNotification.links.length > 0;

    if (canUseChromeNotifications)
    {
      let opts = {
        type: "basic",
        title: title,
        message: message,
        buttons: [],
        priority: 2 // We use the highest priority to prevent the notification from closing automatically
      };
      if (activeNotification.type == "question")
      {
        opts.buttons.push({title: ext.i18n.getMessage("overlay_notification_button_yes")});
        opts.buttons.push({title: ext.i18n.getMessage("overlay_notification_button_no")});
      }
      else
      {
        let regex = /<a>(.*?)<\/a>/g;
        let plainMessage = texts.message || "";
        let match;
        while (match = regex.exec(plainMessage))
          opts.buttons.push({title: match[1]});
      }

      imgToBase64(iconUrl, function(iconData)
      {
        opts["iconUrl"] = iconData;
        chrome.notifications.create("", opts, function() {});
      });
    }
    else if ("Notification" in window && activeNotification.type != "question")
    {
      if (hasLinks)
        message += " " + ext.i18n.getMessage("notification_without_buttons");

      imgToBase64(iconUrl, function(iconData)
      {
        let notification = new Notification(
          title,
          {
            lang: Utils.appLocale,
            dir: ext.i18n.getMessage("@@bidi_dir"),
            body: message,
            icon: iconData
          }
        );

        notification.addEventListener("click", openNotificationLinks);
        notification.addEventListener("close", notificationClosed);
      });
    }
    else
    {
      let message = title + "\n" + message;
      if (hasLinks)
        message += "\n\n" + ext.i18n.getMessage("notification_with_buttons");

      let approved = confirm(message);
      if (activeNotification.type == "question")
        notificationButtonClick(approved ? 0 : 1);
      else if (approved)
        openNotificationLinks();
    }
  }
  prepareNotificationIconAndPopup();
};

/**
 * Initializes the notification system.
 */
exports.initNotifications = function()
{
  if (canUseChromeNotifications)
    initChromeNotifications();
  initAntiAdblockNotification();
};

/**
 * Shows the next notification (if any) for the supplied URL.
 *
 * @param {URL} url URL to match notifications to
 */
exports.showNextNotificationForUrl = function(url)
{
  NotificationStorage.showNext(stringifyURL(url));
};

/**
 * Gets the active notification to be shown if any.
 *
 * @return {?object}
 */
exports.getActiveNotification = function()
{
  return activeNotification;
};

NotificationStorage.addShowListener(showNotification);
