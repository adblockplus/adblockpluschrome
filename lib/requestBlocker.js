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

/** @module requestBlocker */

"use strict";

const {Filter, RegExpFilter, BlockingFilter} = require("filterClasses");
const {Subscription} = require("subscriptionClasses");
const {defaultMatcher} = require("matcher");
const {FilterNotifier} = require("filterNotifier");
const {Prefs} = require("prefs");
const {checkWhitelisted, getKey} = require("whitelisting");
const {stringifyURL, extractHostFromFrame, isThirdParty} = require("url");
const {port} = require("messaging");
const devtools = require("devtools");

// Chrome can't distinguish between OBJECT_SUBREQUEST and OBJECT requests.
if (!browser.webRequest.ResourceType ||
    !("OBJECT_SUBREQUEST" in browser.webRequest.ResourceType))
{
  RegExpFilter.typeMap.OBJECT_SUBREQUEST = RegExpFilter.typeMap.OBJECT;
}

// Map of content types reported by the browser to the respecitve content types
// used by Adblock Plus. Other content types are simply mapped to OTHER.
let resourceTypes = new Map(function*()
{
  for (let type in RegExpFilter.typeMap)
    yield [type.toLowerCase(), type];

  yield ["sub_frame", "SUBDOCUMENT"];

  // Treat navigator.sendBeacon() the same as <a ping>, it's essentially the
  // same concept - merely generalized.
  yield ["beacon", "PING"];

  // Treat <img srcset> and <picture> the same as other images.
  yield ["imageset", "IMAGE"];
}());

exports.filterTypes = new Set(function*()
{
  // Microsoft Edge does not have webRequest.ResourceType or the devtools panel.
  // Since filterTypes is only used by devtools, we can just bail out here.
  if (!(browser.webRequest.ResourceType))
    return;

  for (let type in browser.webRequest.ResourceType)
    yield resourceTypes.get(browser.webRequest.ResourceType[type]) || "OTHER";

  // WEBRTC gets addressed through a workaround, even if the webRequest API is
  // lacking support to block this kind of a request.
  yield "WEBRTC";

  // POPUP, CSP and ELEMHIDE filters aren't mapped to resource types.
  yield "POPUP";
  yield "ELEMHIDE";
  yield "CSP";
}());

function onBeforeRequestAsync(tabId, url, type, docDomain,
                              thirdParty, sitekey,
                              specificOnly, filter)
{
  let tabIds = tabId != -1 ? [tabId] : [];

  if (filter)
    FilterNotifier.emit("filter.hitCount", filter, 0, 0, tabIds);

  devtools.logRequest(
    tabIds, url, type, docDomain,
    thirdParty, sitekey,
    specificOnly, filter
  );
}

browser.webRequest.onBeforeRequest.addListener(details =>
{
  // Never block top-level documents.
  if (details.type == "main_frame")
    return;

  // Filter out requests from non web protocols. Ideally, we'd explicitly
  // specify the protocols we are interested in (i.e. http://, https://,
  // ws:// and wss://) with the url patterns, given below, when adding this
  // listener. But unfortunately, Chrome <=57 doesn't support the WebSocket
  // protocol and is causing an error if it is given.
  let url = new URL(details.url);
  if (url.protocol != "http:" && url.protocol != "https:" &&
      url.protocol != "ws:" && url.protocol != "wss:")
    return;

  // Firefox (only) allows to intercept requests sent by the browser
  // and other extensions. We don't want to block these.
  if (details.originUrl)
  {
    let originUrl = new URL(details.originUrl);
    if (originUrl.protocol == "chrome:" ||
        originUrl.protocol == "moz-extension:")
      return;
  }

  let frame = ext.getFrame(
    details.tabId,
    // We are looking for the frame that contains the element which
    // has triggered this request. For most requests (e.g. images) we
    // can just use the request's frame ID, but for subdocument requests
    // (e.g. iframes) we must instead use the request's parent frame ID.
    details.type == "sub_frame" ? details.parentFrameId : details.frameId
  );

  let docDomain = null;
  let sitekey = null;
  let thirdParty = false;
  let specificOnly = false;

  if (frame)
  {
    let page = new ext.Page({id: details.tabId});

    if (checkWhitelisted(page, frame))
      return;

    docDomain = extractHostFromFrame(frame);
    sitekey = getKey(page, frame);
    thirdParty = isThirdParty(url, docDomain);
    specificOnly = !!checkWhitelisted(page, frame,
                                      RegExpFilter.typeMap.GENERICBLOCK);
  }

  let urlString = stringifyURL(url);
  let type = resourceTypes.get(details.type) || "OTHER";
  let filter = defaultMatcher.matchesAny(
    urlString, RegExpFilter.typeMap[type],
    docDomain, thirdParty, sitekey, specificOnly
  );

  setTimeout(onBeforeRequestAsync, 0, details.tabId, urlString,
                                      type, docDomain,
                                      thirdParty, sitekey,
                                      specificOnly, filter);

  if (filter instanceof BlockingFilter)
    return {cancel: true};
}, {urls: ["<all_urls>"]}, ["blocking"]);

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

function onFilterChange(arg, isDisabledAction)
{
  // Avoid triggering filters.behaviorChanged multiple times
  // when multiple filter hanges happen at the same time.
  if (ignoreFilterNotifications)
    return;

  // Ignore disabled subscriptions and filters, unless they just got
  // disabled, otherwise they have no effect on the handler behavior.
  if (arg && arg.disabled && !isDisabledAction)
    return;

  // Ignore empty subscriptions. This includes subscriptions
  // that have just been added, but not downloaded yet.
  if (arg instanceof Subscription && arg.filters.length == 0)
    return;

  // Ignore all types of filters but request filters,
  // only these have an effect on the handler behavior.
  if (arg instanceof Filter && !(arg instanceof RegExpFilter))
    return;

  ignoreFilterNotifications = true;
  setTimeout(() =>
  {
    ignoreFilterNotifications = false;
    ext.webRequest.handlerBehaviorChanged();
    FilterNotifier.emit("filter.behaviorChanged");
  });
}

FilterNotifier.on("subscription.added", onFilterChange);
FilterNotifier.on("subscription.removed", onFilterChange);
FilterNotifier.on("subscription.updated", onFilterChange);
FilterNotifier.on("subscription.disabled", arg => onFilterChange(arg, true));
FilterNotifier.on("filter.added", onFilterChange);
FilterNotifier.on("filter.removed", onFilterChange);
FilterNotifier.on("filter.disabled", arg => onFilterChange(arg, true));
FilterNotifier.on("load", onFilterChange);

port.on("request.blockedByRTCWrapper", (msg, sender) =>
{
  return ext.webRequest.onBeforeRequest._dispatch(
     new URL(msg.url),
     "webrtc",
     sender.page,
     sender.frame
  ).includes(false);
});
