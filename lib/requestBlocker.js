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

/** @module requestBlocker */

"use strict";

let {RegExpFilter, BlockingFilter} = require("filterClasses");
let {defaultMatcher} = require("matcher");
let {FilterNotifier} = require("filterNotifier");
let {Prefs} = require("prefs");
let {checkWhitelisted, getKey} = require("whitelisting");
let {stringifyURL, extractHostFromFrame, isThirdParty} = require("url");
let {port} = require("messaging");
let devtools = require("devtools");

ext.webRequest.getIndistinguishableTypes().forEach(types =>
{
  for (let i = 1; i < types.length; i++)
    RegExpFilter.typeMap[types[i]] = RegExpFilter.typeMap[types[0]];
});

function onBeforeRequestAsync(page, url, type, docDomain,
                              thirdParty, sitekey,
                              specificOnly, filter)
{
  if (filter)
    FilterNotifier.triggerListeners("filter.hitCount", filter, 0, 0, page);

  if (devtools)
    devtools.logRequest(
      page, url, type, docDomain,
      thirdParty, sitekey,
      specificOnly, filter
    );
}

ext.webRequest.onBeforeRequest.addListener((url, type, page, frame) =>
{
  if (checkWhitelisted(page, frame))
    return true;

  let urlString = stringifyURL(url);
  let docDomain = extractHostFromFrame(frame);
  let thirdParty = isThirdParty(url, docDomain);
  let sitekey = getKey(page, frame);

  let specificOnly = !!checkWhitelisted(
    page, frame, RegExpFilter.typeMap.GENERICBLOCK
  );

  let filter = defaultMatcher.matchesAny(
    urlString, RegExpFilter.typeMap[type],
    docDomain, thirdParty, sitekey, specificOnly
  );

  setTimeout(onBeforeRequestAsync, 0, page, urlString,
                                      type, docDomain,
                                      thirdParty, sitekey,
                                      specificOnly, filter);

  return !(filter instanceof BlockingFilter);
});

port.on("filters.collapse", (message, sender) =>
{
  if (checkWhitelisted(sender.page, sender.frame))
    return false;

  let typeMask = RegExpFilter.typeMap[message.mediatype];
  let documentHost = extractHostFromFrame(sender.frame);
  let sitekey = getKey(sender.page, sender.frame);
  let blocked = false;

  let specificOnly = checkWhitelisted(
    sender.page, sender.frame,
    RegExpFilter.typeMap.GENERICBLOCK
  );

  for (let url of message.urls)
  {
    let urlObj = new URL(url, message.baseURL);
    let filter = defaultMatcher.matchesAny(
      stringifyURL(urlObj),
      typeMask, documentHost,
      isThirdParty(urlObj, documentHost),
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

let ignoreFilterNotifications = false;
FilterNotifier.addListener((action, arg) =>
{
  // Avoid triggering filters.behaviorChanged multiple times
  // when multiple filter hanges happen at the same time.
  if (ignoreFilterNotifications)
    return;

  if (action != "load")
  {
    let parts = action.split(".");
    let [category, event] = parts;
    if (category == "subscription")
    {
      if (event != "added"  &&
          event != "removed" &&
          event != "updated" &&
          event != "disabled")
        return;

      // Ignore empty subscriptions. This includes subscriptions
      // that have just been added, but not downloaded yet.
      if (arg.filters.length == 0)
        return;
    }
    else if (category == "filter")
    {
      if (event != "added" &&
          event != "removed" &&
          event != "disabled")
        return;

      // Ignore all types of filters but request filters,
      // only these have an effect on the handler behavior.
      if (!(arg instanceof RegExpFilter))
        return;
    }
    else
      return;

    // Ignore disabled subscriptions and filters, unless they just got
    // disabled, otherwise they have no effect on the handler behavior.
    if (arg.disabled && event != "disabled")
      return;
  }

  ignoreFilterNotifications = true;
  setTimeout(() =>
  {
    ignoreFilterNotifications = false;
    ext.webRequest.handlerBehaviorChanged();
    FilterNotifier.triggerListeners("filter.behaviorChanged");
  });
});
