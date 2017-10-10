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

/* global getPref, togglePref */

"use strict";

(function()
{
  let currentTab;
  const shareURL = "https://adblockplus.org/";

  let messageMark = {};
  let shareLinks = {
    facebook: ["https://www.facebook.com/dialog/feed", {
      app_id: "475542399197328",
      link: shareURL,
      redirect_uri: "https://www.facebook.com/",
      ref: "adcounter",
      name: messageMark,
      actions: JSON.stringify([
        {
          name: chrome.i18n.getMessage("stats_share_download"),
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
    let url = shareLinks[network][0];
    let params = shareLinks[network][1];

    let querystring = [];
    for (let key in params)
    {
      let value = params[key];
      if (value == messageMark)
        value = chrome.i18n.getMessage("stats_share_message", blockedCount);
      querystring.push(
        encodeURIComponent(key) + "=" + encodeURIComponent(value)
      );
    }
    return url + "?" + querystring.join("&");
  }

  function onLoad()
  {
    document.getElementById("share-box").addEventListener("click", share,
                                                          false);
    let showIconNumber = document.getElementById("show-iconnumber");
    getPref("show_statsinicon", showStatsInIcon =>
    {
      showIconNumber.setAttribute("aria-checked", showStatsInIcon);
    });
    showIconNumber.addEventListener("click", toggleIconNumber, false);
    document.querySelector("label[for='show-iconnumber']").addEventListener(
      "click", toggleIconNumber, false
    );

    // Update stats
    chrome.tabs.query({active: true, lastFocusedWindow: true}, tabs =>
    {
      currentTab = tabs[0];
      updateStats();

      document.getElementById("stats-container").removeAttribute("hidden");
    });
  }

  function updateStats()
  {
    let statsPage = document.getElementById("stats-page");
    chrome.runtime.sendMessage({
      type: "stats.getBlockedPerPage",
      tab: currentTab
    },
    blockedPage =>
    {
      ext.i18n.setElementText(statsPage, "stats_label_page",
                              [blockedPage.toLocaleString()]);
    });

    let statsTotal = document.getElementById("stats-total");
    getPref("blocked_total", blockedTotal =>
    {
      ext.i18n.setElementText(statsTotal, "stats_label_total",
                              [blockedTotal.toLocaleString()]);
    });
  }

  function share(ev)
  {
    getPref("blocked_total", blockedTotal =>
    {
      // Easter Egg
      if (blockedTotal <= 9000 || blockedTotal >= 10000)
      {
        blockedTotal = blockedTotal.toLocaleString();
      }
      else
      {
        blockedTotal = chrome.i18n.getMessage("stats_over",
                                              (9000).toLocaleString());
      }

      chrome.tabs.create({
        url: createShareLink(ev.target.dataset.social, blockedTotal)
      });
    });
  }

  function toggleIconNumber()
  {
    togglePref("show_statsinicon", showStatsInIcon =>
    {
      document.getElementById("show-iconnumber").setAttribute(
        "aria-checked", showStatsInIcon
      );
    });
  }

  document.addEventListener("DOMContentLoaded", onLoad, false);
}());
