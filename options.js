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

"use strict";

/**
 * Creates a wrapping function used to conveniently send a type of message.
 *
 * @param {Object} baseMessage The part of the message that's always sent
 * @param {..string} paramKeys Any message keys that have dynamic values. The
 *                             returned function will take the corresponding
 *                             values as arguments.
 * @return The generated messaging function, optionally taking any values as
 *         specified by the paramKeys and finally an optional callback.
 *         (Although the value arguments are optional their index must be
 *          maintained. E.g. if you omit the first value you must omit the
 *          second too.)
 */
function wrapper(baseMessage /* , [paramKeys] */)
{
  var paramKeys = [];
  for (var i = 1; i < arguments.length; i++)
    paramKeys.push(arguments[i]);

  return function(/* [paramValues], callback */)
  {
    var message = Object.create(null);
    for (var key in baseMessage)
      if (baseMessage.hasOwnProperty(key))
        message[key] = baseMessage[key];

    var paramValues = [];
    var callback;

    if (arguments.length > 0)
    {
      var lastArg = arguments[arguments.length - 1];
      if (typeof lastArg == "function")
        callback = lastArg;

      for (var i = 0; i < arguments.length - (callback ? 1 : 0); i++)
        message[paramKeys[i]] = arguments[i];
    }

    // Chrome 30 throws an exception when sendMessage is called with a callback
    // parameter of undefined, so we work around that here. (See issue 4052)
    if (callback)
      ext.backgroundPage.sendMessage(message, callback);
    else
      ext.backgroundPage.sendMessage(message);
  };
}

var getDocLink = wrapper({type: "app.get", what: "doclink"}, "link");
var getInfo = wrapper({type: "app.get"}, "what");
var getPref = wrapper({type: "prefs.get"}, "key");
var togglePref = wrapper({type: "prefs.toggle"}, "key");
var getSubscriptions = wrapper({type: "subscriptions.get"},
                               "downloadable", "special");
var removeSubscription = wrapper({type: "subscriptions.remove"}, "url");
var addSubscription = wrapper({type: "subscriptions.add"},
                                "url", "title", "homepage");
var toggleSubscription = wrapper({type: "subscriptions.toggle"},
                                 "url", "keepInstalled");
var updateSubscription = wrapper({type: "subscriptions.update"}, "url");
var importRawFilters = wrapper({type: "filters.importRaw"},
                               "text", "removeExisting");
var addFilter = wrapper({type: "filters.add"}, "text");
var getFilters = wrapper({type: "filters.get"}, "subscriptionUrl");
var removeFilter = wrapper({type: "filters.remove"}, "text");

var i18n = ext.i18n;
var whitelistedDomainRegexp = /^@@\|\|([^\/:]+)\^\$document$/;
var delayedSubscriptionSelection = null;

var acceptableAdsUrl;

