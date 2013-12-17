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

var backgroundPage = ext.backgroundPage.getWindow();
var imports = ["require", "isWhitelisted", "extractHostFromURL", "refreshIconAndContextMenu", "openOptions"];
for (var i = 0; i < imports.length; i++)
  window[imports[i]] = backgroundPage[imports[i]];

var Filter = require("filterClasses").Filter;
var FilterStorage = require("filterStorage").FilterStorage;
var Prefs = require("prefs").Prefs;

var tab = null;

function init()
{
  // Mark page as local to hide non-relevant elements
  ext.windows.getLastFocused(function(win)
  {
    win.getActiveTab(function(tab)
    {
      if (!/^https?:\/\//.exec(tab.url))
        document.body.classList.add("local");
    });
  });
  
  // Attach event listeners
  document.getElementById("enabled").addEventListener("click", toggleEnabled, false);
  document.getElementById("clickhide").addEventListener("click", activateClickHide, false);
  document.getElementById("clickhide-cancel").addEventListener("click", cancelClickHide, false);
  document.getElementById("options").addEventListener("click", function()
  {
    openOptions();
  }, false);
  
  // Set up collapsing of menu items
  var collapsers = document.getElementsByClassName("collapse");
  for (var i = 0; i < collapsers.length; i++)
  {
    var collapser = collapsers[i];
    collapser.addEventListener("click", toggleCollapse, false);
    if (!Prefs[collapser.dataset.option])
      document.getElementById(collapser.dataset.collapsable).classList.add("collapsed");
  }
  
  // Ask content script whether clickhide is active. If so, show cancel button.
  // If that isn't the case, ask background.html whether it has cached filters. If so,
  // ask the user whether she wants those filters.
  // Otherwise, we are in default state.
  ext.windows.getLastFocused(function(win)
  {
    win.getActiveTab(function(t)
    {
      tab = t;
      document.getElementById("enabled").classList.toggle("off", isWhitelisted(tab.url));
      
      tab.sendMessage({type: "get-clickhide-state"}, function(response)
      {
        document.body.classList.toggle("clickhide-active", response.active);
      });
    });
  });
}
window.addEventListener("DOMContentLoaded", init, false);

function toggleEnabled()
{
  var enabledButton = document.getElementById("enabled")
  var disabled = enabledButton.classList.toggle("off");
  if (disabled)
  {
    var host = extractHostFromURL(tab.url).replace(/^www\./, "");
    var filter = Filter.fromText("@@||" + host + "^$document");
    if (filter.subscriptions.length && filter.disabled)
      filter.disabled = false;
    else
    {
      filter.disabled = false;
      FilterStorage.addFilter(filter);
    }
  }
  else
  {
    // Remove any exception rules applying to this URL
    var filter = isWhitelisted(tab.url);
    while (filter)
    {
      FilterStorage.removeFilter(filter);
      if (filter.subscriptions.length)
        filter.disabled = true;
      filter = isWhitelisted(tab.url);
    }
  }
  
  refreshIconAndContextMenu(tab);
}

function activateClickHide()
{
  document.body.classList.add("clickhide-active");
  tab.sendMessage({type: "clickhide-activate"});
  
  // Close the popup after a few seconds, so user doesn't have to
  activateClickHide.timeout = window.setTimeout(window.close, 5000);
}

function cancelClickHide()
{
  if (activateClickHide.timeout)
  {
    window.clearTimeout(activateClickHide.timeout);
    activateClickHide.timeout = null;
  }
  document.body.classList.remove("clickhide-active");
  tab.sendMessage({type: "clickhide-deactivate"});
}

function toggleCollapse(event)
{
  var collapser = event.currentTarget;
  Prefs[collapser.dataset.option] = !Prefs[collapser.dataset.option];
  collapser.parentNode.classList.toggle("collapsed");
}
