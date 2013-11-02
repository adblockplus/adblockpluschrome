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

(function()
{
  var backgroundPage = ext.backgroundPage.getWindow();
  var require = backgroundPage.require;
  var getStats = require("stats").getStats;
  var FilterNotifier = require("filterNotifier").FilterNotifier;
  
  var currentTab;
  var shareURL = "https://adblockplus.org/";
  
  var messageMark = {};
  var shareLinks = {
    facebook: ["https://www.facebook.com/dialog/feed", {
      app_id: "475542399197328",
      link: shareURL,
      redirect_uri: "https://www.facebook.com/",
      ref: "adcounter",
      name: messageMark,
      actions: JSON.stringify([
        {
          name: i18n.getMessage("stats_share_download"),
          link: shareURL
        }
      ])
    }],
    gplus: ["https://plus.google.com/share", {
      url: shareURL
    }],
    twitter: ["https://twitter.com/intent/tweet", {
      text: messageMark,
      url: shareURL,
      via: "AdblockPlus"
    }]
  };
  
  function createShareLink(network, blockedCount)
  {
    var url = shareLinks[network][0];
    var params = shareLinks[network][1];
    
    var querystring = [];
    for (var key in params)
    {
      var value = params[key];
      if (value == messageMark)
        value = i18n.getMessage("stats_share_message", blockedCount);
      querystring.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
    return url + "?" + querystring.join("&");
  }
  
  function onLoad()
  {
    document.getElementById("shareBox").addEventListener("click", share, false);
    document.getElementById("share").addEventListener("click", toggleShareBox, false);
    
    // Update stats
    ext.windows.getLastFocused(function(win)
    {
      win.getActiveTab(function(tab)
      {
        currentTab = tab;
        updateStats();

        FilterNotifier.addListener(onNotify);

        document.getElementById("statsContainer").removeAttribute("hidden");
      });
    });
  }
  
  function onUnload()
  {
    FilterNotifier.removeListener(onNotify);
  }
  
  function onNotify(action, item)
  {
    if (action == "filter.hitCount")
      updateStats();
  }
  
  function updateStats()
  {
    var statsPage = document.getElementById("statsPage");
    var blockedPage = getStats("blocked", currentTab).toLocaleString();
    i18n.setElementText(statsPage, "stats_label_page", [blockedPage]);
    
    var statsTotal = document.getElementById("statsTotal");
    var blockedTotal = getStats("blocked").toLocaleString();
    i18n.setElementText(statsTotal, "stats_label_total", [blockedTotal]);
  }
  
  function toggleShareBox(ev)
  {
    var shareBox = document.getElementById("shareBox");
    shareBox.hidden = !shareBox.hidden;
  }
  
  function share(ev)
  {
    // Easter Egg
    var blocked = getStats("blocked");
    if (blocked <= 9000 || blocked >= 10000)
      blocked = blocked.toLocaleString();
    else
      blocked = i18n.getMessage("stats_over", (9000).toLocaleString());
    
    var url = createShareLink(ev.target.dataset.social, blocked);
    ext.windows.getLastFocused(function(win) { win.openTab(url); });
  }
  
  document.addEventListener("DOMContentLoaded", onLoad, false);
  window.addEventListener("unload", onUnload, false);
})();
