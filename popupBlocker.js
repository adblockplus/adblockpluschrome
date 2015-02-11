/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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

if (require("info").platform == "chromium")
{
  var tabsLoading = {};

  chrome.webNavigation.onCreatedNavigationTarget.addListener(function(details)
  {
    var sourcePage = new ext.Page({id: details.sourceTabId});
    var sourceFrame = ext.getFrame(details.sourceTabId, details.sourceFrameId);

    if (!sourceFrame || isFrameWhitelisted(sourcePage, sourceFrame))
      return;

    var documentHost = extractHostFromFrame(sourceFrame);
    if (!documentHost)
      return;

    tabsLoading[details.tabId] = documentHost;
    checkPotentialPopup(details.tabId, details.url, documentHost);
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
  {
    if (!(tabId in tabsLoading))
    {
      // Not a pop-up we've previously seen
      return;
    }

    if ("url" in changeInfo)
      checkPotentialPopup(tabId, tab.url, tabsLoading[tabId]);

    if ("status" in changeInfo && changeInfo.status == "complete" && tab.url != "about:blank")
      delete tabsLoading[tabId];
  });
}

function checkPotentialPopup(tabId, url, documentHost)
{
  url = new URL(url || "about:blank");

  var filter = defaultMatcher.matchesAny(
    stringifyURL(url), "POPUP",
    documentHost, isThirdParty(url, documentHost)
  );

  if (filter instanceof BlockingFilter)
    chrome.tabs.remove(tabId);
}
