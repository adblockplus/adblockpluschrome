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

/** @module cssInjection */

"use strict";

const {RegExpFilter} = require("filterClasses");
const {ElemHide} = require("elemHide");
const {ElemHideEmulation} = require("elemHideEmulation");
const {checkWhitelisted} = require("whitelisting");
const {extractHostFromFrame} = require("url");
const {port} = require("messaging");
const devtools = require("devtools");

const userStyleSheetsSupported = "extensionTypes" in browser &&
                                 "CSSOrigin" in browser.extensionTypes;

function hideElements(tabId, frameId, selectors)
{
  browser.tabs.insertCSS(tabId, {
    code: selectors.join(", ") + "{display: none !important;}",
    cssOrigin: "user",
    frameId,
    matchAboutBlank: true,
    runAt: "document_start"
  });
}

port.on("elemhide.getSelectors", (msg, sender) =>
{
  let selectors = [];
  let emulatedPatterns = [];
  let trace = devtools && devtools.hasPanel(sender.page);
  let inject = !userStyleSheetsSupported;

  if (!checkWhitelisted(sender.page, sender.frame,
                        RegExpFilter.typeMap.DOCUMENT |
                        RegExpFilter.typeMap.ELEMHIDE))
  {
    let hostname = extractHostFromFrame(sender.frame);
    let specificOnly = checkWhitelisted(sender.page, sender.frame,
                                        RegExpFilter.typeMap.GENERICHIDE);

    selectors = ElemHide.getSelectorsForDomain(
      hostname,
      specificOnly ? ElemHide.SPECIFIC_ONLY : ElemHide.ALL_MATCHING
    );

    for (let filter of ElemHideEmulation.getRulesForDomain(hostname))
      emulatedPatterns.push({selector: filter.selector, text: filter.text});
  }

  if (!inject && selectors.length > 0)
    hideElements(sender.page.id, sender.frame.id, selectors);

  let response = {trace, inject, emulatedPatterns};
  if (trace || inject)
    response.selectors = selectors;

  return response;
});

port.on("elemhide.injectSelectors", (msg, sender) =>
{
  hideElements(sender.page.id, sender.frame.id, msg.selectors);
});
