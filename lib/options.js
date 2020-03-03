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
const {port} = require("./messaging");

const optionsUrl = browser.runtime.getManifest().options_ui.page;

const openOptionsPageAPISupported = (
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
      // Firefox won't let us query for moz-extension:// pages, though
      // starting with Firefox 56 an extension can query for its own URLs:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1271354
      let fullOptionsUrl = browser.extension.getURL(optionsUrl);
      let optionsTab = tabs.find(tab => tab.url == fullOptionsUrl);
      if (optionsTab)
      {
        resolve(optionsTab);
        return;
      }

      // Newly created tabs might have about:blank as their URL in Firefox or
      // an empty string on Chrome (80) rather than the final options page URL,
      // we need to wait for those to finish loading.
      let potentialOptionTabIds = new Set(
        tabs.filter(tab => (tab.url == "about:blank" || !tab.url) &&
                           tab.status == "loading").map(tab => tab.id)
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
            resolve(urlMatch ? tab : null);
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
  return browser.tabs.create({url: optionsUrl});
}

function waitForOptionsPage(tab)
{
  return new Promise(resolve =>
  {
    function onMessage(message, optionsPort)
    {
      if (message.type != "app.listen")
        return;

      optionsPort.onMessage.removeListener(onMessage);
      resolve([tab, optionsPort]);
    }

    function onConnect(optionsPort)
    {
      if (optionsPort.name != "ui" || optionsPort.sender.tab.id != tab.id)
        return;

      browser.runtime.onConnect.removeListener(onConnect);
      optionsPort.onMessage.addListener(onMessage);
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
 * Opens the options page, or switches to its existing tab.
 * @returns {Promise.<Array>}
 *   Promise resolving to an Array containg the tab Object of the options page
 *   and sometimes (when the page was just opened) a messaging port.
 */
exports.showOptions = () =>
{
  return findOptionsPage().then(existingTab =>
  {
    if (existingTab)
      return focusOptionsPage(existingTab).then(() => existingTab);

    return openOptionsPage().then(findOptionsPage).then(waitForOptionsPage);
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

      showOptions().then(([optionsTab, optionsPort]) =>
      {
        if (!/^https?:$/.test(currentPage.url.protocol))
          return;

        optionsPort.postMessage({
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

/**
 * Opens the options page in a new tab and waits for it to load, or switches to
 * the existing tab if the options page is already open.
 *
 * @event "options.open"
 * @returns {object} optionsTab
 */
port.on("options.open", (message, sender) =>
  showOptions().then(([optionsTab, optionsPort]) => optionsTab)
);
