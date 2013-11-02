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

  let frameData = getFrameData(tab, 0);
  return (frameData && key in frameData ? frameData[key] : 0);
};

FilterNotifier.addListener(function(action, item, newValue, oldValue, tab)
{
  if (action != "filter.hitCount")
    return;
  
  var blocked = item instanceof BlockingFilter;
  
  // Increment counts
  if (blocked)
  {
    if ("blocked" in Prefs.stats_total)
      Prefs.stats_total.blocked++;
    else
      Prefs.stats_total.blocked = 1;
    Prefs.stats_total = Prefs.stats_total;
    
    let frameData = getFrameData(tab, 0);
    if (frameData)
    {
      if ("blocked" in frameData)
        frameData.blocked++;
      else
        frameData.blocked = 1;
    }
  }
});
