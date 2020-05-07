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

/** @module browserAction */

"use strict";

let changesByTabId = new Map();
let badgeStateByPage = new ext.PageMap();

function setBadgeState(tabId, key, value)
{
  let page = new ext.Page(tabId);
  let badgeState = badgeStateByPage.get(page);

  if (!badgeState)
  {
    badgeState = {
      hiddenState: "visible",
      text: ""
    };
    badgeStateByPage.set(page, badgeState);
  }

  // We need to ignore any text changes while we're hiding the badge
  if (!(badgeState.hiddenState == "hiding" && key == "text"))
    badgeState[key] = value;

  return badgeState;
}

function applyChanges(tabId, changes)
{
  return Promise.all(Object.keys(changes).map(change =>
  {
    // Firefox for Android displays the browser action not as an icon but
    // as a menu item. There is no icon, but such an option may be added
    // in the future.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1331746
    if (change == "iconPath" && "setIcon" in browser.browserAction)
    {
      return browser.browserAction.setIcon({
        tabId,
        path: {
          16: changes.iconPath.replace("$size", "16"),
          20: changes.iconPath.replace("$size", "20"),
          32: changes.iconPath.replace("$size", "32"),
          40: changes.iconPath.replace("$size", "40")
        }
      });
    }

    if (change == "iconImageData" && "setIcon" in browser.browserAction)
    {
      return browser.browserAction.setIcon({
        tabId,
        imageData: changes.iconImageData
      });
    }

    // There is no badge on Firefox for Android; the browser action is
    // simply a menu item.
    if (change == "badgeText" && "setBadgeText" in browser.browserAction)
    {
      // Remember changes to the badge text but don't apply them yet
      // as long as the badge is hidden.
      let badgeState = setBadgeState(tabId, "text", changes.badgeText);
      if (badgeState.hiddenState == "hidden")
        return;

      return browser.browserAction.setBadgeText({
        tabId,
        text: changes.badgeText
      });
    }

    // There is no badge on Firefox for Android; the browser action is
    // simply a menu item.
    if (change == "badgeColor" &&
        "setBadgeBackgroundColor" in browser.browserAction)
    {
      return browser.browserAction.setBadgeBackgroundColor({
        tabId,
        color: changes.badgeColor
      });
    }
  }));
}

function addChange(tabId, name, value)
{
  let changes = changesByTabId.get(tabId);
  if (!changes)
  {
    changes = {};
    changesByTabId.set(tabId, changes);
  }
  changes[name] = value;

  function cleanup()
  {
    changesByTabId.delete(tabId);
  }

  function onReplaced(addedTabId, removedTabId)
  {
    if (addedTabId == tabId)
    {
      browser.tabs.onReplaced.removeListener(onReplaced);
      applyChanges(tabId, changes)
        .then(cleanup)
        .catch(cleanup);
    }
  }

  if (!browser.tabs.onReplaced.hasListener(onReplaced))
  {
    applyChanges(tabId, changes)
      .then(cleanup)
      .catch(() =>
      {
        // If the tab is prerendered, browser.browserAction.set* fails
        // and we have to delay our changes until the currently visible tab
        // is replaced with the prerendered tab.
        browser.tabs.onReplaced.addListener(onReplaced);
      });
  }
}

/**
 * Sets icon badge for given tab.
 *
 * @param {number} tabId
 * @param {object} badge
 * @param {string} badge.color
 * @param {string} badge.number
 */
exports.setBadge = (tabId, badge) =>
{
  if (!badge)
  {
    addChange(tabId, "badgeText", "");
  }
  else
  {
    if ("number" in badge)
      addChange(tabId, "badgeText", badge.number.toString());

    if ("color" in badge)
      addChange(tabId, "badgeColor", badge.color);
  }
};

/**
 * Sets icon image for given tab using image data.
 *
 * @param  {number} tabId
 * @param  {object} imageData
 */
exports.setIconImageData = (tabId, imageData) =>
{
  addChange(tabId, "iconImageData", imageData);
};

/**
 * Sets icon image for given tab using file path.
 *
 * @param  {number} tabId
 * @param  {string} path - expected to include "$size" placeholder
 */
exports.setIconPath = (tabId, path) =>
{
  addChange(tabId, "iconPath", path);
};

/**
 * Toggles icon badge for given tab.
 *
 * @param  {number} tabId
 * @param  {boolean} shouldHide
 */
exports.toggleBadge = (tabId, shouldHide) =>
{
  if (shouldHide)
  {
    setBadgeState(tabId, "hiddenState", "hiding");
    addChange(tabId, "badgeText", "");
    setBadgeState(tabId, "hiddenState", "hidden");
  }
  else
  {
    let badgeState = setBadgeState(tabId, "hiddenState", "visible");
    addChange(tabId, "badgeText", badgeState.text);
  }
};
