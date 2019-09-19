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

/** @module contentFiltering */

"use strict";

const {RegExpFilter} = require("../adblockpluscore/lib/filterClasses");
const {elemHide, createStyleSheet,
       rulesFromStyleSheet} = require("../adblockpluscore/lib/elemHide");
const {elemHideEmulation} = require("../adblockpluscore/lib/elemHideEmulation");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {snippets, compileScript} = require("../adblockpluscore/lib/snippets");
const {checkWhitelisted} = require("./whitelisting");
const {extractHostFromFrame} = require("./url");
const {port} = require("./messaging");
const {HitLogger, logRequest} = require("./hitLogger");
const info = require("info");

// Chromium's support for tabs.removeCSS is still a work in progress and the
// API is likely to be different from Firefox's; for now we just don't use it
// at all, even if it's available.
// See https://crbug.com/608854
const styleSheetRemovalSupported = info.platform == "gecko";

let userStyleSheetsSupported = true;

let snippetsLibrarySource = "";
let executableCode = new Map();

function addStyleSheet(tabId, frameId, styleSheet)
{
  try
  {
    let promise = browser.tabs.insertCSS(tabId, {
      code: styleSheet,
      cssOrigin: "user",
      frameId,
      matchAboutBlank: true,
      runAt: "document_start"
    });

    // See error handling notes in the catch block.
    promise.catch(() => {});
  }
  catch (error)
  {
    // If the error is about the "cssOrigin" option, this is an older version
    // of Chromium (65 and below) or Firefox (52 and below) that does not
    // support user style sheets.
    if (/\bcssOrigin\b/.test(error.message))
      userStyleSheetsSupported = false;

    // For other errors, we simply return false to indicate failure.
    //
    // One common error that occurs frequently is when a frame is not found
    // (e.g. "Error: No frame with id 574 in tab 266"), which can happen when
    // the code in the parent document has removed the frame before the
    // background page has had a chance to respond to the content script's
    // "content.applyFilters" message. We simply ignore such errors, because
    // otherwise they show up in the log too often and make debugging
    // difficult.
    //
    // Also note that the missing frame error is thrown synchronously on
    // Firefox, while on Chromium it is an asychronous promise rejection. In
    // the latter case, we cannot indicate failure to the caller, but we still
    // explicitly ignore the error.
    return false;
  }

  return true;
}

function removeStyleSheet(tabId, frameId, styleSheet)
{
  if (!styleSheetRemovalSupported)
    return;

  browser.tabs.removeCSS(tabId, {
    code: styleSheet,
    cssOrigin: "user",
    frameId,
    matchAboutBlank: true
  });
}

function updateFrameStyles(tabId, frameId, styleSheet, groupName = "standard",
                           appendOnly = false)
{
  let frame = ext.getFrame(tabId, frameId);
  if (!frame)
    return false;

  if (!frame.state.injectedStyleSheets)
    frame.state.injectedStyleSheets = new Map();

  let oldStyleSheet = frame.state.injectedStyleSheets.get(groupName);

  if (appendOnly && oldStyleSheet)
    styleSheet = oldStyleSheet + styleSheet;

  // Ideally we would compare the old and new style sheets and skip this code
  // if they're the same. But first we need to ensure that there are no edge
  // cases that would cause the old style sheet to be a leftover from a
  // previous instance of the frame (see issue #7180). For now, we add the new
  // style sheet regardless.

  // Add the new style sheet first to keep previously hidden elements from
  // reappearing momentarily.
  if (styleSheet && !addStyleSheet(tabId, frameId, styleSheet))
    return false;

  // Sometimes the old and new style sheets can be exactly the same. In such a
  // case, do not remove the "old" style sheet, because it is in fact the new
  // style sheet now.
  if (oldStyleSheet && oldStyleSheet != styleSheet)
    removeStyleSheet(tabId, frameId, oldStyleSheet);

  // The standard style sheet is ~660 KB per frame (as of Adblock Plus 3.3.2).
  // Keeping it in memory would only really be useful on Firefox, which allows
  // us to remove it via the tabs.removeCSS API. By choosing not to hold on to
  // it, we save potentially several megabytes per tab (#6967).
  if (groupName != "standard")
    frame.state.injectedStyleSheets.set(groupName, styleSheet);
  return true;
}

