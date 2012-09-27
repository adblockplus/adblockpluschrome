var backgroundPage = chrome.extension.getBackgroundPage();
var require = backgroundPage.require;
var Prefs = require("prefs").Prefs;
var Utils = require("utils").Utils;

function init()
{
  // Set up page title
  var titleId = (backgroundPage.isFirstRun ? "firstRun_title_install" : "firstRun_title_update");
  var pageTitle = chrome.i18n.getMessage(titleId);
  document.title = document.getElementById("title").textContent = pageTitle;

  // Set up URLs
  var versionID = chrome.app.getDetails().version.split(".").slice(0, 2).join("");
  setLinks("improvementsFeature", "https://adblockplus.org/releases/adblock-plus-" + versionID + "-for-google-chrome-released");
  setLinks("acceptableAdsExplanation", getDocLink("acceptable_ads"),
           getDocLink("acceptable_ads", "criteria"), backgroundPage.openOptions);
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