// Loads options from localStorage and sets UI elements accordingly
function loadOptions()
{
  // Set page title to i18n version of "Adblock Plus Options"
  document.title = i18n.getMessage("options");

  // Set links
  getPref("subscriptions_exceptionsurl", function(url)
  {
    acceptableAdsUrl = url;
    $("#acceptableAdsLink").attr("href", acceptableAdsUrl);
  });
  getDocLink("acceptable_ads", function(url)
  {
    $("#acceptableAdsDocs").attr("href", url);
  });
  getDocLink("filterdoc", function(url)
  {
    setLinks("filter-must-follow-syntax", url);
  });
  getInfo("application", function(application)
  {
    getInfo("platform", function(platform)
    {
      if (platform == "chromium" && application != "opera")
        application = "chrome";

      getDocLink(application + "_support", function(url)
      {
        setLinks("found-a-bug", url);
      });
    });
  });

  // Add event listeners
  $("#updateFilterLists").click(updateFilterLists);
  $("#startSubscriptionSelection").click(startSubscriptionSelection);
  $("#subscriptionSelector").change(updateSubscriptionSelection);
  $("#addSubscription").click(addSubscriptionClicked);
  $("#acceptableAds").click(toggleAcceptableAds);
  $("#whitelistForm").submit(addWhitelistDomain);
  $("#removeWhitelist").click(removeSelectedExcludedDomain);
  $("#customFilterForm").submit(addTypedFilter);
  $("#removeCustomFilter").click(removeSelectedFilters);
  $("#rawFiltersButton").click(toggleFiltersInRawFormat);
  $("#importRawFilters").click(importRawFiltersText);

  // Display jQuery UI elements
  $("#tabs").tabs();
  $("button").button();
  $(".refreshButton").button("option", "icons", {primary: "ui-icon-refresh"});
  $(".addButton").button("option", "icons", {primary: "ui-icon-plus"});
  $(".removeButton").button("option", "icons", {primary: "ui-icon-minus"});

  // Popuplate option checkboxes
  initCheckbox("shouldShowBlockElementMenu");
  initCheckbox("show_devtools_panel");
  initCheckbox("shouldShowNotifications", "notifications_ignoredcategories");

  getInfo("features", function(features)
  {
    if (!features.devToolsPanel)
      document.getElementById("showDevtoolsPanelContainer").hidden = true;
  });
  getPref("notifications_showui", function(notifications_showui)
  {
    if (!notifications_showui)
      document.getElementById("shouldShowNotificationsContainer").hidden = true;
  });

  // Register listeners in the background message responder
  ext.backgroundPage.sendMessage({
    type: "app.listen",
    filter: ["addSubscription", "focusSection"]
  });
  ext.backgroundPage.sendMessage(
  {
    type: "filters.listen",
    filter: ["added", "loaded", "removed"]
  });
  ext.backgroundPage.sendMessage(
  {
    type: "prefs.listen",
    filter: ["notifications_ignoredcategories", "notifications_showui",
             "show_devtools_panel", "shouldShowBlockElementMenu"]
  });
  ext.backgroundPage.sendMessage(
  {
    type: "subscriptions.listen",
    filter: ["added", "disabled", "homepage", "lastDownload", "removed",
             "title", "downloadStatus", "downloading"]
  });

  // Load recommended subscriptions
  loadRecommendations();

  // Show user's filters
  reloadFilters();
}
$(loadOptions);

function convertSpecialSubscription(subscription)
{
  getFilters(subscription.url, function(filters)
  {
    for (var j = 0; j < filters.length; j++)
    {
      var filter = filters[j].text;
      if (whitelistedDomainRegexp.test(filter))
        appendToListBox("excludedDomainsBox", RegExp.$1);
      else
        appendToListBox("userFiltersBox", filter);
    }
  });
}

// Reloads the displayed subscriptions and filters
function reloadFilters()
{
  // Load user filter URLs
  var container = document.getElementById("filterLists");
  while (container.lastChild)
    container.removeChild(container.lastChild);

  getSubscriptions(true, false, function(subscriptions)
  {
    for (var i = 0; i < subscriptions.length; i++)
    {
      var subscription = subscriptions[i];
      if (subscription.url == acceptableAdsUrl)
        $("#acceptableAds").prop("checked", !subscription.disabled);
      else
        addSubscriptionEntry(subscription);
    }
  });

  // User-entered filters
  getSubscriptions(false, true, function(subscriptions)
  {
    clearListBox("userFiltersBox");
    clearListBox("excludedDomainsBox");

    for (var i = 0; i < subscriptions.length; i++)
      convertSpecialSubscription(subscriptions[i]);
  });
}

function initCheckbox(id, key)
{
  key = key || id;
  var checkbox = document.getElementById(id);

  getPref(key, function(value)
  {
    onPrefMessage(key, value);
  });

  checkbox.addEventListener("click", function()
  {
    togglePref(key);
  }, false);
}

