var backgroundPage = chrome.extension.getBackgroundPage();
var require = backgroundPage.require;
var Prefs = require("prefs").Prefs;
var Utils = require("utils").Utils;

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

  // Set up URLs
  var versionId = chrome.app.getDetails().version.split(".").slice(0, 2).join("");
  setLinks("title-changelog", "https://adblockplus.org/releases/adblock-plus-" + versionId + "-for-google-chrome-released");
  setLinks("acceptableAdsExplanation", getDocLink("acceptable_ads", "criteria"),
      backgroundPage.openOptions);

  var facebookLinks = document.getElementsByClassName("share-facebook");
  for (var i = 0; i < facebookLinks.length; i++)
    facebookLinks[i].href = getDocLink("facebook") + "&variant=" + variant;

  var twitterLinks = document.getElementsByClassName("share-twitter");
  for (var i = 0; i < twitterLinks.length; i++)
    twitterLinks[i].href = getDocLink("twitter") + "&variant=" + variant;

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
