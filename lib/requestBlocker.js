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

const {Filter, RegExpFilter, BlockingFilter} =
  require("../adblockpluscore/lib/filterClasses");
const {Subscription} = require("../adblockpluscore/lib/subscriptionClasses");
const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {parseURL} = require("../adblockpluscore/lib/url");
const {Prefs} = require("./prefs");
const {checkWhitelisted, getKey} = require("./whitelisting");
const {extractHostFromFrame} = require("./url");
const {port} = require("./messaging");
const {logRequest: hitLoggerLogRequest} = require("./hitLogger");

const extensionProtocol = new URL(browser.extension.getURL("")).protocol;

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

  // Treat requests sent by plugins the same as <object> or <embed>.
  yield ["object_subrequest", "OBJECT"];
}());

exports.filterTypes = new Set(function*()
{
  for (let type in browser.webRequest.ResourceType)
    yield resourceTypes.get(browser.webRequest.ResourceType[type]) || "OTHER";

  // WEBRTC gets addressed through a workaround, even if the webRequest API is
  // lacking support to block this kind of a request.
  yield "WEBRTC";

  // POPUP, CSP and ELEMHIDE filters aren't mapped to resource types.
  yield "POPUP";
  yield "ELEMHIDE";
  yield "SNIPPET";
  yield "CSP";
}());

function getDocumentInfo(page, frame, originUrl)
{
  return [
    extractHostFromFrame(frame, originUrl),
    getKey(page, frame, originUrl),
    !!checkWhitelisted(page, frame, originUrl,
                       RegExpFilter.typeMap.GENERICBLOCK)
  ];
}

function getRelatedTabIds(details)
{
  // This is the common case, the request is associated with a single tab.
  // If tabId is -1, its not (e.g. the request was sent by
  // a Service/Shared Worker) and we have to identify the related tabs.
  if (details.tabId != -1)
    return Promise.resolve([details.tabId]);

  let url;                    // Firefox provides "originUrl" indicating the
  if (details.originUrl)      // URL of the tab that caused this request.
    url = details.originUrl;  // In case of Service/Shared Worker, this is the
                              // URL of the tab that caused the worker to spawn.

  else if (details.initiator && details.initiator != "null")
    url = details.initiator + "/*";  // Chromium >=63 provides "intiator" which
                                     // is equivalent to "originUrl" on Firefox
                                     // except that its not a full URL but just
                                     // an origin (proto + host).
  else
    return Promise.resolve([]);

  return browser.tabs.query({url}).then(tabs => tabs.map(tab => tab.id));
}

function logRequest(tabIds, request, filter)
{
  if (filter)
    filterNotifier.emit("filter.hitCount", filter, 0, 0, tabIds);

  hitLoggerLogRequest(tabIds, request, filter);
}

browser.webRequest.onBeforeRequest.addListener(details =>
{
  // Filter out requests from non web protocols. Ideally, we'd explicitly
  // specify the protocols we are interested in (i.e. http://, https://,
  // ws:// and wss://) with the url patterns, given below, when adding this
  // listener. But unfortunately, Chrome <=57 doesn't support the WebSocket
  // protocol and is causing an error if it is given.
  let url = parseURL(details.url);
  if (url.protocol != "http:" && url.protocol != "https:" &&
      url.protocol != "ws:" && url.protocol != "wss:")
    return;

  // Firefox provides us with the full origin URL, while Chromium (>=63)
  // provides only the protocol + host of the (top-level) document which
  // the request originates from through the "initiator" property.
  let originUrl = null;
  if (details.originUrl)
    originUrl = parseURL(details.originUrl);
  else if (details.initiator && details.initiator != "null")
    originUrl = parseURL(details.initiator);

  // Ignore requests sent by extensions or by Firefox itself:
  // * Firefox intercepts requests sent by any extensions, indicated with
  //   an "originURL" starting with "moz-extension:".
  // * Chromium intercepts requests sent by this extension only, indicated
  //   on Chromium >=63 with an "initiator" starting with "chrome-extension:".
  // * On Firefox, requests that don't relate to any document or extension are
  //   indicated with an "originUrl" starting with "chrome:".
  if (originUrl && (originUrl.protocol == extensionProtocol ||
                    originUrl.protocol == "chrome:"))
    return;

  let page = new ext.Page({id: details.tabId});
  let frame = ext.getFrame(
    details.tabId,
    // We are looking for the frame that contains the element which
    // has triggered this request. For most requests (e.g. images) we
    // can just use the request's frame ID, but for subdocument requests
    // (e.g. iframes) we must instead use the request's parent frame ID.
    details.type == "sub_frame" ? details.parentFrameId : details.frameId
  );

  // On Chromium >= 63, if both the frame is unknown and we haven't get
  // an "initiator", this implies a request sent by the browser itself
  // (on older versions of Chromium, due to the lack of "initiator",
  // this can also indicate a request sent by a Shared/Service Worker).
  if (!frame && !originUrl)
    return;

  if (checkWhitelisted(page, frame, originUrl))
    return;

  let type = resourceTypes.get(details.type) || "OTHER";
  let [docDomain, sitekey, specificOnly] = getDocumentInfo(page, frame,
                                                           originUrl);
  let filter = defaultMatcher.matchesAny(url, RegExpFilter.typeMap[type],
                                         docDomain, sitekey, specificOnly);

  let result;
  let rewrittenUrl;

  if (filter instanceof BlockingFilter)
  {
    if (typeof filter.rewrite == "string")
    {
      rewrittenUrl = filter.rewriteUrl(details.url);
      // If no rewrite happened (error, different origin), we'll
      // return undefined in order to avoid an "infinite" loop.
      if (rewrittenUrl != details.url)
        result = {redirectUrl: rewrittenUrl};
    }
    else
      result = {cancel: true};
  }

  getRelatedTabIds(details).then(tabIds =>
  {
    logRequest(
      tabIds,
      {
        url: details.url, type, docDomain,
        sitekey, specificOnly, rewrittenUrl
      },
      filter
    );
  });

  return result;
}, {
  types: Object.values(browser.webRequest.ResourceType)
               .filter(type => type != "main_frame"),
  urls: ["<all_urls>"]
}, ["blocking"]);

