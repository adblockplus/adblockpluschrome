/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
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

/**
 * @fileOverview Provides usage stats
 */

let {Prefs} = require("prefs");
let {BlockingFilter} = require("filterClasses");
let {FilterNotifier} = require("filterNotifier");

let badgeColor = "#646464";
let statsPerTab = new TabMap(true);

/**
 * Get statistics for specified tab
 * @param  {String} key   field key
 * @param  {Number} tabId tab ID (leave undefined for total stats)
 * @return {Number}       field value
 */
let getStats = exports.getStats = function getStats(key, tab)
{
  if (!tab)
    return (key in Prefs.stats_total ? Prefs.stats_total[key] : 0);

  let tabStats = statsPerTab.get(tab);
  return tabStats ? tabStats.blocked : 0;
};

FilterNotifier.addListener(function(action, item, newValue, oldValue, tab)
{
  if (action != "filter.hitCount" || !tab)
    return;

  let blocked = item instanceof BlockingFilter;

  // Increment counts
  if (blocked)
  {
    if ("blocked" in Prefs.stats_total)
      Prefs.stats_total.blocked++;
    else
      Prefs.stats_total.blocked = 1;
    Prefs.stats_total = Prefs.stats_total;

    let tabStats = statsPerTab.get(tab);
    if (!tabStats)
    {
      tabStats = {};
      statsPerTab.set(tab, tabStats);
    }
    if ("blocked" in tabStats)
      tabStats.blocked++;
    else
      tabStats.blocked = 1;

    // Update number in icon
    if (Prefs.show_statsinicon)
    {
      tab.browserAction.setBadge({
        color: badgeColor,
        number: tabStats.blocked
      });
    }
  }
});

/**
 * Execute function for each tab in any window
 * @param {Function} func function to be executed
 */
function forEachTab(func)
{
  ext.windows.getAll(function(windows)
  {
    for each (let window in windows)
    {
      window.getAllTabs(function(tabs)
      {
        for (let i = 0; i < tabs.length; i++)
          func(tabs[i]);
      });
    }
  });
}

Prefs.addListener(function(name)
{
  if (name != "show_statsinicon")
    return;

  forEachTab(function(tab)
  {
    let badge = null;
    if (Prefs.show_statsinicon)
    {
      let tabStats = statsPerTab.get(tab);
      if (tabStats && "blocked" in tabStats)
      {
        badge = {
          color: badgeColor,
          number: tabStats.blocked
        };
      }
    }
    tab.browserAction.setBadge(badge);
  });
});