function getExecutableCode(script)
{
  let code = executableCode.get(script);
  if (code)
    return code;

  code = compileScript(script, [snippetsLibrarySource]);

  executableCode.set(script, code);
  return code;
}

function executeScript(script, tabId, frameId)
{
  try
  {
    let details = {
      code: getExecutableCode(script),
      matchAboutBlank: true,
      runAt: "document_start"
    };

    // Microsoft Edge throws when passing frameId to tabs.executeScript
    // and always executes code in the context of the top-level frame,
    // so for sub-frames we let it fail.
    if (frameId != 0)
      details.frameId = frameId;

    return browser.tabs.executeScript(tabId, details).catch(error =>
    {
      // Sometimes a frame is added and removed very quickly, in such cases we
      // simply ignore the error.
      if (error.message == "The frame was removed.")
        return;

      // Sometimes the frame in question is just not found. We don't know why
      // this is exactly, but we simply ignore the error.
      if (/^No frame with id \d+ in tab \d+\.$/.test(error.message))
        return;

      throw error;
    });
  }
  catch (error)
  {
    // See the comment in the catch block associated with the call to
    // tabs.insertCSS for why we catch any error here and simply
    // return a rejected promise.
    return Promise.reject(error);
  }
}

port.on("content.applyFilters", (message, sender) =>
{
  let styleSheet = {code: "", selectors: []};
  let emulatedPatterns = [];
  let trace = HitLogger.hasListener(sender.page.id);
  let inline = !userStyleSheetsSupported;

  let filterTypes = message.filterTypes || {elemhide: true, snippets: true};

  if (!checkWhitelisted(sender.page, sender.frame, null,
                        RegExpFilter.typeMap.DOCUMENT))
  {
    let docDomain = extractHostFromFrame(sender.frame);

    if (filterTypes.snippets)
    {
      for (let filter of snippets.getFiltersForDomain(docDomain))
      {
        executeScript(filter.script, sender.page.id, sender.frame.id).then(() =>
        {
          let tabIds = [sender.page.id];
          if (filter)
            filterNotifier.emit("filter.hitCount", filter, 0, 0, tabIds);

          logRequest(tabIds, {
            url: sender.frame.url.href,
            type: "SNIPPET",
            docDomain
          }, filter);
        });
      }
    }

    if (filterTypes.elemhide &&
        !checkWhitelisted(sender.page, sender.frame, null,
                          RegExpFilter.typeMap.ELEMHIDE))
    {
      let specificOnly = checkWhitelisted(sender.page, sender.frame, null,
                                          RegExpFilter.typeMap.GENERICHIDE);
      styleSheet = elemHide.generateStyleSheetForDomain(docDomain, specificOnly,
                                                        trace, trace);

      for (let filter of elemHideEmulation.getRulesForDomain(docDomain))
        emulatedPatterns.push({selector: filter.selector, text: filter.text});
    }
  }

  if (!inline && !updateFrameStyles(sender.page.id, sender.frame.id,
                                    styleSheet.code))
  {
    inline = true;
  }

  let response = {trace, inline, emulatedPatterns};

  if (inline)
    response.rules = [...rulesFromStyleSheet(styleSheet.code)];

  if (trace)
  {
    response.selectors = styleSheet.selectors;
    response.exceptions = styleSheet.exceptions.map(({text, selector}) =>
                                                    ({text, selector}));
  }

  return response;
});

port.on("content.injectSelectors", (message, sender) =>
{
  let styleSheet = createStyleSheet(message.selectors);
  if (!userStyleSheetsSupported ||
      !updateFrameStyles(sender.page.id, sender.frame.id, styleSheet,
                         message.groupName, message.appendOnly))
  {
    return [...rulesFromStyleSheet(styleSheet)];
  }
});

fetch(browser.extension.getURL("/snippets.js"), {cache: "no-cache"})
.then(response => response.ok ? response.text() : "")
.then(text =>
{
  snippetsLibrarySource = text;
});
