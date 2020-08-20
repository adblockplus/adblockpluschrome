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

/** @module hitLogger */

"use strict";

const {extractHostFromFrame} = require("./url");
const {EventEmitter} = require("../adblockpluscore/lib/events");
const {filterStorage} = require("../adblockpluscore/lib/filterStorage");
const {port} = require("./messaging");
const {Filter,
       ElemHideFilter} = require("../adblockpluscore/lib/filterClasses");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");

const nonRequestTypes = exports.nonRequestTypes = [
  "DOCUMENT", "ELEMHIDE", "SNIPPET", "GENERICBLOCK", "GENERICHIDE", "CSP"
];

let eventEmitter = new EventEmitter();

/**
 * @namespace
 * @static
 */
let HitLogger = exports.HitLogger = {
  /**
   * Adds a listener for requests, filter hits etc related to the tab.
   *
   * Note: Calling code is responsible for removing the listener again,
   *       it will not be automatically removed when the tab is closed.
   *
   * @param {number} tabId
   * @param {function} listener
   */
  addListener: eventEmitter.on.bind(eventEmitter),

  /**
   * Removes a listener for the tab.
   *
   * @param {number} tabId
   * @param {function} listener
   */
  removeListener: eventEmitter.off.bind(eventEmitter),

  /**
   * Checks whether a tab is being inspected by anything.
   *
   * @param {number} tabId
   * @return {boolean}
   */
  hasListener: eventEmitter.hasListeners.bind(eventEmitter)
};

/**
 * Logs a request associated with a tab or multiple tabs.
 *
 * @param {number[]} tabIds
 *   The tabIds associated with the request
 * @param {Object} request
 *   The request to log
 * @param {string} request.url
 *   The URL of the request
 * @param {string} request.type
 *  The request type
 * @param {string} request.docDomain
 *  The hostname of the document
 * @param {boolean} request.thirdParty
 *   Whether the origin of the request and document differs
 * @param {?string} request.sitekey
 *   The active sitekey if there is any
 * @param {?boolean} request.specificOnly
 *   Whether generic filters should be ignored
 * @param {?BlockingFilter} filter
 *  The matched filter or null if there is no match
 */
exports.logRequest = (tabIds, request, filter) =>
{
  for (let tabId of tabIds)
    eventEmitter.emit(tabId, request, filter);
};

function logHiddenElements(tabId, selectors, filters, docDomain)
{
  if (HitLogger.hasListener(tabId))
  {
    for (let subscription of filterStorage.subscriptions())
    {
      if (subscription.disabled)
        continue;

      for (let text of subscription.filterText())
      {
        let filter = Filter.fromText(text);

        // We only know the exact filter in case of element hiding emulation.
        // For regular element hiding filters, the content script only knows
        // the selector, so we have to find a filter that has an identical
        // selector and is active on the domain the match was reported from.
        let isActiveElemHideFilter = filter instanceof ElemHideFilter &&
                                     selectors.includes(filter.selector) &&
                                     filter.isActiveOnDomain(docDomain);

        if (isActiveElemHideFilter || filters.includes(text))
          eventEmitter.emit(tabId, {type: "ELEMHIDE", docDomain}, filter);
      }
    }
  }
}

/**
 * Logs an allowing filter that disables (some kind of)
 * blocking for a particular document.
 *
 * @param {number}       tabId     The tabId the allowlisting is active for
 * @param {string}       url       The url of the allowlisted document
 * @param {number}       typeMask  The bit mask of allowing types checked
 *                                 for
 * @param {string}       docDomain The hostname of the parent document
 * @param {AllowingFilter} filter  The matched allowing filter
 */
exports.logAllowlistedDocument = (tabId, url, typeMask, docDomain, filter) =>
{
  if (HitLogger.hasListener(tabId))
  {
    for (let type of nonRequestTypes)
    {
      if (typeMask & filter.contentType & contentTypes[type])
        eventEmitter.emit(tabId, {url, type, docDomain}, filter);
    }
  }
};

/**
 * Logs active element hiding filters for a tab.
 *
 * @event "hitLogger.traceElemHide"
 * @property {string[]} selectors  The selectors of applied ElemHideFilters
 * @property {string[]} filters    The text of applied ElemHideEmulationFilters
 */
port.on("hitLogger.traceElemHide", (message, sender) =>
{
  logHiddenElements(
    sender.page.id, message.selectors, message.filters,
    extractHostFromFrame(sender.frame)
  );
});
