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

const {checkWhitelisted} = require("./whitelisting");
const info = require("info");

const manifest = browser.runtime.getManifest();
const optionsUrl = manifest.options_page || manifest.options_ui.page;

function findOptionsTab(callback)
{
  browser.tabs.query({}, tabs =>
  {
    // We find a tab ourselves because Edge has a bug when quering tabs with
    // extension URL protocol:
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8094141/
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8604703/
    // Firefox won't let us query for moz-extension:// pages either, though
    // starting with Firefox 56 an extension can query for its own URLs:
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1271354
    let fullOptionsUrl = browser.extension.getURL(optionsUrl);
    let optionsTab = tabs.find(tab => tab.url == fullOptionsUrl);
    if (optionsTab)
    {
      callback(optionsTab);
      return;
    }

    // Newly created tabs might have about:blank as their URL in Firefox rather
    // than the final options page URL, we need to wait for those to finish
    // loading.
    let potentialOptionTabIds = new Set(
      tabs.filter(tab => tab.url == "about:blank" && tab.status == "loading")
          .map(tab => tab.id)
    );
    if (potentialOptionTabIds.size == 0)
    {
      callback();
      return;
    }
    let removeListener;
    let updateListener = (tabId, changeInfo, tab) =>
    {
      if (potentialOptionTabIds.has(tabId) &&
          changeInfo.status == "complete")
      {
        potentialOptionTabIds.delete(tabId);
        let urlMatch = tab.url == fullOptionsUrl;
        if (urlMatch || potentialOptionTabIds.size == 0)
        {
          browser.tabs.onUpdated.removeListener(updateListener);
          browser.tabs.onRemoved.removeListener(removeListener);
          callback(urlMatch ? tab : undefined);
        }
      }
    };
    browser.tabs.onUpdated.addListener(updateListener);
    removeListener = removedTabId =>
    {
      potentialOptionTabIds.delete(removedTabId);
      if (potentialOptionTabIds.size == 0)
      {
        browser.tabs.onUpdated.removeListener(updateListener);
        browser.tabs.onRemoved.removeListener(removeListener);
        callback();
      }
    };
    browser.tabs.onRemoved.addListener(removeListener);
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

      function onMessage(message, port)
      {
        if (message.type != "app.listen")
          return;

        port.onMessage.removeListener(onMessage);
        callback(new ext.Page(tab), port);
      }

      function onConnect(port)
      {
        if (port.name != "ui" || port.sender.tab.id != tab.id)
          return;

        browser.runtime.onConnect.removeListener(onConnect);
        port.onMessage.addListener(onMessage);
      }

      browser.runtime.onConnect.addListener(onConnect);
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
    if ("openOptionsPage" in browser.runtime &&
        // Some versions of Firefox for Android before version 57 do have a
        // runtime.openOptionsPage but it doesn't do anything.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1364945
        (info.application != "fennec" ||
         parseInt(info.applicationVersion, 10) >= 57))
    {
      browser.runtime.openOptionsPage(() =>
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
      if ("windows" in browser)
        browser.windows.update(optionsTab.windowId, {focused: true});

      browser.tabs.update(optionsTab.id, {active: true});

      returnShowOptionsCall(optionsTab, callback);
    }
    else
    {
      // We use a relative URL here because of this Edge issue:
      // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/10276332
      browser.tabs.create({url: optionsUrl}, () =>
      {
        returnShowOptionsCall(optionsTab, callback);
      });
    }
  });
};

// We need to clear the popup URL on Firefox for Android in order for the
// options page to open instead of the bubble. Unfortunately there's a bug[1]
// which prevents us from doing that, so we must avoid setting the URL on
// Firefox from the manifest at all, instead setting it here only for
// non-mobile.
// [1] - https://bugzilla.mozilla.org/show_bug.cgi?id=1414613
if ("getBrowserInfo" in browser.runtime)
{
  browser.runtime.getBrowserInfo().then(browserInfo =>
  {
    if (browserInfo.name == "Fennec")
      browser.browserAction.setPopup({popup: ""});
  });
}

// On Firefox for Android, open the options page directly when the browser
// action is clicked.
browser.browserAction.onClicked.addListener(() =>
{
  browser.tabs.query({active: true, lastFocusedWindow: true}, ([tab]) =>
  {
    let currentPage = new ext.Page(tab);

    showOptions((optionsPage, port) =>
    {
      if (!/^https?:$/.test(currentPage.url.protocol))
        return;

      port.postMessage({
        type: "app.respond",
        action: "showPageOptions",
        args: [
          {
            host: currentPage.url.hostname.replace(/^www\./, ""),
            whitelisted: !!checkWhitelisted(currentPage)
          }
        ]
      });
    });
  });
});
