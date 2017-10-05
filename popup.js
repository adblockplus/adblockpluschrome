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

"use strict";

let tab = null;

function getPref(key, callback)
{
  chrome.runtime.sendMessage({type: "prefs.get", key}, callback);
}

function togglePref(key, callback)
{
  chrome.runtime.sendMessage({type: "prefs.toggle", key}, callback);
}

function isPageWhitelisted(callback)
{
  chrome.runtime.sendMessage({type: "filters.isWhitelisted", tab}, callback);
}

function whenPageReady()
{
  return new Promise(resolve =>
  {
    function onMessage(message, sender)
    {
      if (message.type == "composer.ready" && sender.page &&
          sender.page.id == tab.id)
      {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve();
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);

    chrome.runtime.sendMessage({
      type: "composer.isPageReady",
      pageId: tab.id
    },
    ready =>
    {
      if (ready)
      {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve();
      }
    });
  });
}

function onLoad()
{
  chrome.tabs.query({active: true, lastFocusedWindow: true}, tabs =>
  {
    if (tabs.length > 0)
      tab = {id: tabs[0].id, url: tabs[0].url};

    let urlProtocol = tab && tab.url && new URL(tab.url).protocol;

    // Mark page as 'local' to hide non-relevant elements
    if (urlProtocol != "http:" && urlProtocol != "https:")
    {
      document.body.classList.add("local");
      document.body.classList.remove("nohtml");
    }
    else
    {
      whenPageReady().then(() =>
      {
        document.body.classList.remove("nohtml");
      });
    }

    // Ask content script whether clickhide is active. If so, show
    // cancel button.  If that isn't the case, ask background.html
    // whether it has cached filters. If so, ask the user whether she
    // wants those filters. Otherwise, we are in default state.
    if (tab)
    {
      isPageWhitelisted(whitelisted =>
      {
        if (whitelisted)
          document.body.classList.add("disabled");
      });

      chrome.tabs.sendMessage(tab.id, {
        type: "composer.content.getState"
      },
      response =>
      {
        if (response && response.active)
          document.body.classList.add("clickhide-active");
      });
    }
  });

  document.getElementById("enabled").addEventListener(
    "click", toggleEnabled, false
  );
  document.getElementById("clickhide").addEventListener(
    "click", activateClickHide, false
  );
  document.getElementById("clickhide-cancel").addEventListener(
    "click", cancelClickHide, false
  );
  document.getElementById("options").addEventListener("click", () =>
  {
    chrome.runtime.sendMessage({type: "app.open", what: "options"});
    window.close();
  }, false);

  // Set up collapsing of menu items
  for (let collapser of document.getElementsByClassName("collapse"))
  {
    collapser.addEventListener("click", toggleCollapse, false);
    getPref(collapser.dataset.option, value =>
    {
      if (value)
      {
        document.getElementById(
          collapser.dataset.collapsible
        ).classList.remove("collapsed");
      }
    });
  }
}

function toggleEnabled()
{
  let disabled = document.body.classList.toggle("disabled");
  chrome.runtime.sendMessage({
    type: disabled ? "filters.whitelist" : "filters.unwhitelist",
    tab
  });
}

function activateClickHide()
{
  document.body.classList.add("clickhide-active");
  chrome.tabs.sendMessage(tab.id, {
    type: "composer.content.startPickingElement"
  });

  // Close the popup after a few seconds, so user doesn't have to
  activateClickHide.timeout = window.setTimeout(window.close, 5000);
}

function cancelClickHide()
{
  if (activateClickHide.timeout)
  {
    window.clearTimeout(activateClickHide.timeout);
    activateClickHide.timeout = null;
  }
  document.body.classList.remove("clickhide-active");
  chrome.tabs.sendMessage(tab.id, {type: "composer.content.finished"});
}

function toggleCollapse(event)
{
  let collapser = event.currentTarget;
  let collapsible = document.getElementById(collapser.dataset.collapsible);
  collapsible.classList.toggle("collapsed");
  togglePref(collapser.dataset.option);
}

document.addEventListener("DOMContentLoaded", onLoad, false);