function loadRecommendations()
{
  fetch("subscriptions.xml")
    .then(function(response)
    {
      return response.text();
    })
    .then(function(text)
    {
      var selectedIndex = 0;
      var selectedPrefix = null;
      var matchCount = 0;

      var list = document.getElementById("subscriptionSelector");
      var doc = new DOMParser().parseFromString(text, "application/xml");
      var elements = doc.documentElement.getElementsByTagName("subscription");

      for (var i = 0; i < elements.length; i++)
      {
        var element = elements[i];
        var option = new Option();
        option.text = element.getAttribute("title") + " (" +
                      element.getAttribute("specialization") + ")";
        option._data = {
          title: element.getAttribute("title"),
          url: element.getAttribute("url"),
          homepage: element.getAttribute("homepage")
        };

        var prefix = element.getAttribute("prefixes");
        if (prefix)
        {
          prefix = prefix.replace(/\W/g, "_");
          option.style.fontWeight = "bold";
          option.style.backgroundColor = "#E0FFE0";
          option.style.color = "#000000";
          if (!selectedPrefix || selectedPrefix.length < prefix.length)
          {
            selectedIndex = i;
            selectedPrefix = prefix;
            matchCount = 1;
          }
          else if (selectedPrefix && selectedPrefix.length == prefix.length)
          {
            matchCount++;

            // If multiple items have a matching prefix of the same length:
            // Select one of the items randomly, probability should be the same
            // for all items. So we replace the previous match here with
            // probability 1/N (N being the number of matches).
            if (Math.random() * matchCount < 1)
            {
              selectedIndex = i;
              selectedPrefix = prefix;
            }
          }
        }
        list.appendChild(option);
      }

      var option = new Option();
      var label = i18n.getMessage("filters_addSubscriptionOther_label");
      option.text = label + "\u2026";
      option._data = null;
      list.appendChild(option);

      list.selectedIndex = selectedIndex;

      if (delayedSubscriptionSelection)
        startSubscriptionSelection.apply(null, delayedSubscriptionSelection);
    });
}

function startSubscriptionSelection(title, url)
{
  var list = document.getElementById("subscriptionSelector");
  if (list.length == 0)
  {
    delayedSubscriptionSelection = [title, url];
    return;
  }

  $("#tabs").tabs("select", 0);
  $("#addSubscriptionContainer").show();
  $("#addSubscriptionButton").hide();
  $("#subscriptionSelector").focus();
  if (typeof url != "undefined")
  {
    list.selectedIndex = list.length - 1;
    document.getElementById("customSubscriptionTitle").value = title;
    document.getElementById("customSubscriptionLocation").value = url;
  }
  updateSubscriptionSelection();
  document.getElementById("addSubscriptionContainer").scrollIntoView(true);
}

function updateSubscriptionSelection()
{
  var list = document.getElementById("subscriptionSelector");
  var data = list.options[list.selectedIndex]._data;
  if (data)
    $("#customSubscriptionContainer").hide();
  else
  {
    $("#customSubscriptionContainer").show();
    $("#customSubscriptionTitle").focus();
  }
}

function addSubscriptionClicked()
{
  var list = document.getElementById("subscriptionSelector");
  var data = list.options[list.selectedIndex]._data;
  if (data)
    addSubscription(data.url, data.title, data.homepage);
  else
  {
    var url = document.getElementById("customSubscriptionLocation").value.trim();
    if (!/^https?:/i.test(url))
    {
      alert(i18n.getMessage("global_subscription_invalid_location"));
      $("#customSubscriptionLocation").focus();
      return;
    }

    var title = document.getElementById("customSubscriptionTitle").value.trim();
    if (!title)
      title = url;

    addSubscription(url, title, null);
  }

  $("#addSubscriptionContainer").hide();
  $("#customSubscriptionContainer").hide();
  $("#addSubscriptionButton").show();
}

function toggleAcceptableAds()
{
  toggleSubscription(acceptableAdsUrl, true);
}

function findSubscriptionElement(subscription)
{
  var children = document.getElementById("filterLists").childNodes;
  for (var i = 0; i < children.length; i++)
    if (children[i]._subscription.url == subscription.url)
      return children[i];
  return null;
}

