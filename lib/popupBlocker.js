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
const {BlockingFilter} = require("../adblockpluscore/lib/filterClasses");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");
const {parseURL} = require("../adblockpluscore/lib/url");
const {extractHostFromFrame} = require("./url");
const {checkAllowlisted} = require("./allowlisting");
const {logRequest} = require("./hitLogger");
const info = require("info");

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
  let url = popup.url || "about:blank";
  let documentHost = extractHostFromFrame(popup.sourceFrame);

  let specificOnly = !!checkAllowlisted(
    popup.sourcePage, popup.sourceFrame, null,
    contentTypes.GENERICBLOCK
  );

  let filter = defaultMatcher.match(
    parseURL(url), contentTypes.POPUP,
    documentHost, null, specificOnly
  );

  if (filter instanceof BlockingFilter)
    browser.tabs.remove(tabId).catch(() => {});

  logRequest(
    [popup.sourcePage.id],
    {url, type: "POPUP", docDomain: documentHost, specificOnly},
    filter
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

function onPopupCreated(tabId, url, sourceTabId, sourceFrameId)
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
    url,
    sourcePage: new ext.Page({id: sourceTabId}),
    sourceFrame: null
  };

  loadingPopups.set(tabId, popup);

  let frame = ext.getFrame(sourceTabId, sourceFrameId);

  if (checkAllowlisted(popup.sourcePage, frame))
  {
    forgetPopup(tabId);
  }
  else
  {
    popup.sourceFrame = frame;
    checkPotentialPopup(tabId, popup);
  }
}

// Versions of Firefox before 54 do not support
// webNavigation.onCreatedNavigationTarget
// https://bugzilla.mozilla.org/show_bug.cgi?id=1190687
if ("onCreatedNavigationTarget" in browser.webNavigation)
{
  browser.webNavigation.onCreatedNavigationTarget.addListener(details =>
  {
    onPopupCreated(details.tabId, details.url, details.sourceTabId,
                   details.sourceFrameId);
  });
}

// On Firefox, clicking on a <a target="_blank" rel="noopener"> link doesn't
// emit the webNavigation.onCreatedNavigationTarget event (and since Firefox 79,
// "noopener" is implied by default). But on Chrome, opening a new empty tab
// emits the tabs.onCreated event with openerTabId set. So the code below would
// cause new tabs created by the user to be considered popups too, on Chrome.
if (info.platform == "gecko")
{
  browser.tabs.onCreated.addListener(details =>
  {
    // We only care about tabs created by another tab.
    // e.g. clicking on a link with target=_blank.
    if (typeof details.openerTabId == "undefined")
      return;

    // onCreated doesn't provide the frameId of the opener.
    onPopupCreated(details.id, details.url, details.openerTabId, 0);
  });
}
