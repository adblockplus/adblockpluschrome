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

/** @module notificationHelper */

"use strict";

const {startIconAnimation, stopIconAnimation} = require("./icon");
const {Utils} = require("./utils");
const {Notification: NotificationStorage} =
  require("../adblockpluscore/lib/notification");
const {initAntiAdblockNotification} =
  require("../adblockplusui/lib/antiadblockInit");
const {Prefs} = require("./prefs");
const {showOptions} = require("./options");

let activeNotification = null;
let activeButtons = null;
let defaultDisplayMethods = ["popup"];
let displayMethods = Object.create(null);
displayMethods.critical = ["icon", "notification", "popup"];
displayMethods.question = ["notification"];
displayMethods.normal = ["notification"];
displayMethods.relentless = ["notification"];
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
      title: browser.i18n.getMessage("overlay_notification_button_yes")
    });
    buttons.push({
      type: "question",
      title: browser.i18n.getMessage("overlay_notification_button_no")
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
          title: browser.i18n.getMessage("notification_open_all")
        }
      ];
    }
    if (!["critical", "relentless"].includes(notificationType))
    {
      buttons.push({
        type: "configure",
        title: browser.i18n.getMessage("notification_configure")
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
      browser.tabs.create({url: Utils.getDocLink(link)});
  }
}

function notificationButtonClick(buttonIndex)
{
  if (!(activeButtons && buttonIndex in activeButtons))
    return;

  switch (activeButtons[buttonIndex].type)
  {
    case "link":
      browser.tabs.create({
        url: Utils.getDocLink(activeNotification.links[buttonIndex])
      });
      break;
    case "open-all":
      openNotificationLinks();
      break;
    case "configure":
      Prefs.notifications_showui = true;
      showOptions((page, port) =>
      {
        port.postMessage({
          type: "app.respond",
          action: "focusSection",
          args: ["notifications"]
        });
      });
      break;
    case "question":
      NotificationStorage.triggerQuestionListeners(activeNotification.id,
                                                   buttonIndex == 0);
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
  function onNotificationClick(notificationId, buttonIndex)
  {
    if (typeof buttonIndex != "undefined")
      notificationButtonClick(buttonIndex);

    // Chrome hides notifications in the notification center when clicked,
    // so we need to clear them.
    browser.notifications.clear(notificationId);
  }
  browser.notifications.onButtonClicked.addListener(onNotificationClick);
  browser.notifications.onClicked.addListener(onNotificationClick);

  browser.notifications.onClosed.addListener(notificationClicked);
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
    let message = (texts.message || "").replace(/<\/?(a|strong)>/g, "");
    let iconUrl = browser.extension.getURL("icons/detailed/abp-128.png");
    let linkCount = (activeNotification.links || []).length;

    if ("notifications" in browser)
    {
      activeButtons = getNotificationButtons(activeNotification.type,
                                             texts.message);
      let notificationOptions = {
        type: "basic",
        title,
        iconUrl,
        message,
        buttons: activeButtons.map(button => ({title: button.title})),
        // We use the highest priority to prevent the notification
        // from closing automatically.
        priority: 2
      };

      // Firefox and Opera don't support buttons. Firefox throws synchronously,
      // while Opera gives an asynchronous error. Wrapping the promise like
      // this, turns the synchronous error on Firefox into a promise rejection.
      new Promise(resolve =>
      {
        resolve(browser.notifications.create(notificationOptions));
      }).catch(() =>
      {
        // Without buttons, showing notifications of the type "question" is
        // pointless. For other notifications, retry with the buttons removed.
        if (activeNotification.type != "question")
        {
          delete notificationOptions.buttons;
          browser.notifications.create(notificationOptions);
        }
      });
    }
    else if ("Notification" in window && activeNotification.type != "question")
    {
      if (linkCount > 0)
      {
        message += " " + browser.i18n.getMessage(
          "notification_without_buttons"
        );
      }

      let widget = new Notification(
        title,
        {
          lang: Utils.appLocale,
          dir: Utils.readingDirection,
          body: message,
          icon: iconUrl
        }
      );

      widget.addEventListener("click", openNotificationLinks);
      widget.addEventListener("close", notificationClosed);
    }
    else
    {
      message = title + "\n" + message;
      if (linkCount > 0)
      {
        message += "\n\n" + browser.i18n.getMessage(
          "notification_with_buttons"
        );
      }

      let approved = confirm(message);
      if (activeNotification.type == "question")
        notificationButtonClick(approved ? 0 : 1);
      else if (approved)
        openNotificationLinks();
    }
  }
  prepareNotificationIconAndPopup();

  if (notification.type !== "question")
    NotificationStorage.markAsShown(notification.id);
}

/**
 * Initializes the notification system.
 */
exports.initNotifications = () =>
{
  if ("notifications" in browser)
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
  return methods.includes(method);
};

let notificationClicked =
/**
 * Tidies up after a notification was clicked.
 */
exports.notificationClicked = () =>
{
  if (activeNotification)
    activeNotification.onClicked();
};

ext.pages.onLoading.addListener(page =>
{
  NotificationStorage.showNext(page.url.href);
});

NotificationStorage.addShowListener(showNotification);
