/*
 * This file is part of the Adblock Plus extension,
 * Copyright (C) 2006-2012 Eyeo GmbH
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

var backgroundPage = chrome.extension.getBackgroundPage();
var require = backgroundPage.require;
var Prefs = require("prefs").Prefs;
var Utils = require("utils").Utils;
var Filter = require("filterClasses").Filter;

function openSharePopup(url)
{
  var iframe = document.getElementById("share-popup");
  var glassPane = document.getElementById("glass-pane");
  var popupMessageReceived = false;

  var popupMessageListener = function(event)
  {
    var originFilter = Filter.fromText("||adblockplus.org^");
    if (!originFilter.matches(event.origin, "OTHER", null, null))
      return;

    iframe.width = event.data.width;
    iframe.height = event.data.height;
    popupMessageReceived = true;
    window.removeEventListener("message", popupMessageListener);
  };
  window.addEventListener("message", popupMessageListener, false);

  var popupLoadListener = function()
  {
    if (popupMessageReceived)
    {
      iframe.className = "visible";

      var popupCloseListener = function()
      {
        iframe.className = glassPane.className = "";
        document.removeEventListener("click", popupCloseListener);
      };
      document.addEventListener("click", popupCloseListener, false);
    }
    else
    {
      glassPane.className = "";
      window.removeEventListener("message", popupMessageListener);
    }

    iframe.removeEventListener("load", popupLoadListener);
  };
  iframe.addEventListener("load", popupLoadListener, false);

  iframe.src = url;
  glassPane.className = "visible";
}

function initSocialLinks(variant)
{
  var networks = ["twitter", "facebook"];
  networks.forEach(function(network)
  {
    var links = document.getElementsByClassName("share-" + network);
    for (var i = 0; i < links.length; i++)
    {
      links[i].addEventListener("click", function(e)
      {
        e.preventDefault();
        openSharePopup(getDocLink("share-" + network) + "&variant=" + variant);
      }, false);
    }
  });
}

function init()
{
  // Choose a share text variant randomly
  var variant = Math.floor(Math.random() * 2) + 1;
  document.documentElement.setAttribute("share-variant", variant);

  // Set up page title
  var titleId = (backgroundPage.isFirstRun ? "firstRun_title_install" : "firstRun_title_update");
  var pageTitle = i18n.getMessage(titleId);
  document.title = document.getElementById("title-main").textContent = pageTitle;

  // Only show changelog link on the update page
  if (backgroundPage.isFirstRun)
    document.getElementById("title-changelog").style.display = "none";

  // Show warning if data corruption was detected
  if (backgroundPage.seenDataCorruption)
    document.getElementById("dataCorruptionWarning").removeAttribute("hidden");

  // Set up URLs
  var versionId = chrome.app.getDetails().version.split(".").slice(0, 2).join("");
  setLinks("title-changelog", "https://adblockplus.org/releases/adblock-plus-" + versionId + "-for-google-chrome-released");
  setLinks("acceptableAdsExplanation", getDocLink("acceptable_ads", "criteria"),
      backgroundPage.openOptions);
  setLinks("dataCorruptionWarning", getDocLink("knownIssuesChrome_filterstorage"));

  initSocialLinks(variant);

  var donateLink = document.getElementById("share-donate");
  donateLink.href = getDocLink("donate") + "&variant=" + variant;
}
window.addEventListener("load", init, false);

function setLinks(id)
{
  var element = document.getElementById(id);
  if (!element)
    return;

  var links = element.getElementsByTagName("a");
  for (var i = 0; i < links.length; i++)
  {
    if (typeof arguments[i + 1] == "string")
    {
      links[i].href = arguments[i + 1];
      links[i].setAttribute("target", "_blank");
    }
    else if (typeof arguments[i + 1] == "function")
    {
      links[i].href = "javascript:void(0);";
      links[i].addEventListener("click", arguments[i + 1], false);
    }
  }
}

function getDocLink(page, anchor)
{
  return Prefs.documentation_link
              .replace(/%LINK%/g, page)
              .replace(/%LANG%/g, Utils.appLocale) + (anchor ? "#" + anchor : "");
}
