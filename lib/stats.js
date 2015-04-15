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

/** @module stats */

let {Prefs} = require("prefs");
let {BlockingFilter} = require("filterClasses");
let {FilterNotifier} = require("filterNotifier");

let badgeColor = "#646464";
let statsPerPage = new ext.PageMap();

/**
 * Get statistics for specified page
 * @param  {String} key   field key
 * @param  {Page}   page  field page
 * @return {Number}       field value
 */
let getStats = exports.getStats = function getStats(key, page)
{
  if (!page)
    return (key in Prefs.stats_total ? Prefs.stats_total[key] : 0);

  let pageStats = statsPerPage.get(page);
  return pageStats ? pageStats.blocked : 0;
};

FilterNotifier.addListener(function(action, item, newValue, oldValue, page)
{
  if (action != "filter.hitCount" || !page)
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

    let pageStats = statsPerPage.get(page);
    if (!pageStats)
    {
      pageStats = {};
      statsPerPage.set(page, pageStats);
    }
    if ("blocked" in pageStats)
      pageStats.blocked++;
    else
      pageStats.blocked = 1;

    // Update number in icon
    if (Prefs.show_statsinicon)
    {
      page.browserAction.setBadge({
        color: badgeColor,
        number: pageStats.blocked
      });
    }
  }
});

Prefs.addListener(function(name)
{
  if (name != "show_statsinicon")
    return;

  ext.pages.query({}, function(pages)
  {
    for (var i = 0; i < pages.length; i++)
    {
      let page = pages[i];
      let badge = null;

      if (Prefs.show_statsinicon)
      {
        let pageStats = statsPerPage.get(page);
        if (pageStats && "blocked" in pageStats)
        {
          badge = {
            color: badgeColor,
            number: pageStats.blocked
          };
        }
      }

      page.browserAction.setBadge(badge);
    }
  });
});
