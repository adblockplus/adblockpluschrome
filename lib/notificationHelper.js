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

/** @module notificationHelper */

"use strict";

const {startIconAnimation, stopIconAnimation} = require("icon");
const {Utils} = require("utils");
const {Notification: NotificationStorage} = require("notification");
const {stringifyURL} = require("url");
const {initAntiAdblockNotification} = require("antiadblockInit");
const {Prefs} = require("prefs");

let activeNotification = null;
let activeButtons = null;
let defaultDisplayMethods = ["popup"];
let displayMethods = Object.create(null);
displayMethods.critical = ["icon", "notification", "popup"];
displayMethods.question = ["notification"];
displayMethods.normal = ["notification"];
displayMethods.information = ["icon", "popup"];

function prepareNotificationIconAndPopup()
{
  let animateIcon = shouldDisplay("icon", activeNotification.type);
  activeNotification.onClicked = () =>
  {
    if (animateIcon)
      stopIconAnimation();
    notificationClosed();
  };
  if (animateIcon)
    startIconAnimation(activeNotification.type);
}

function getNotificationButtons(notificationType, message)
{
  let buttons = [];
  if (notificationType == "question")
  {
    buttons.push({
      type: "question",
      title: ext.i18n.getMessage("overlay_notification_button_yes")
    });
    buttons.push({
      type: "question",
      title: ext.i18n.getMessage("overlay_notification_button_no")
    });
  }
  else
  {
    let regex = /<a>(.*?)<\/a>/g;
    let match;
    while (match = regex.exec(message))
    {
      buttons.push({
        type: "link",
        title: match[1]
      });
    }

    // Chrome only allows two notification buttons so we need to fall back
    // to a single button to open all links if there are more than two.
    let maxButtons = (notificationType == "critical") ? 2 : 1;
    if (buttons.length > maxButtons)
    {
      buttons = [
        {
          type: "open-all",
          title: ext.i18n.getMessage("notification_open_all")
        }
      ];
    }
    if (notificationType != "critical")
    {
      buttons.push({
        type: "configure",
        title: ext.i18n.getMessage("notification_configure")
      });
    }
  }

  return buttons;
}

function openNotificationLinks()
{
  if (activeNotification.links)
  {
    for (let link of activeNotification.links)
      ext.pages.open(Utils.getDocLink(link));
  }
}

function notificationButtonClick(buttonIndex)
{
  if (!(activeButtons && buttonIndex in activeButtons))
    return;

  switch (activeButtons[buttonIndex].type)
  {
    case "link":
      ext.pages.open(Utils.getDocLink(activeNotification.links[buttonIndex]));
      break;
    case "open-all":
      openNotificationLinks();
      break;
    case "configure":
      Prefs.notifications_showui = true;
      ext.showOptions(page =>
      {
        page.sendMessage({
          type: "app.respond",
          action: "focusSection",
          args: ["notifications"]
        });
      });
      break;
    case "question":
      NotificationStorage.triggerQuestionListeners(activeNotification.id, buttonIndex == 0);
      NotificationStorage.markAsShown(activeNotification.id);
      activeNotification.onClicked();
      break;
  }
}

function notificationClosed()
{
  activeNotification = null;
}

function initChromeNotifications()
{
  // Chrome hides notifications in notification center when clicked so we need to clear them
  function clearActiveNotification(notificationId)
  {
    if (activeNotification && activeNotification.type != "question" && !("links" in activeNotification))
      return;

    chrome.notifications.clear(notificationId, wasCleared =>
    {
      if (wasCleared)
        notificationClosed();
    });
  }

  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) =>
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
  if (shouldDisplay("notification", activeNotification.type))
  {
    let texts = NotificationStorage.getLocalizedTexts(notification);
    let title = texts.title || "";
    let message = texts.message ? texts.message.replace(/<\/?(a|strong)>/g, "") : "";
    let iconUrl = ext.getURL("icons/detailed/abp-128.png");
    let linkCount = (activeNotification.links || []).length;

    if ("notifications" in chrome)
    {
      activeButtons = getNotificationButtons(activeNotification.type, texts.message);
      chrome.notifications.create("", {
        type: "basic",
        title: title,
        iconUrl: iconUrl,
        message: message,
        buttons: activeButtons.map(button => ({title: button.title})),
        priority: 2 // We use the highest priority to prevent the notification from closing automatically
      });
    }
    else if ("Notification" in window && activeNotification.type != "question")
    {
      if (linkCount > 0)
        message += " " + ext.i18n.getMessage("notification_without_buttons");

      let notification = new Notification(
        title,
        {
          lang: Utils.appLocale,
          dir: ext.i18n.getMessage("@@bidi_dir"),
          body: message,
          icon: iconUrl
        }
      );

      notification.addEventListener("click", openNotificationLinks);
      notification.addEventListener("close", notificationClosed);
    }
    else
    {
      let message = title + "\n" + message;
      if (linkCount > 0)
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
exports.initNotifications = () =>
{
  if ("notifications" in chrome)
    initChromeNotifications();
  initAntiAdblockNotification();
};

/**
 * Gets the active notification to be shown if any.
 *
 * @return {?object}
 */
exports.getActiveNotification = () => activeNotification;

let shouldDisplay =
/**
 * Determines whether a given display method should be used for a
 * specified notification type.
 *
 * @param {string} method Display method: icon, notification or popup
 * @param {string} notificationType
 * @return {boolean}
 */
exports.shouldDisplay = (method, notificationType) =>
{
  let methods = displayMethods[notificationType] || defaultDisplayMethods;
  return methods.indexOf(method) > -1;
};

ext.pages.onLoading.addListener(page =>
{
  NotificationStorage.showNext(stringifyURL(page.url));
});

NotificationStorage.addShowListener(showNotification);
