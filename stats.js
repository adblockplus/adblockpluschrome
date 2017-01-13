/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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
  var getBlockedPerPage = require("stats").getBlockedPerPage;
  var FilterNotifier = require("filterNotifier").FilterNotifier;
  var Prefs = require("prefs").Prefs;

  var currentPage;
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
    document.getElementById("share-box").addEventListener("click", share, false);
    var showIconNumber = document.getElementById("show-iconnumber");
    showIconNumber.setAttribute("aria-checked", Prefs.show_statsinicon);
    showIconNumber.addEventListener("click", toggleIconNumber, false);
    document.querySelector("label[for='show-iconnumber']").addEventListener("click", toggleIconNumber, false);

    // Update stats
    ext.pages.query({active: true, lastFocusedWindow: true}, function(pages)
    {
      currentPage = pages[0];
      updateStats();

      FilterNotifier.on("filter.hitCount", updateStats);

      document.getElementById("stats-container").removeAttribute("hidden");
    });
  }

  function onUnload()
  {
    FilterNotifier.off("filter.hitCount", updateStats);
  }

  function updateStats()
  {
    var statsPage = document.getElementById("stats-page");
    var blockedPage = getBlockedPerPage(currentPage).toLocaleString();
    i18n.setElementText(statsPage, "stats_label_page", [blockedPage]);

    var statsTotal = document.getElementById("stats-total");
    var blockedTotal = Prefs.blocked_total.toLocaleString();
    i18n.setElementText(statsTotal, "stats_label_total", [blockedTotal]);
  }

  function share(ev)
  {
    // Easter Egg
    var blocked = Prefs.blocked_total;
    if (blocked <= 9000 || blocked >= 10000)
      blocked = blocked.toLocaleString();
    else
      blocked = i18n.getMessage("stats_over", (9000).toLocaleString());

    ext.pages.open(createShareLink(ev.target.dataset.social, blocked));
  }

  function toggleIconNumber()
  {
    Prefs.show_statsinicon = !Prefs.show_statsinicon;
    document.getElementById("show-iconnumber").setAttribute("aria-checked", Prefs.show_statsinicon);
  }

  document.addEventListener("DOMContentLoaded", onLoad, false);
  window.addEventListener("unload", onUnload, false);
})();
