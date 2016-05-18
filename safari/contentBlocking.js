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

/** @module contentBlocking */

"use strict";

let {Prefs} = require("prefs");
let {ContentBlockerList} = require("abp2blocklist");
let {FilterStorage} = require("filterStorage");
let {FilterNotifier} = require("filterNotifier");
let {port} = require("messaging");

let contentBlockingSupported = "setContentBlocker" in safari.extension;
let legacyAPISupported = new Promise(resolve =>
{
  function onLegacyAPISupported(msg, sender)
  {
    port.off("safari.legacyAPISupported", onLegacyAPISupported);
    resolve(msg.legacyAPISupported);
  }
  port.on("safari.legacyAPISupported", onLegacyAPISupported);
});
let contentBlockingActive = false;
let afterContentBlockingFinished = null;
let contentBlockListDirty = true;
let lastSetContentBlockerError;

function clearBlockCounters()
{
  ext.pages.query({}, pages =>
  {
    for (let page of pages)
      page.browserAction.setBadge();
  });
}

function setContentBlocker(callback)
{
  // When given the same rules as last time setContentBlocker will always give
  // null (success) to the callback, even when there was actually an error. We
  // cache the last result therefore so that we can provide a consistent result
  // and also to avoid wastefully regenerating an identical blocklist.
  if (!contentBlockListDirty)
  {
    callback(lastSetContentBlockerError);
    return;
  }

  let contentBlockerList = new ContentBlockerList();
  for (let subscription of FilterStorage.subscriptions)
    if (!subscription.disabled)
      for (let filter of subscription.filters)
        contentBlockerList.addFilter(filter);

  contentBlockListDirty = false;
  safari.extension.setContentBlocker(
    // There is a strange bug in setContentBlocker for Safari 9 where if both
    // the callback parameter is provided and the rules aren't converted to a
    // JSON string it fails. Worse still it actually performs the callback twice
    // too, firstly with an empty string and then with an Error:
    //   "Extension compilation failed: Failed to parse the JSON String."
    // To mitigate this we convert the rules to JSON here and also ignore
    // callback values of "". (Usually the callback is performed with either
    // null for success or an Error on failure.)
    // Bug #26322821 filed on bugreport.apple.com
    JSON.stringify(contentBlockerList.generateRules()),
    function(error)
    {
      if (error == "")
        return;

      lastSetContentBlockerError = error;
      callback(error);
    }
  );
}

function updateContentBlocker(isStartup, legacyAPISupported)
{
  afterContentBlockingFinished = new Promise(resolve =>
  {
    setContentBlocker(error =>
    {
      if (error instanceof Error)
      {
        let suppressErrorMessage = false;

        // If the content blocking API fails the first time it's used the
        // legacy blocking API (if available) won't have been disabled.
        if (!contentBlockingActive && legacyAPISupported)
        {
          Prefs.safariContentBlocker = false;
          // If content blocking failed on startup and we're switching back to
          // the legacy API anyway we don't need to show an error message.
          if (isStartup)
            suppressErrorMessage = true;
        }

        if (!suppressErrorMessage)
          alert(error.message);
      }
      else if (!contentBlockingActive)
      {
        contentBlockingActive = true;
        clearBlockCounters();
      }

      resolve(contentBlockingActive);
      afterContentBlockingFinished = null;
    });
  });
}

if (contentBlockingSupported)
{
  Promise.all([Prefs.untilLoaded,
               FilterNotifier.once("load"),
               legacyAPISupported]).then(resolvedValues =>
  {
    let legacyAPISupported = resolvedValues[2];
    if (!legacyAPISupported)
      Prefs.safariContentBlocker = true;

    if (Prefs.safariContentBlocker)
      updateContentBlocker(true, legacyAPISupported);

    Prefs.on("safariContentBlocker", () =>
    {
      if (!contentBlockingActive && Prefs.safariContentBlocker)
        updateContentBlocker(false, legacyAPISupported);
    });

    FilterNotifier.on("filter.behaviorChanged", () =>
    {
      contentBlockListDirty = true;
      if (contentBlockingActive)
        updateContentBlocker(false, legacyAPISupported);
    });
  });
}

port.on("safari.contentBlockingActive", (msg, sender) =>
{
  if (!contentBlockingActive && afterContentBlockingFinished)
    return afterContentBlockingFinished;
  return contentBlockingActive;
});
