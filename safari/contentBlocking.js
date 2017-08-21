/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2017 eyeo GmbH
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
let pendingContentBlockerUpdate = null;
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

function setContentBlocker()
{
  return new Promise((resolve, reject) =>
  {
    // Reset state and either fulfill or reject this promise.
    function completePromise(error)
    {
      lastSetContentBlockerError = error;
      contentBlockListDirty = false;

      if (error instanceof Error)
        reject(error);
      else
        resolve();
    }

    // When given the same rules as last time setContentBlocker will always
    // resolve with null (success), even when there was actually an
    // error. We cache the last result therefore so that we can provide a
    // consistent result and also to avoid wastefully regenerating an identical
    // blocklist.
    if (!contentBlockListDirty)
    {
      completePromise(lastSetContentBlockerError);
      return;
    }

    let contentBlockerList = new ContentBlockerList();
    for (let subscription of FilterStorage.subscriptions)
    {
      if (!subscription.disabled)
      {
        for (let filter of subscription.filters)
          contentBlockerList.addFilter(filter);
      }
    }

    contentBlockerList.generateRules().then(rules =>
    {
      safari.extension.setContentBlocker(
        // There is a strange bug in setContentBlocker for Safari 9 where if
        // both the callback parameter is provided and the rules aren't
        // converted to a JSON string it fails. Worse still it actually
        // performs the callback twice too, firstly with an empty string and
        // then with an Error: "Extension compilation failed: Failed to parse
        // the JSON String." To mitigate this we convert the rules to JSON here
        // and also ignore callback values of "". (Usually the callback is
        // performed with either null for success or an Error on failure.)
        // Bug #26322821 filed on bugreport.apple.com
        JSON.stringify(rules),
        function(error)
        {
          if (error == "")
            return;

          completePromise(error);
        }
      );
    })
    .catch(completePromise);
  });
}

function updateContentBlocker(isStartup, legacyAPISupported)
{
  // Another update can be requested while one is still in progress (e.g. the
  // user adds filter lists in quick succession). When this happens, save the
  // request and execute it later.
  if (afterContentBlockingFinished)
  {
    pendingContentBlockerUpdate = {
      params: Array.from(arguments),
      // Save the current dirty state so we can set it later before calling
      // this function again.
      setDirty: contentBlockListDirty
    };
    return;
  }

  afterContentBlockingFinished = setContentBlocker().then(() =>
  {
    if (!contentBlockingActive)
    {
      contentBlockingActive = true;
      clearBlockCounters();
    }
  },
  error =>
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
  })
  .then(() =>
  {
    afterContentBlockingFinished = null;

    // If there's another update pending, execute it now.
    if (pendingContentBlockerUpdate)
    {
      let {params, setDirty} = pendingContentBlockerUpdate;
      pendingContentBlockerUpdate = null;

      if (setDirty)
        contentBlockListDirty = true;

      updateContentBlocker.apply(null, params);
      return afterContentBlockingFinished;
    }

    return contentBlockingActive;
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
