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

const openOptionsPageAPISupported = (
  // Older versions of Edge do not support runtime.openOptionsPage
  // (tested version 38).
  "openOptionsPage" in browser.runtime &&
  // Newer versions of Edge (tested version 44) do support the API,
  // but it does not function correctly. The options page can be opened
  // repeatedly.
  info.platform != "edgehtml" &&
  // Some versions of Firefox for Android before version 57 do have a
  // runtime.openOptionsPage but it doesn't do anything.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1364945
  (info.application != "fennec" ||
   parseInt(info.applicationVersion, 10) >= 57)
);

function findOptionsPage()
{
  return browser.tabs.query({}).then(tabs =>
  {
    return new Promise((resolve, reject) =>
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
        resolve(optionsTab);
        return;
      }

      // Newly created tabs might have about:blank as their URL in Firefox
      // or undefined in Microsoft Edge rather than the final options page URL,
      // we need to wait for those to finish loading.
      let potentialOptionTabIds = new Set(
        tabs.filter(tab =>
              (tab.url == "about:blank" || !tab.url) && tab.status == "loading")
            .map(tab => tab.id)
      );
      if (potentialOptionTabIds.size == 0)
      {
        resolve();
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
            resolve(urlMatch ? tab : undefined);
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
        }
      };
      browser.tabs.onRemoved.addListener(removeListener);
    });
  });
}

function openOptionsPage()
{
  if (openOptionsPageAPISupported)
    return browser.runtime.openOptionsPage();

  // We use a relative URL here because of this Edge issue:
  // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/10276332
  return browser.tabs.create({url: optionsUrl});
}

function waitForOptionsPage(tab)
{
  return new Promise(resolve =>
  {
    function onMessage(message, port)
    {
      if (message.type != "app.listen")
        return;

      port.onMessage.removeListener(onMessage);
      resolve([tab, port]);
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

function focusOptionsPage(tab)
{
  if (openOptionsPageAPISupported)
    return browser.runtime.openOptionsPage();

  let focusTab = () => browser.tabs.update(tab.id, {active: true});

  if ("windows" in browser)
    return browser.windows.update(tab.windowId, {focused: true}).then(focusTab);

  // Firefox for Android before version 57 does not support
  // runtime.openOptionsPage, nor does it support the windows API.
  // Since there is effectively only one window on the mobile browser,
  // we can just bring the tab to focus instead.
  return focusTab();
}

let showOptions =
/**
 * Opens the options page.
 *
 * @param {function} callback
 */
exports.showOptions = callback =>
{
  findOptionsPage().then(existingTab =>
  {
    if (existingTab)
    {
      focusOptionsPage(existingTab).then(
        () => { callback && callback(new ext.Page(existingTab)); }
      );
    }
    else
    {
      openOptionsPage().then(findOptionsPage).then(waitForOptionsPage).then(
        ([newTab, port]) =>
        {
          callback && callback(new ext.Page(newTab), port);
        }
      );
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
  Promise.all([browser.browserAction.getPopup({}),
               browser.runtime.getBrowserInfo()]).then(
    ([popup, browserInfo]) =>
    {
      if (!popup && browserInfo.name != "Fennec")
        browser.browserAction.setPopup({popup: "popup.html"});
    }
  );
}

// On Firefox for Android, open the options page directly when the browser
// action is clicked.
browser.browserAction.onClicked.addListener(() =>
{
  browser.tabs.query({active: true, lastFocusedWindow: true}).then(
    ([tab]) =>
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
    }
  );
});