function updateSubscriptionInfo(element, subscription)
{
  if (subscription)
    element._subscription = subscription;
  else
    subscription = element._subscription;

  var title = element.getElementsByClassName("subscriptionTitle")[0];
  title.textContent = subscription.title;
  title.setAttribute("title", subscription.url);
  if (subscription.homepage)
    title.href = subscription.homepage;
  else
    title.href = subscription.url;

  var enabled = element.getElementsByClassName("subscriptionEnabled")[0];
  enabled.checked = !subscription.disabled;

  var lastUpdate = element.getElementsByClassName("subscriptionUpdate")[0];
  lastUpdate.classList.remove("error");

  var downloadStatus = subscription.downloadStatus;
  if (subscription.isDownloading)
  {
    lastUpdate.textContent = i18n.getMessage("filters_subscription_lastDownload_inProgress");
  }
  else if (downloadStatus && downloadStatus != "synchronize_ok")
  {
     var map =
     {
       "synchronize_invalid_url": "filters_subscription_lastDownload_invalidURL",
       "synchronize_connection_error": "filters_subscription_lastDownload_connectionError",
       "synchronize_invalid_data": "filters_subscription_lastDownload_invalidData",
       "synchronize_checksum_mismatch": "filters_subscription_lastDownload_checksumMismatch"
     };
     if (downloadStatus in map)
       lastUpdate.textContent = i18n.getMessage(map[downloadStatus]);
     else
       lastUpdate.textContent = downloadStatus;
     lastUpdate.classList.add("error");
  }
  else if (subscription.lastDownload > 0)
  {
    var timeDate = i18n_timeDateStrings(subscription.lastDownload * 1000);
    var messageID = (timeDate[1] ? "last_updated_at" : "last_updated_at_today");
    lastUpdate.textContent = i18n.getMessage(messageID, timeDate);
  }
}

function onSubscriptionMessage(action, subscription)
{
  var element = findSubscriptionElement(subscription);

  switch (action)
  {
    case "disabled":
    case "downloading":
    case "downloadStatus":
    case "homepage":
    case "lastDownload":
    case "title":
      if (element)
        updateSubscriptionInfo(element, subscription);
      break;
    case "added":
      if (subscription.url.indexOf("~user") == 0)
        convertSpecialSubscription(subscription);
      else if (subscription.url == acceptableAdsUrl)
        $("#acceptableAds").prop("checked", true);
      else if (!element)
        addSubscriptionEntry(subscription);
      break;
    case "removed":
      if (subscription.url == acceptableAdsUrl)
        $("#acceptableAds").prop("checked", false);
      else if (element)
        element.parentNode.removeChild(element);
      break;
  }
}

function onPrefMessage(key, value)
{
  switch (key)
  {
    case "notifications_showui":
      document.getElementById("shouldShowNotificationsContainer").hidden = !value;
      return;
    case "notifications_ignoredcategories":
      key = "shouldShowNotifications";
      value = value.indexOf("*") == -1;
      break;
  }
  var checkbox = document.getElementById(key);
  if (checkbox)
    checkbox.checked = value;
}

function onFilterMessage(action, filter)
{
  switch (action)
  {
    case "loaded":
      reloadFilters();
      break;
    case "added":
      if (whitelistedDomainRegexp.test(filter.text))
        appendToListBox("excludedDomainsBox", RegExp.$1);
      else
        appendToListBox("userFiltersBox", filter.text);
      break;
    case "removed":
      if (whitelistedDomainRegexp.test(filter.text))
        removeFromListBox("excludedDomainsBox", RegExp.$1);
      else
        removeFromListBox("userFiltersBox", filter.text);
      break;
  }
}

function clearListBox(id)
{
  var list = document.getElementById(id);
  while (list.lastChild)
    list.removeChild(list.lastChild);
}

// Add a filter string to the list box.
function appendToListBox(boxId, text)
{
  // Note: document.createElement("option") is unreliable in Opera
  var elt = new Option();
  elt.text = text;
  elt.value = text;
  document.getElementById(boxId).appendChild(elt);
}

// Remove a filter string from a list box.
function removeFromListBox(boxId, text)
{
  var list = document.getElementById(boxId);
  for (var i = 0; i < list.length; i++)
    if (list.options[i].value == text)
      list.remove(i--);
}

function addWhitelistDomain(event)
{
  event.preventDefault();

  var domain = document.getElementById("newWhitelistDomain").value.replace(/\s/g, "");
  document.getElementById("newWhitelistDomain").value = "";
  if (!domain)
    return;

  var filterText = "@@||" + domain + "^$document";
  addFilter(filterText);
}

// Adds filter text that user typed to the selection box
function addTypedFilter(event)
{
  event.preventDefault();

  var element = document.getElementById("newFilter");
  addFilter(element.value, function(errors)
  {
    if (errors.length > 0)
      alert(errors.join("\n"));
    else
      element.value = "";
  });
}

