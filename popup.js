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

var backgroundPage = ext.backgroundPage.getWindow();
var require = backgroundPage.require;

var Filter = require("filterClasses").Filter;
var FilterStorage = require("filterStorage").FilterStorage;
var Prefs = require("prefs").Prefs;
var isPageWhitelisted = require("whitelisting").isPageWhitelisted;
var getDecodedHostname = require("url").getDecodedHostname;

var page = null;

function init()
{
  ext.pages.query({active: true, lastFocusedWindow: true}, function(pages)
  {
    page = pages[0];

    // Mark page as 'local' or 'nohtml' to hide non-relevant elements
    if (!page || (page.url.protocol != "http:" &&
                  page.url.protocol != "https:"))
      document.body.classList.add("local");
    else if (!backgroundPage.htmlPages.has(page))
      document.body.classList.add("nohtml");

    // Ask content script whether clickhide is active. If so, show cancel button.
    // If that isn't the case, ask background.html whether it has cached filters. If so,
    // ask the user whether she wants those filters.
    // Otherwise, we are in default state.
    if (page)
    {
      if (isPageWhitelisted(page))
        document.body.classList.add("disabled");

      page.sendMessage({type: "get-clickhide-state"}, function(response)
      {
        if (response && response.active)
          document.body.classList.add("clickhide-active");
      });
    }
  });

  // Attach event listeners
  document.getElementById("enabled").addEventListener("click", toggleEnabled, false);
  document.getElementById("clickhide").addEventListener("click", activateClickHide, false);
  document.getElementById("clickhide-cancel").addEventListener("click", cancelClickHide, false);
  document.getElementById("options").addEventListener("click", function()
  {
    ext.showOptions();
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
}
window.addEventListener("DOMContentLoaded", init, false);

function toggleEnabled()
{
  var disabled = document.body.classList.toggle("disabled");
  if (disabled)
  {
    var host = getDecodedHostname(page.url).replace(/^www\./, "");
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
    var filter = isPageWhitelisted(page);
    while (filter)
    {
      FilterStorage.removeFilter(filter);
      if (filter.subscriptions.length)
        filter.disabled = true;
      filter = isPageWhitelisted(page);
    }
  }
}

function activateClickHide()
{
  document.body.classList.add("clickhide-active");
  page.sendMessage({type: "clickhide-activate"});

  // Close the popup after a few seconds, so user doesn't have to
  activateClickHide.timeout = window.setTimeout(ext.closePopup, 5000);
}

function cancelClickHide()
{
  if (activateClickHide.timeout)
  {
    window.clearTimeout(activateClickHide.timeout);
    activateClickHide.timeout = null;
  }
  document.body.classList.remove("clickhide-active");
  page.sendMessage({type: "clickhide-deactivate"});
}

function toggleCollapse(event)
{
  var collapser = event.currentTarget;
  Prefs[collapser.dataset.option] = !Prefs[collapser.dataset.option];
  collapser.parentNode.classList.toggle("collapsed");
}
