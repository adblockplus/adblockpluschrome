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

var backgroundPage = ext.backgroundPage.getWindow();
var require = backgroundPage.require;

with(require("filterClasses"))
{
  this.Filter = Filter;
  this.WhitelistFilter = WhitelistFilter;
}
with(require("subscriptionClasses"))
{
  this.Subscription = Subscription;
  this.SpecialSubscription = SpecialSubscription;
  this.DownloadableSubscription = DownloadableSubscription;
}
with(require("filterValidation"))
{
  this.parseFilter = parseFilter;
  this.parseFilters = parseFilters;
}
var FilterStorage = require("filterStorage").FilterStorage;
var FilterNotifier = require("filterNotifier").FilterNotifier;
var Prefs = require("prefs").Prefs;
var Synchronizer = require("synchronizer").Synchronizer;
var Utils = require("utils").Utils;
var NotificationStorage = require("notification").Notification;

// Loads options from localStorage and sets UI elements accordingly
function loadOptions()
{
  // Set page title to i18n version of "Adblock Plus Options"
  document.title = i18n.getMessage("options");

  // Set links
  $("#acceptableAdsLink").attr("href", Prefs.subscriptions_exceptionsurl);
  $("#acceptableAdsDocs").attr("href", Utils.getDocLink("acceptable_ads"));
  setLinks("filter-must-follow-syntax", Utils.getDocLink("filterdoc"));
  setLinks("found-a-bug", Utils.getDocLink(require("info").application + "_support"));

  // Add event listeners
  window.addEventListener("unload", unloadOptions, false);
  $("#updateFilterLists").click(updateFilterLists);
  $("#startSubscriptionSelection").click(startSubscriptionSelection);
  $("#subscriptionSelector").change(updateSubscriptionSelection);
  $("#addSubscription").click(addSubscription);
  $("#acceptableAds").click(allowAcceptableAds);
  $("#whitelistForm").submit(addWhitelistDomain);
  $("#removeWhitelist").click(removeSelectedExcludedDomain);
  $("#customFilterForm").submit(addTypedFilter);
  $("#removeCustomFilter").click(removeSelectedFilters);
  $("#rawFiltersButton").click(toggleFiltersInRawFormat);
  $("#importRawFilters").click(importRawFiltersText);
  FilterNotifier.addListener(onFilterChange);

  // Display jQuery UI elements
  $("#tabs").tabs();
  $("button").button();
  $(".refreshButton").button("option", "icons", {primary: "ui-icon-refresh"});
  $(".addButton").button("option", "icons", {primary: "ui-icon-plus"});
  $(".removeButton").button("option", "icons", {primary: "ui-icon-minus"});

  // Popuplate option checkboxes
  initCheckbox("shouldShowBlockElementMenu");
  if (Prefs.notifications_showui)
  {
    initCheckbox("shouldShowNotifications", {
      get: function()
      {
        return Prefs.notifications_ignoredcategories.indexOf("*") == -1;
      },
      toggle: function()
      {
        NotificationStorage.toggleIgnoreCategory("*");
        return this.get();
      }
    });
  }
  else
    document.getElementById("shouldShowNotificationsContainer").hidden = true;

  ext.onMessage.addListener(onMessage);
  ext.backgroundPage.sendMessage({
    type: "app.listen",
    filter: ["addSubscription"]
  });

  // Load recommended subscriptions
  loadRecommendations();

  // Show user's filters
  reloadFilters();
}
$(loadOptions);

function onMessage(msg)
{
  if (msg.type == "app.listen")
  {
    if (msg.action == "addSubscription")
    {
      var subscription = msg.args[0];
      startSubscriptionSelection(subscription.title, subscription.url);
    }
  }
  else if (msg.type == "focus-section")
  {
    var tabs = document.getElementsByClassName("ui-tabs-panel");
    for (var i = 0; i < tabs.length; i++)
    {
      var found = tabs[i].querySelector("[data-section='" + msg.section + "']");
      if (!found)
        continue;

      var previous = document.getElementsByClassName("focused");
      if (previous.length > 0)
        previous[0].classList.remove("focused");

      var tab = $("[href='#" + tabs[i].id + "']");
      $("#tabs").tabs("select", tab.parent().index());
      found.classList.add("focused");
    }
  }
};

