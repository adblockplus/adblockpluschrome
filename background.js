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

with(require("filterClasses"))
{
  this.BlockingFilter = BlockingFilter;
  this.WhitelistFilter = WhitelistFilter;
  this.RegExpFilter = RegExpFilter;
}
with(require("whitelisting"))
{
  this.checkWhitelisted = checkWhitelisted;
  this.getKey = getKey;
}
with(require("url"))
{
  this.stringifyURL = stringifyURL;
  this.isThirdParty = isThirdParty;
  this.extractHostFromFrame = extractHostFromFrame;
}
var FilterStorage = require("filterStorage").FilterStorage;
var FilterNotifier = require("filterNotifier").FilterNotifier;
var SpecialSubscription = require("subscriptionClasses").SpecialSubscription;
var ElemHide = require("elemHide").ElemHide;
var defaultMatcher = require("matcher").defaultMatcher;
var Prefs = require("prefs").Prefs;
var updateIcon = require("icon").updateIcon;
var showNextNotificationForUrl = require("notificationHelper").showNextNotificationForUrl;
var port = require("messaging").port;
var devtools = require("devtools");

// Special-case domains for which we cannot use style-based hiding rules.
// See http://crbug.com/68705.
var noStyleRulesHosts = ["mail.google.com", "mail.yahoo.com", "www.google.com"];

var htmlPages = new ext.PageMap();

var contextMenuItem = {
  title: ext.i18n.getMessage("block_element"),
  contexts: ["image", "video", "audio"],
  onclick: function(page)
  {
    page.sendMessage({type: "composer.content.contextMenuClicked"});
  }
};

// Adds or removes browser action icon according to options.
function refreshIconAndContextMenu(page)
{
  var whitelisted = !!checkWhitelisted(page);
  updateIcon(page, whitelisted);

  // show or hide the context menu entry dependent on whether
  // adblocking is active on that page
  page.contextMenus.remove(contextMenuItem);
  if (Prefs.shouldShowBlockElementMenu && !whitelisted && htmlPages.has(page))
    page.contextMenus.create(contextMenuItem);
}

function refreshIconAndContextMenuForAllPages()
{
  ext.pages.query({}, function(pages)
  {
    pages.forEach(refreshIconAndContextMenu);
  });
}

FilterNotifier.addListener(function(action)
{
  if (action == "load" || action == "save")
    refreshIconAndContextMenuForAllPages();
});

Prefs.on("shouldShowBlockElementMenu", refreshIconAndContextMenuForAllPages);

// This is a hack to speedup loading of the options page on Safari.
// Once we replaced the background page proxy with message passing
// this global function should removed.
function getUserFilters()
{
  var filters = [];
  var exceptions = [];

  for (var i = 0; i < FilterStorage.subscriptions.length; i++)
  {
    var subscription = FilterStorage.subscriptions[i];
    if (!(subscription instanceof SpecialSubscription))
      continue;

    for (var j = 0; j < subscription.filters.length; j++)
    {
      var filter = subscription.filters[j];
      if (filter instanceof WhitelistFilter &&  /^@@\|\|([^\/:]+)\^\$document$/.test(filter.text))
        exceptions.push(RegExp.$1);
      else
        filters.push(filter.text);
    }
  }

  return {filters: filters, exceptions: exceptions};
}

port.on("get-selectors", function(msg, sender)
{
  var selectors = [];
  var trace = devtools && devtools.hasPanel(sender.page);

  if (!checkWhitelisted(sender.page, sender.frame,
                        RegExpFilter.typeMap.DOCUMENT |
                        RegExpFilter.typeMap.ELEMHIDE))
  {
    var noStyleRules = false;
    var specificOnly = checkWhitelisted(sender.page, sender.frame,
                                        RegExpFilter.typeMap.GENERICHIDE);
    var host = extractHostFromFrame(sender.frame);

    for (var i = 0; i < noStyleRulesHosts.length; i++)
    {
      var noStyleHost = noStyleRulesHosts[i];
      if (host == noStyleHost || (host.length > noStyleHost.length &&
                                  host.substr(host.length - noStyleHost.length - 1) == "." + noStyleHost))
      {
        noStyleRules = true;
      }
    }
    selectors = ElemHide.getSelectorsForDomain(host, specificOnly);
    if (noStyleRules)
    {
      selectors = selectors.filter(function(s)
      {
        return !/\[style[\^\$]?=/.test(s);
      });
    }
  }

  return {selectors: selectors, trace: trace};
});

port.on("should-collapse", function(msg, sender)
{
  if (checkWhitelisted(sender.page, sender.frame))
    return false;

  var typeMask = RegExpFilter.typeMap[msg.mediatype];
  var documentHost = extractHostFromFrame(sender.frame);
  var sitekey = getKey(sender.page, sender.frame);
  var blocked = false;

  var specificOnly = checkWhitelisted(
    sender.page, sender.frame,
    RegExpFilter.typeMap.GENERICBLOCK
  );

  for (var i = 0; i < msg.urls.length; i++)
  {
    var url = new URL(msg.urls[i], msg.baseURL);
    var filter = defaultMatcher.matchesAny(
      stringifyURL(url), typeMask,
      documentHost, isThirdParty(url, documentHost),
      sitekey, specificOnly
    );

    if (filter instanceof BlockingFilter)
    {
      if (filter.collapse != null)
        return filter.collapse;

      blocked = true;
    }
  }

  return blocked && Prefs.hidePlaceholders;
});

port.on("forward", function(msg, sender)
{
  var targetPage;
  if (msg.targetPageId)
    targetPage = ext.getPage(msg.targetPageId);
  else
    targetPage = sender.page;

  if (targetPage)
  {
    msg.payload.sender = sender.page.id;
    if (msg.expectsResponse)
      return new Promise(targetPage.sendMessage.bind(targetPage, msg.payload));
    targetPage.sendMessage(msg.payload);
  }
});

// update icon when page changes location
ext.pages.onLoading.addListener(function(page)
{
  page.sendMessage({type: "composer.content.finished"});
  refreshIconAndContextMenu(page);
  showNextNotificationForUrl(page.url);
});