port.on("filters.collapse", (message, sender) =>
{
  let {page, frame} = sender;

  if (checkWhitelisted(page, frame))
    return false;

  let [docDomain, sitekey, specificOnly] = getDocumentInfo(page, frame);

  for (let url of message.urls)
  {
    let filter = defaultMatcher.matchesAny(
      new URL(url, message.baseURL),
      RegExpFilter.typeMap[message.mediatype],
      docDomain, sitekey, specificOnly
    );

    if (filter instanceof BlockingFilter)
      return true;
  }

  return false;
});

port.on("request.blockedByRTCWrapper", (msg, sender) =>
{
  let {page, frame} = sender;

  if (checkWhitelisted(page, frame))
    return false;

  let {url} = msg;
  let [docDomain, sitekey, specificOnly] = getDocumentInfo(page, frame);
  let filter = defaultMatcher.matchesAny(new URL(url),
                                         RegExpFilter.typeMap.WEBRTC,
                                         docDomain, sitekey, specificOnly);
  logRequest(
    [sender.page.id],
    {url, type: "WEBRTC", docDomain, sitekey, specificOnly},
    filter
  );

  return filter instanceof BlockingFilter;
});

let ignoreFilterNotifications = false;
let handlerBehaviorChangedQuota =
  browser.webRequest.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES;

function propagateHandlerBehaviorChange()
{
  // Make sure to not call handlerBehaviorChanged() more often than allowed
  // by browser.webRequest.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES.
  // Otherwise Chrome notifies the user that this extension is causing issues.
  if (handlerBehaviorChangedQuota > 0)
  {
    browser.webNavigation.onBeforeNavigate.removeListener(
      propagateHandlerBehaviorChange
    );
    browser.webRequest.handlerBehaviorChanged();
    handlerBehaviorChangedQuota--;
    setTimeout(() => { handlerBehaviorChangedQuota++; }, 600000);
  }
}

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
  if (arg instanceof Subscription && arg.filterCount == 0)
    return;

  // Ignore all types of filters but request filters,
  // only these have an effect on the handler behavior.
  if (arg instanceof Filter && !(arg instanceof RegExpFilter))
    return;

  ignoreFilterNotifications = true;
  setTimeout(() =>
  {
    // Defer handlerBehaviorChanged() until navigation occurs.
    // There wouldn't be any visible effect when calling it earlier,
    // but it's an expensive operation and that way we avoid to call
    // it multiple times, if multiple filters are added/removed.
    if (!browser.webNavigation.onBeforeNavigate
                              .hasListener(propagateHandlerBehaviorChange))
      browser.webNavigation.onBeforeNavigate
                           .addListener(propagateHandlerBehaviorChange);

    ignoreFilterNotifications = false;
    filterNotifier.emit("filter.behaviorChanged");
  });
}

filterNotifier.on("subscription.added", onFilterChange);
filterNotifier.on("subscription.removed", arg => onFilterChange(arg, false));
filterNotifier.on("subscription.updated", arg => onFilterChange(arg, false));
filterNotifier.on("subscription.disabled", arg => onFilterChange(arg, true));
filterNotifier.on("filter.added", onFilterChange);
filterNotifier.on("filter.removed", onFilterChange);
filterNotifier.on("filter.disabled", arg => onFilterChange(arg, true));
filterNotifier.on("ready", onFilterChange);