// Reloads the displayed subscriptions and filters
function reloadFilters()
{
  // Load user filter URLs
  var container = document.getElementById("filterLists");
  while (container.lastChild)
    container.removeChild(container.lastChild);

  var hasAcceptable = false;
  for (var i = 0; i < FilterStorage.subscriptions.length; i++)
  {
    var subscription = FilterStorage.subscriptions[i];
    if (subscription instanceof SpecialSubscription)
      continue;

    if (subscription.url == Prefs.subscriptions_exceptionsurl)
    {
      hasAcceptable = true;
      continue;
    }

    addSubscriptionEntry(subscription);
  }

  $("#acceptableAds").prop("checked", hasAcceptable);

  // User-entered filters
  var userFilters = backgroundPage.getUserFilters();
  populateList("userFiltersBox", userFilters.filters);
  populateList("excludedDomainsBox", userFilters.exceptions);
}

// Cleans up when the options window is closed
function unloadOptions()
{
  FilterNotifier.removeListener(onFilterChange);
}

function initCheckbox(id, descriptor)
{
  var checkbox = document.getElementById(id);
  if (descriptor && descriptor.get)
    checkbox.checked = descriptor.get();
  else
    checkbox.checked = Prefs[id];

  checkbox.addEventListener("click", function()
  {
    if (descriptor && descriptor.toggle)
      checkbox.checked = descriptor.toggle();

    Prefs[id] = checkbox.checked;
  }, false);
}

var delayedSubscriptionSelection = null;

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

        var prefixes = element.getAttribute("prefixes");
        var prefix = Utils.checkLocalePrefixMatch(prefixes);
        if (prefix)
        {
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

function addSubscription()
{
  var list = document.getElementById("subscriptionSelector");
  var data = list.options[list.selectedIndex]._data;
  if (data)
    doAddSubscription(data.url, data.title, data.homepage);
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

    doAddSubscription(url, title, null);
  }

  $("#addSubscriptionContainer").hide();
  $("#customSubscriptionContainer").hide();
  $("#addSubscriptionButton").show();
}

function doAddSubscription(url, title, homepage)
{
  if (url in FilterStorage.knownSubscriptions)
    return;

  var subscription = Subscription.fromURL(url);
  if (!subscription)
    return;

  subscription.title = title;
  if (homepage)
    subscription.homepage = homepage;
  FilterStorage.addSubscription(subscription);

  if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
    Synchronizer.execute(subscription);
}

function allowAcceptableAds(event)
{
  var subscription = Subscription.fromURL(Prefs.subscriptions_exceptionsurl);
  if (!subscription)
    return;

  subscription.disabled = false;
  subscription.title = "Allow non-intrusive advertising";
  if ($("#acceptableAds").prop("checked"))
  {
    FilterStorage.addSubscription(subscription);
    if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
      Synchronizer.execute(subscription);
  }
  else
    FilterStorage.removeSubscription(subscription);
}

function findSubscriptionElement(subscription)
{
  var children = document.getElementById("filterLists").childNodes;
  for (var i = 0; i < children.length; i++)
    if (children[i]._subscription == subscription)
      return children[i];
  return null;
}

function updateSubscriptionInfo(element)
{
  var subscription = element._subscription;

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
  if (Synchronizer.isExecuting(subscription.url))
    lastUpdate.textContent = i18n.getMessage("filters_subscription_lastDownload_inProgress");
  else if (subscription.downloadStatus && subscription.downloadStatus != "synchronize_ok")
  {
    var map =
    {
      "synchronize_invalid_url": "filters_subscription_lastDownload_invalidURL",
      "synchronize_connection_error": "filters_subscription_lastDownload_connectionError",
      "synchronize_invalid_data": "filters_subscription_lastDownload_invalidData",
      "synchronize_checksum_mismatch": "filters_subscription_lastDownload_checksumMismatch"
    };
    if (subscription.downloadStatus in map)
      lastUpdate.textContent = i18n.getMessage(map[subscription.downloadStatus]);
    else
      lastUpdate.textContent = subscription.downloadStatus;
    lastUpdate.classList.add("error");
  }
  else if (subscription.lastDownload > 0)
  {
    var timeDate = i18n_timeDateStrings(subscription.lastDownload * 1000);
    var messageID = (timeDate[1] ? "last_updated_at" : "last_updated_at_today");
    lastUpdate.textContent = i18n.getMessage(messageID, timeDate);
  }
}