// Removes currently selected whitelisted domains
function removeSelectedExcludedDomain(event)
{
  event.preventDefault();
  var excludedDomainsBox = document.getElementById("excludedDomainsBox");
  var remove = [];
  for (var i = 0; i < excludedDomainsBox.length; i++)
    if (excludedDomainsBox.options[i].selected)
      remove.push(excludedDomainsBox.options[i].value);
  if (!remove.length)
    return;

  for (var i = 0; i < remove.length; i++)
    removeFilter("@@||" + remove[i] + "^$document");
}

// Removes all currently selected filters
function removeSelectedFilters(event)
{
  event.preventDefault();
  var userFiltersBox = document.getElementById("userFiltersBox");
  var remove = [];
  for (var i = 0; i < userFiltersBox.length; i++)
    if (userFiltersBox.options[i].selected)
      remove.push(userFiltersBox.options[i].value);
  if (!remove.length)
    return;

  for (var i = 0; i < remove.length; i++)
    removeFilter(remove[i]);
}

// Shows raw filters box and fills it with the current user filters
function toggleFiltersInRawFormat(event)
{
  event.preventDefault();

  $("#rawFilters").toggle();
  if ($("#rawFilters").is(":visible"))
  {
    var userFiltersBox = document.getElementById("userFiltersBox");
    var text = "";
    for (var i = 0; i < userFiltersBox.length; i++)
      text += userFiltersBox.options[i].value + "\n";
    document.getElementById("rawFiltersText").value = text;
  }
}

// Imports filters in the raw text box
function importRawFiltersText()
{
  var text = document.getElementById("rawFiltersText").value;

  importRawFilters(text, true, function(errors)
  {
    if (errors.length > 0)
      alert(errors.join("\n"));
    else
      $("#rawFilters").hide();
  });
}

// Called when user explicitly requests filter list updates
function updateFilterLists()
{
  // Without the URL parameter this will update all subscriptions
  updateSubscription();
}

// Adds a subscription entry to the UI.
function addSubscriptionEntry(subscription)
{
  var template = document.getElementById("subscriptionTemplate");
  var element = template.cloneNode(true);
  element.removeAttribute("id");
  element._subscription = subscription;

  var removeButton = element.getElementsByClassName("subscriptionRemoveButton")[0];
  removeButton.setAttribute("title", removeButton.textContent);
  removeButton.textContent = "\xD7";
  removeButton.addEventListener("click", function()
  {
    if (!confirm(i18n.getMessage("global_remove_subscription_warning")))
      return;

    removeSubscription(subscription.url);
  }, false);

  getPref("additional_subscriptions", function(additionalSubscriptions)
  {
    if (additionalSubscriptions.indexOf(subscription.url) != -1)
      removeButton.style.visibility = "hidden";
  });

  var enabled = element.getElementsByClassName("subscriptionEnabled")[0];
  enabled.addEventListener("click", function()
  {
    subscription.disabled = !subscription.disabled;
    toggleSubscription(subscription.url, true);
  }, false);

  updateSubscriptionInfo(element);

  document.getElementById("filterLists").appendChild(element);
}

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

ext.onMessage.addListener(function(message)
{
  switch (message.type)
  {
    case "app.respond":
      switch (message.action)
      {
        case "addSubscription":
          var subscription = message.args[0];
          startSubscriptionSelection(subscription.title, subscription.url);
          break;
        case "focusSection":
          var tabs = document.getElementsByClassName("ui-tabs-panel");
          for (var i = 0; i < tabs.length; i++)
          {
            var found = tabs[i].querySelector(
              "[data-section='" + message.args[0] + "']"
            );
            if (!found)
              continue;

            var previous = document.getElementsByClassName("focused");
            if (previous.length > 0)
              previous[0].classList.remove("focused");

            var tab = $("[href='#" + tabs[i].id + "']");
            $("#tabs").tabs("select", tab.parent().index());
            found.classList.add("focused");
          }
          break;
      }
      break;
    case "filters.respond":
      onFilterMessage(message.action, message.args[0]);
      break;
    case "prefs.respond":
      onPrefMessage(message.action, message.args[0]);
      break;
    case "subscriptions.respond":
      onSubscriptionMessage(message.action, message.args[0]);
      break;
  }
});
