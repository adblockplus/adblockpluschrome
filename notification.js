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

/* global setPref */

"use strict";

function getDocLinks(notification)
{
  if (!notification.links)
    return Promise.resolve([]);

  return Promise.all(
    notification.links.map(link =>
    {
      return new Promise((resolve, reject) =>
      {
        chrome.runtime.sendMessage({
          type: "app.get",
          what: "doclink",
          link
        }, resolve);
      });
    })
  );
}

function insertMessage(element, text, links)
{
  let match = /^(.*?)<(a|strong)>(.*?)<\/\2>(.*)$/.exec(text);
  if (!match)
  {
    element.appendChild(document.createTextNode(text));
    return;
  }

  let before = match[1];
  let tagName = match[2];
  let value = match[3];
  let after = match[4];

  insertMessage(element, before, links);

  let newElement = document.createElement(tagName);
  if (tagName == "a" && links && links.length)
    newElement.href = links.shift();
  insertMessage(newElement, value, links);
  element.appendChild(newElement);

  insertMessage(element, after, links);
}

window.addEventListener("load", () =>
{
  chrome.runtime.sendMessage({
    type: "notifications.get",
    displayMethod: "popup"
  }, notification =>
  {
    if (!notification)
      return;

    let titleElement = document.getElementById("notification-title");
    let messageElement = document.getElementById("notification-message");

    titleElement.textContent = notification.texts.title;

    getDocLinks(notification).then(docLinks =>
    {
      insertMessage(messageElement, notification.texts.message, docLinks);

      messageElement.addEventListener("click", event =>
      {
        let link = event.target;
        while (link && link != messageElement && link.localName != "a")
          link = link.parentNode;
        if (!link)
          return;
        event.preventDefault();
        event.stopPropagation();
        chrome.tabs.create({url: link.href});
      });
    });

    let notificationElement = document.getElementById("notification");
    notificationElement.className = notification.type;
    notificationElement.hidden = false;
    notificationElement.addEventListener("click", event =>
    {
      if (event.target.id == "notification-close")
        notificationElement.classList.add("closing");
      else if (event.target.id == "notification-optout" ||
               event.target.id == "notification-hide")
      {
        if (event.target.id == "notification-optout")
          setPref("notifications_ignoredcategories", true);

        notificationElement.hidden = true;
        notification.onClicked();
      }
    }, true);
  });
}, false);