function onFilterChange(action, item, param1, param2)
{
  switch (action)
  {
    case "load":
      reloadFilters();
      break;
    case "subscription.title":
    case "subscription.disabled":
    case "subscription.homepage":
    case "subscription.lastDownload":
    case "subscription.downloadStatus":
      var element = findSubscriptionElement(item);
      if (element)
        updateSubscriptionInfo(element);
      break;
    case "subscription.added":
      if (item instanceof SpecialSubscription)
      {
        for (var i = 0; i < item.filters.length; i++)
          onFilterChange("filter.added", item.filters[i]);
      }
      else if (item.url == Prefs.subscriptions_exceptionsurl)
        $("#acceptableAds").prop("checked", true);
      else if (!findSubscriptionElement(item))
        addSubscriptionEntry(item);
      break;
    case "subscription.removed":
      if (item instanceof SpecialSubscription)
      {
        for (var i = 0; i < item.filters.length; i++)
          onFilterChange("filter.removed", item.filters[i]);
      }
      else if (item.url == Prefs.subscriptions_exceptionsurl)
        $("#acceptableAds").prop("checked", false);
      else
      {
        var element = findSubscriptionElement(item);
        if (element)
          element.parentNode.removeChild(element);
      }
      break;
    case "filter.added":
      if (item instanceof WhitelistFilter && /^@@\|\|([^\/:]+)\^\$document$/.test(item.text))
        appendToListBox("excludedDomainsBox", RegExp.$1);
      else
        appendToListBox("userFiltersBox", item.text);
      break;
    case "filter.removed":
      if (item instanceof WhitelistFilter && /^@@\|\|([^\/:]+)\^\$document$/.test(item.text))
        removeFromListBox("excludedDomainsBox", RegExp.$1);
      else
        removeFromListBox("userFiltersBox", item.text);
      break;
  }
}

// Populates a list box with a number of entries
function populateList(id, entries)
{
  var list = document.getElementById(id);
  while (list.lastChild)
    list.removeChild(list.lastChild);

  entries.sort();
  for (var i = 0; i < entries.length; i++)
  {
    var option = new Option();
    option.text = entries[i];
    option.value = entries[i];
    list.appendChild(option);
  }
}

// Add a filter string to the list box.
function appendToListBox(boxId, text)
{
  var elt = new Option();  /* Note: document.createElement("option") is unreliable in Opera */
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
  FilterStorage.addFilter(Filter.fromText(filterText));
}

// Adds filter text that user typed to the selection box
function addTypedFilter(event)
{
  event.preventDefault();

  var element = document.getElementById("newFilter");
  var result = parseFilter(element.value);

  if (result.error)
  {
    alert(result.error);
    return;
  }

  if (result.filter)
    FilterStorage.addFilter(result.filter);

  element.value = "";
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
    FilterStorage.removeFilter(Filter.fromText("@@||" + remove[i] + "^$document"));
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
    FilterStorage.removeFilter(Filter.fromText(remove[i]));
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
  var result = parseFilters(text);

  var errors = result.errors.filter(function(e)
  {
    return e.type != "unexpected-filter-list-header";
  });

  if (errors.length > 0)
  {
    alert(errors.join("\n"));
    return;
  }

  var seenFilter = Object.create(null);
  for (var i = 0; i < result.filters.length; i++)
  {
    var filter = result.filters[i];
    FilterStorage.addFilter(filter);
    seenFilter[filter.text] = null;
  }

  var remove = [];
  for (var i = 0; i < FilterStorage.subscriptions.length; i++)
  {
    var subscription = FilterStorage.subscriptions[i];
    if (!(subscription instanceof SpecialSubscription))
      continue;

    for (var j = 0; j < subscription.filters.length; j++)
    {
      var filter = subscription.filters[j];
      if (filter instanceof WhitelistFilter && /^@@\|\|([^\/:]+)\^\$document$/.test(filter.text))
        continue;

      if (!(filter.text in seenFilter))
        remove.push(filter);
    }
  }

  for (var i = 0; i < remove.length; i++)
    FilterStorage.removeFilter(remove[i]);

  $("#rawFilters").hide();
}

// Called when user explicitly requests filter list updates
function updateFilterLists()
{
  for (var i = 0; i < FilterStorage.subscriptions.length; i++)
  {
    var subscription = FilterStorage.subscriptions[i];
    if (subscription instanceof DownloadableSubscription)
      Synchronizer.execute(subscription, true, true);
  }
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

    FilterStorage.removeSubscription(subscription);
  }, false);

  var enabled = element.getElementsByClassName("subscriptionEnabled")[0];
  enabled.addEventListener("click", function()
  {
    if (subscription.disabled == !enabled.checked)
      return;

    subscription.disabled = !enabled.checked;
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
