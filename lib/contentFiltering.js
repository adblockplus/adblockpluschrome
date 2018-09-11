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
const {ElemHide} = require("../adblockpluscore/lib/elemHide");
const {ElemHideEmulation} = require("../adblockpluscore/lib/elemHideEmulation");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {Snippets, compileScript} = require("../adblockpluscore/lib/snippets");
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

const selectorGroupSize = 1024;

let userStyleSheetsSupported = true;

let snippetsLibrarySource = "";
let executableCode = new Map();

function* splitSelectors(selectors)
{
  // Chromium's Blink engine supports only up to 8,192 simple selectors, and
  // even fewer compound selectors, in a rule. The exact number of selectors
  // that would work depends on their sizes (e.g. "#foo .bar" has a size of 2).
  // Since we don't know the sizes of the selectors here, we simply split them
  // into groups of 1,024, based on the reasonable assumption that the average
  // selector won't have a size greater than 8. The alternative would be to
  // calculate the sizes of the selectors and divide them up accordingly, but
  // this approach is more efficient and has worked well in practice. In theory
  // this could still lead to some selectors not working on Chromium, but it is
  // highly unlikely.
  // See issue #6298 and https://crbug.com/804179
  for (let i = 0; i < selectors.length; i += selectorGroupSize)
    yield selectors.slice(i, i + selectorGroupSize);
}

function* createRules(selectors)
{
  for (let selectorGroup of splitSelectors(selectors))
    yield selectorGroup.join(", ") + " {display: none !important;}";
}

function createStyleSheet(selectors)
{
  return Array.from(createRules(selectors)).join("\n");
}

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

function updateFrameStyles(tabId, frameId, selectors, groupName, appendOnly)
{
  let styleSheet = "";
  if (selectors.length > 0)
    styleSheet = createStyleSheet(selectors);

  let frame = ext.getFrame(tabId, frameId);
  if (!frame)
    return false;

  if (!frame.injectedStyleSheets)
    frame.injectedStyleSheets = new Map();

  let oldStyleSheet = frame.injectedStyleSheets.get(groupName);

  if (appendOnly && oldStyleSheet)
    styleSheet = oldStyleSheet + styleSheet;

  // Ideally we would compare the old and new style sheets and skip this code
  // if they're the same, but the old style sheet can be a leftover from a
  // previous instance of the frame. We must add the new style sheet
  // regardless.

  // Add the new style sheet first to keep previously hidden elements from
  // reappearing momentarily.
  if (styleSheet && !addStyleSheet(tabId, frameId, styleSheet))
    return false;

  // Sometimes the old and new style sheets can be exactly the same. In such a
  // case, do not remove the "old" style sheet, because it is in fact the new
  // style sheet now.
  if (oldStyleSheet && oldStyleSheet != styleSheet)
    removeStyleSheet(tabId, frameId, oldStyleSheet);

  frame.injectedStyleSheets.set(groupName, styleSheet);
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

    // Chrome <50 throws an exception if chrome.tabs.executeScript is called
    // with a frameId of 0.
    if (frameId != 0)
      details.frameId = frameId;

    return browser.tabs.executeScript(tabId, details)
    .catch(error =>
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
  let selectors = [];
  let emulatedPatterns = [];
  let trace = HitLogger.hasListener(sender.page.id);
  let inline = !userStyleSheetsSupported;

  let {elemhide, snippets} = message.filterTypes ||
                             {elemhide: true, snippets: true};

  if (!checkWhitelisted(sender.page, sender.frame, null,
                        RegExpFilter.typeMap.DOCUMENT))
  {
    let docDomain = extractHostFromFrame(sender.frame);

    if (snippets)
    {
      for (let filter of Snippets.getFiltersForDomain(docDomain))
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

    if (elemhide && !checkWhitelisted(sender.page, sender.frame, null,
                                      RegExpFilter.typeMap.ELEMHIDE))
    {
      let specificOnly = checkWhitelisted(sender.page, sender.frame, null,
                                          RegExpFilter.typeMap.GENERICHIDE);
      selectors = ElemHide.getSelectorsForDomain(docDomain, specificOnly);

      for (let filter of ElemHideEmulation.getRulesForDomain(docDomain))
        emulatedPatterns.push({selector: filter.selector, text: filter.text});
    }
  }

  if (!inline && !updateFrameStyles(sender.page.id, sender.frame.id,
                                    selectors, "standard"))
  {
    inline = true;
  }

  let response = {trace, inline, emulatedPatterns};
  if (trace || inline)
    response.selectors = selectors;

  // If we can't remove user style sheets using tabs.removeCSS, we'll only keep
  // adding them, which could cause problems with emulation filters as
  // described in issue #5864. Instead, we can just ask the content script to
  // add styles for emulation filters inline.
  if (!styleSheetRemovalSupported)
    response.inlineEmulated = true;

  return response;
});

port.on("elemhide.injectSelectors", (message, sender) =>
{
  updateFrameStyles(sender.page.id, sender.frame.id, message.selectors,
                    message.groupName, message.appendOnly);
});

fetch(browser.extension.getURL("/snippets.js"), {cache: "no-cache"})
.then(response => response.ok ? response.text() : "")
.then(text =>
{
  snippetsLibrarySource = text;
});
