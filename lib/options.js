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

/** @module options */

"use strict";

const {getDecodedHostname} = require("url");
const {checkWhitelisted} = require("whitelisting");
const {port} = require("messaging");
const info = require("info");

const optionsUrl = "options.html";

function findOptionsTab(callback)
{
  chrome.tabs.query({}, tabs =>
  {
    // We find a tab ourselves because Edge has a bug when quering tabs with
    // extension URL protocol:
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8094141/
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8604703/
    // Firefox won't let us query for moz-extension:// pages either, though
    // starting with Firefox 56 an extension can query for its own URLs:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1271354
    let fullOptionsUrl = ext.getURL(optionsUrl);
    callback(tabs.find(element => element.url == fullOptionsUrl));
  });
}

function returnShowOptionsCall(optionsTab, callback)
{
  if (!callback)
    return;

  if (optionsTab)
  {
    callback(new ext.Page(optionsTab));
  }
  else
  {
    // If we don't already have an options page, it means we've just opened
    // one, in which case we must find the tab, wait for it to be ready, and
    // then return the call.
    findOptionsTab(tab =>
    {
      if (!tab)
        return;

      function onMessage(message, sender)
      {
        if (message.type == "app.listen" &&
            sender.page && sender.page.id == tab.id)
        {
          port.off("app.listen", onMessage);
          callback(new ext.Page(tab));
        }
      }

      port.on("app.listen", onMessage);
    });
  }
}

let showOptions =
/**
 * Opens the options page.
 *
 * @param {function} callback
 */
exports.showOptions = callback =>
{
  findOptionsTab(optionsTab =>
  {
    // Edge does not yet support runtime.openOptionsPage (tested version 38)
    if ("openOptionsPage" in chrome.runtime &&
        // Some versions of Firefox for Android before version 57 do have a
        // runtime.openOptionsPage but it doesn't do anything.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1364945
        (info.application != "fennec" ||
         parseInt(info.applicationVersion, 10) >= 57))
    {
      chrome.runtime.openOptionsPage(() =>
      {
        returnShowOptionsCall(optionsTab, callback);
      });
    }
    else if (optionsTab)
    {
      // Firefox for Android before version 57 does not support
      // runtime.openOptionsPage, nor does it support the windows API.
      // Since there is effectively only one window on the mobile browser,
      // there's no need to bring it into focus.
      if ("windows" in chrome)
        chrome.windows.update(optionsTab.windowId, {focused: true});

      chrome.tabs.update(optionsTab.id, {active: true});

      returnShowOptionsCall(optionsTab, callback);
    }
    else
    {
      // We use a relative URL here because of this Edge issue:
      // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/10276332
      chrome.tabs.create({url: optionsUrl}, () =>
      {
        returnShowOptionsCall(optionsTab, callback);
      });
    }
  });
};

// On Firefox for Android, open the options page directly when the browser
// action is clicked.
chrome.browserAction.onClicked.addListener(() =>
{
  chrome.tabs.query({active: true, lastFocusedWindow: true}, ([tab]) =>
  {
    let currentPage = new ext.Page(tab);

    showOptions(optionsPage =>
    {
      if (!/^https?:$/.test(currentPage.url.protocol))
        return;

      optionsPage.sendMessage({
        type: "app.respond",
        action: "showPageOptions",
        args: [
          {
            host: getDecodedHostname(currentPage.url).replace(/^www\./, ""),
            whitelisted: !!checkWhitelisted(currentPage)
          }
        ]
      });
    });
  });
});
