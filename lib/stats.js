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
let blockedPerPage = new ext.PageMap();

/**
 * Gets the number of requests blocked on the given page.
 *
 * @param  {Page} page
 * @return {Number}
 */
exports.getBlockedPerPage = function(page)
{
  return blockedPerPage.get(page) || 0;
};

FilterNotifier.addListener(function(action, item, newValue, oldValue, page)
{
  if (action != "filter.hitCount" || !page)
    return;

  if (!(item instanceof BlockingFilter))
    return;

  Prefs.blocked_total++;

  let blocked = blockedPerPage.get(page) || 0;
  blockedPerPage.set(page, ++blocked);

  // Update number in icon
  if (Prefs.show_statsinicon)
  {
    page.browserAction.setBadge({
      color: badgeColor,
      number: blocked
    });
  }
});

Prefs.onChanged.addListener(function(name)
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
        let blocked = blockedPerPage.get(page);
        if (blocked)
        {
          badge = {
            color: badgeColor,
            number: blocked
          };
        }
      }

      page.browserAction.setBadge(badge);
    }
  });
});
