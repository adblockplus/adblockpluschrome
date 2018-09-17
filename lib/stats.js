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

/** @module stats */

"use strict";

const {Prefs} = require("./prefs");
const {BlockingFilter} = require("../adblockpluscore/lib/filterClasses");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {port} = require("./messaging");

const badgeColor = "#646464";
let blockedPerPage = new ext.PageMap();

let getBlockedPerPage =
/**
 * Gets the number of requests blocked on the given page.
 *
 * @param  {Page} page
 * @return {Number}
 */
exports.getBlockedPerPage = page => blockedPerPage.get(page) || 0;

function updateBadge(page, blockedCount)
{
  if (Prefs.show_statsinicon)
  {
    page.browserAction.setBadge(blockedCount && {
      color: badgeColor,
      number: blockedCount
    });
  }
}

// Once nagivation for the tab has been committed to (e.g. it's no longer
// being prerendered) we clear its badge, or if some requests were already
// blocked beforehand we display those on the badge now.
browser.webNavigation.onCommitted.addListener(details =>
{
  if (details.frameId == 0)
  {
    let page = new ext.Page({id: details.tabId});
    let blocked = blockedPerPage.get(page);

    updateBadge(page, blocked);
  }
});

filterNotifier.on("filter.hitCount", (filter, newValue, oldValue, tabIds) =>
{
  if (!(filter instanceof BlockingFilter))
    return;

  for (let tabId of tabIds)
  {
    let page = new ext.Page({id: tabId});
    let blocked = blockedPerPage.get(page) || 0;

    blockedPerPage.set(page, ++blocked);
    updateBadge(page, blocked);
  }

  Prefs.blocked_total++;
});

Prefs.on("show_statsinicon", () =>
{
  browser.tabs.query({}, tabs =>
  {
    for (let tab of tabs)
    {
      let page = new ext.Page(tab);

      if (Prefs.show_statsinicon)
        updateBadge(page, blockedPerPage.get(page));
      else
        page.browserAction.setBadge(null);
    }
  });
});

port.on("stats.getBlockedPerPage",
        message => getBlockedPerPage(new ext.Page(message.tab)));
