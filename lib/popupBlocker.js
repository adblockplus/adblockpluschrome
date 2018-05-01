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

/** @module popupBlocker */

"use strict";

const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {BlockingFilter,
       RegExpFilter} = require("../adblockpluscore/lib/filterClasses");
const {stringifyURL, isThirdParty, extractHostFromFrame} = require("./url");
const {checkWhitelisted} = require("./whitelisting");
const {logRequest} = require("./devtools");

let loadingPopups = new Map();

function forgetPopup(tabId)
{
  loadingPopups.delete(tabId);

  if (loadingPopups.size == 0)
  {
    browser.webRequest.onBeforeRequest.removeListener(onPopupURLChanged);
    browser.webNavigation.onCommitted.removeListener(onPopupURLChanged);
    browser.webNavigation.onCompleted.removeListener(onCompleted);
    browser.tabs.onRemoved.removeListener(forgetPopup);
  }
}

function checkPotentialPopup(tabId, popup)
{
  let urlObj = new URL(popup.url || "about:blank");
  let urlString = stringifyURL(urlObj);
  let documentHost = extractHostFromFrame(popup.sourceFrame);
  let thirdParty = isThirdParty(urlObj, documentHost);

  let specificOnly = !!checkWhitelisted(
    popup.sourcePage, popup.sourceFrame, null,
    RegExpFilter.typeMap.GENERICBLOCK
  );

  let filter = defaultMatcher.matchesAny(
    urlString, RegExpFilter.typeMap.POPUP,
    documentHost, thirdParty, null, specificOnly
  );

  if (filter instanceof BlockingFilter)
    browser.tabs.remove(tabId);

  logRequest(
    [popup.sourcePage.id], urlString, "POPUP",
    documentHost, thirdParty, null,
    specificOnly, filter
  );
}

function onPopupURLChanged(details)
{
  // Ignore frames inside the popup window.
  if (details.frameId != 0)
    return;

  let popup = loadingPopups.get(details.tabId);
  if (popup)
  {
    popup.url = details.url;
    if (popup.sourceFrame)
      checkPotentialPopup(details.tabId, popup);
  }
}

function onCompleted(details)
{
  if (details.frameId == 0 && details.url != "about:blank")
    forgetPopup(details.tabId);
}

// Versions of Firefox before 54 do not support
// webNavigation.onCreatedNavigationTarget
// https://bugzilla.mozilla.org/show_bug.cgi?id=1190687
if ("onCreatedNavigationTarget" in browser.webNavigation)
{
  browser.webNavigation.onCreatedNavigationTarget.addListener(details =>
  {
    if (loadingPopups.size == 0)
    {
      browser.webRequest.onBeforeRequest.addListener(
        onPopupURLChanged,
        {
          urls: ["http://*/*", "https://*/*"],
          types: ["main_frame"]
        }
      );
      browser.webNavigation.onCommitted.addListener(onPopupURLChanged);
      browser.webNavigation.onCompleted.addListener(onCompleted);
      browser.tabs.onRemoved.addListener(forgetPopup);
    }

    let popup = {
      url: details.url,
      sourcePage: new ext.Page({id: details.sourceTabId}),
      sourceFrame: null
    };

    loadingPopups.set(details.tabId, popup);

    let frame = ext.getFrame(details.sourceTabId, details.sourceFrameId);

    if (checkWhitelisted(popup.sourcePage, frame))
    {
      forgetPopup(details.tabId);
    }
    else
    {
      popup.sourceFrame = frame;
      checkPotentialPopup(details.tabId, popup);
    }
  });
}
