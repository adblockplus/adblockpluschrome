/*
 * This file is part of the Adblock Plus extension,
 * Copyright (C) 2006-2012 Eyeo GmbH
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

var tabsLoading = {};

chrome.tabs.onCreated.addListener(function(tab)
{
  if (!("openerTabId" in tab))
  {
    // This isn't a pop-up
    return;
  }

  if (isFrameWhitelisted(tab.openerTabId, 0))
    return;

  var openerUrl = getFrameUrl(tab.openerTabId, 0);
  if (!openerUrl)
  {
    // We don't know the opener tab
    return;
  }
  tabsLoading[tab.id] = openerUrl;

  checkPotentialPopup(tab, openerUrl);
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
{
  if (!(tabId in tabsLoading))
  {
    // Not a pop-up we've previously seen
    return;
  }

  if ("url" in changeInfo)
    checkPotentialPopup(tab, tabsLoading[tabId]);

  if ("status" in changeInfo && changeInfo.status == "complete")
    delete tabsLoading[tabId];
});


function checkPotentialPopup(tab)
{
  var requestHost = extractHostFromURL(tab.url);
  var documentHost = extractHostFromURL(tabsLoading[tab.id]);
  var thirdParty = isThirdParty(requestHost, documentHost);
  var filter = defaultMatcher.matchesAny(tab.url || "about:blank", "POPUP", documentHost, thirdParty);
  if (filter instanceof BlockingFilter)
    chrome.tabs.remove(tab.id);
}
