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
const {checkWhitelisted} = require("whitelisting");
const {extractHostFromFrame} = require("url");
const {port} = require("messaging");
const devtools = require("devtools");

let userStylesheetsSupported = true;

function hideElements(tabId, frameId, selectors)
{
  let code = selectors.join(", ") + "{display: none !important;}";

  try
  {
    chrome.tabs.insertCSS(tabId,
      {
        code,
        cssOrigin: "user",
        frameId,
        matchAboutBlank: true
      }
    );
    return true;
  }
  catch (error)
  {
    if (/\bError processing cssOrigin\b/.test(error.message) == -1)
      throw error;

    userStylesheetsSupported = false;
    return false;
  }
}

port.on("elemhide.getSelectors", (msg, sender) =>
{
  let selectors;
  let trace = devtools && devtools.hasPanel(sender.page);

  if (!checkWhitelisted(sender.page, sender.frame,
                        RegExpFilter.typeMap.DOCUMENT |
                        RegExpFilter.typeMap.ELEMHIDE))
  {
    let specificOnly = checkWhitelisted(sender.page, sender.frame,
                                        RegExpFilter.typeMap.GENERICHIDE);
    selectors = ElemHide.getSelectorsForDomain(
      extractHostFromFrame(sender.frame),
      specificOnly ? ElemHide.SPECIFIC_ONLY : ElemHide.ALL_MATCHING
    );
  }
  else
  {
    selectors = [];
  }

  if (selectors.length == 0 || userStylesheetsSupported &&
      hideElements(sender.page.id, sender.frame.id, selectors))
  {
    if (trace)
      return {selectors, trace: true, inject: false};

    return {trace: false, inject: false};
  }

  return {selectors, trace, inject: true};
});

port.on("elemhide.injectSelectors", (msg, sender) =>
{
  return hideElements(sender.page.id, sender.frame.id, msg.selectors);
});
