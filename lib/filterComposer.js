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

/** @module filterComposer */

"use strict";

const {defaultMatcher} = require("../adblockpluscore/lib/matcher");
const {contentTypes} = require("../adblockpluscore/lib/contentTypes");
const {filterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {Prefs} = require("./prefs");
const {extractHostFromFrame} = require("./url");
const {getKey, checkAllowlisted} = require("./allowlisting");
const {port} = require("./messaging");
const info = require("info");

function isValidString(s)
{
  return s && s.indexOf("\0") == -1;
}

function escapeChar(chr)
{
  let code = chr.charCodeAt(0);

  // Control characters and leading digits must be escaped based on
  // their char code in CSS. Moreover, curly brackets aren't allowed
  // in elemhide filters, and therefore must be escaped based on their
  // char code as well.
  if (code <= 0x1F || code == 0x7F || /[\d{}]/.test(chr))
    return "\\" + code.toString(16) + " ";

  return "\\" + chr;
}

let escapeCSS =
/**
 * Escapes a token (e.g. tag, id, class or attribute) to be used in
 * CSS selectors.
 *
 * @param {string} s
 * @return {string}
 * @static
 */
exports.escapeCSS = s =>
{
  return s.replace(/^[\d-]|[^\w\-\u0080-\uFFFF]/g, escapeChar);
};

let quoteCSS =
/**
 * Quotes a string to be used as attribute value in CSS selectors.
 *
 * @param {string} value
 * @return {string}
 * @static
 */
exports.quoteCSS = value =>
{
  return '"' + value.replace(/["\\{}\x00-\x1F\x7F]/g, escapeChar) + '"';
};

function composeFilters(details)
{
  let {page, frame} = details;
  let filters = [];
  let selectors = [];

  if (!checkAllowlisted(page, frame))
  {
    let docDomain = extractHostFromFrame(frame);

    // Add a blocking filter for each URL of the element that can be blocked
    if (details.url)
    {
      let typeMask;
      switch (details.tagName)
      {
        case "img":
        case "input":
          typeMask = contentTypes.IMAGE;
          break;
        case "audio":
        case "video":
          typeMask = contentTypes.MEDIA;
          break;
        case "frame":
        case "iframe":
          typeMask = contentTypes.SUBDOCUMENT;
          break;
        case "object":
        case "embed":
          typeMask = contentTypes.OBJECT;
          break;
      }

      let specificOnly = checkAllowlisted(
        page, frame, null, contentTypes.GENERICBLOCK
      );
      let allowlisted = defaultMatcher.isAllowlisted(
        details.url, typeMask, docDomain,
        getKey(page, frame), specificOnly
      );

      if (!allowlisted)
      {
        let filterText = details.url.replace(/^[\w-]+:\/+(?:www\.)?/, "||");

        if (specificOnly)
          filterText += "$domain=" + docDomain;

        if (!filters.includes(filterText))
          filters.push(filterText);
      }
    }

    // If we couldn't generate any blocking filters, fallback to element hiding
    if (filters.length == 0 && !checkAllowlisted(page, frame, null,
                                                 contentTypes.ELEMHIDE))
    {
      // Generate CSS selectors based on the element's "id" and
      // "class" attribute.
      if (isValidString(details.id))
        selectors.push("#" + escapeCSS(details.id));

      let classes = details.classes.filter(isValidString);
      if (classes.length > 0)
        selectors.push(classes.map(c => "." + escapeCSS(c)).join(""));

      // If there is a "src" attribute, specifiying a URL that we can't block,
      // generate a CSS selector matching the "src" attribute
      if (isValidString(details.src))
      {
        selectors.push(
          escapeCSS(details.tagName) + "[src=" + quoteCSS(details.src) + "]"
        );
      }

      // As last resort, if there is a "style" attribute, and we
      // couldn't generate any filters so far, generate a CSS selector
      // matching the "style" attribute
      if (isValidString(details.style) && selectors.length == 0 &&
          filters.length == 0)
      {
        selectors.push(
          escapeCSS(details.tagName) + "[style=" + quoteCSS(details.style) + "]"
        );
      }

      // Add an element hiding filter for each generated CSS selector
      for (let selector of selectors)
        filters.push(docDomain.replace(/^www\./, "") + "##" + selector);
    }
  }

  return {filters, selectors};
}

/**
 * Opens the "block element" dialog.
 *
 * @event "composer.openDialog"
 * @property {string[]} filters - The suggested filters to populate the dialog
 *                                with.
 * @returns {?number} dialog window's page ID
 */
port.on("composer.openDialog", (message, sender) =>
{
  return browser.windows.create({
    url: browser.extension.getURL("composer.html"),
    left: 50,
    top: 50,
    width: 600,
    height: 300,
    type: "popup"
  }).then(window =>
  {
    // The windows.create API with versions of Firefox < 52 doesn't seem to
    // populate the tabs property reliably.
    if ("tabs" in window)
      return window;
    return browser.windows.get(window.id, {populate: true});
  }).then(window =>
  {
    let popupPageId = window.tabs[0].id;

    let doInitAttempt = 0;
    let doInit = () =>
    {
      doInitAttempt += 1;
      if (doInitAttempt > 30)
        return;

      browser.tabs.sendMessage(popupPageId, {
        type: "composer.dialog.init",
        sender: sender.page.id,
        filters: message.filters,
        highlights: message.highlights
      }).then(response =>
      {
        // Sometimes sendMessage incorrectly reports a success on Firefox, so
        // we must check the response too.
        if (!response)
          throw new Error();

        // Sometimes Firefox <63 doesn't draw the window's contents[1]
        // initially, so we resize the window slightly as a workaround.
        // [1] - https://bugzilla.mozilla.org/show_bug.cgi?id=1408446
        if (info.application == "firefox")
          browser.windows.update(window.id, {width: window.width + 2});
      }).catch(e =>
      {
        // Firefox sometimes sets the status for a window to "complete" before
        // it is ready to receive messages[1]. As a workaround we'll try again a
        // few times with a second delay.
        // [1] - https://bugzilla.mozilla.org/show_bug.cgi?id=1418655
        setTimeout(doInit, 100);
      });
    };
    if (window.tabs[0].status != "complete")
    {
      let updateListener = (tabId, changeInfo, tab) =>
      {
        if (tabId == popupPageId && changeInfo.status == "complete")
        {
          browser.tabs.onUpdated.removeListener(updateListener);
          doInit();
        }
      };
      browser.tabs.onUpdated.addListener(updateListener);
    }
    else
    {
      doInit();
    }

    let onRemoved = removedTabId =>
    {
      if (removedTabId == popupPageId)
      {
        browser.tabs.sendMessage(sender.page.id, {
          type: "composer.content.dialogClosed",
          popupId: popupPageId
        });
        browser.tabs.onRemoved.removeListener(onRemoved);
      }
    };
    browser.tabs.onRemoved.addListener(onRemoved);

    return popupPageId;
  });
});

/**
 * @typedef {object} composerGetFiltersResult
 * @property {string[]} filters
 *   Array of blocking filters which should block the element.
 * @property {string[]} selectors
 *   Array of CSS selectors which should hide the element, a fallback if
 *   blocking wasn't possible.
 */

/**
 * Given the details of an element, return suggested filters or CSS selectors
 * to block or hide that element.
 *
 * @event "composer.getFilters"
 * @property {string} tagName - The element's tag name e.g. "a".
 * @property {string} id - The element's id attribute.
 * @property {string} [src] - The element's src attribute.
 * @property {string} [style] - The element's style attribute.
 * @property {string[]} classes - The element's class list.
 * @property {string?} url - The URL associated with the element.
 * @returns {composerGetFiltersResult}
 */
port.on("composer.getFilters", (message, sender) =>
{
  return composeFilters({
    tagName: message.tagName,
    id: message.id,
    src: message.src,
    style: message.style,
    classes: message.classes,
    url: message.url,
    page: sender.page,
    frame: sender.frame
  });
});

/**
 * Forwards the given message payload to the given page ID, allowing a content
 * script to send a message to another page's content script.
 *
 * @event "composer.forward"
 * @property {number} targetPageId The ID of the page to forward the message.
 * @property {object} payload The contents of the message to forward.
 * @returns The response from the forwarded message's recipient.
 */
port.on("composer.forward", (msg, sender) =>
{
  let targetPage;
  if (msg.targetPageId)
    targetPage = ext.getPage(msg.targetPageId);
  else
    targetPage = sender.page;
  if (targetPage)
  {
    msg.payload.sender = sender.page.id;
    return browser.tabs.sendMessage(targetPage.id, msg.payload);
  }
});

ext.pages.onLoading.addListener(page =>
{
  // When tabs start loading we send them a message to ensure that the state
  // of the "block element" tool is reset. This is necessary since Firefox will
  // sometimes cache the state of a tab when the user navigates back / forward,
  // which includes the state of the "block element" tool.
  // Since sending this message will often fail (e.g. for new tabs which have
  // just been opened) we catch and ignore any exception thrown.
  browser.tabs.sendMessage(
    page.id, {type: "composer.content.finished"}
  ).catch(() => {});
});


/* Context menu and popup button */

let readyActivePages = new ext.PageMap();
let showingContextMenu = false;

if ("contextMenus" in browser)
{
  browser.contextMenus.onClicked.addListener((itemInfo, tab) =>
  {
    if (itemInfo.menuItemId == "block_element")
    {
      browser.tabs.sendMessage(
        tab.id, {type: "composer.content.contextMenuClicked"}
      );
    }
  });
}

function showOrHideContextMenu(activePage)
{
  // Firefox for Android does not support browser.contextMenus.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1269062
  if (!("contextMenus" in browser))
    return;

  let shouldShowContextMenu = Prefs.shouldShowBlockElementMenu &&
                                readyActivePages.get(activePage);

  if (shouldShowContextMenu && !showingContextMenu)
  {
    browser.contextMenus.create({
      id: "block_element",
      title: browser.i18n.getMessage("block_element"),
      contexts: ["image", "video", "audio"]
    });
    showingContextMenu = true;
  }
  else if (!shouldShowContextMenu && showingContextMenu)
  {
    browser.contextMenus.remove("block_element");
    showingContextMenu = false;
  }
}

function updateContextMenu(updatedPage)
{
  browser.tabs.query({active: true, lastFocusedWindow: true}).then(tabs =>
  {
    if (tabs.length > 0 && (!updatedPage || updatedPage.id == tabs[0].id))
      showOrHideContextMenu(updatedPage || new ext.Page(tabs[0]));
  });
}

browser.tabs.onActivated.addListener(activeInfo =>
{
  showOrHideContextMenu(new ext.Page({id: activeInfo.tabId}));
});

// Firefox for Android does not support browser.windows.
// https://issues.adblockplus.org/ticket/5347
if ("windows" in browser)
{
  browser.windows.onFocusChanged.addListener(windowId =>
  {
    if (windowId != browser.windows.WINDOW_ID_NONE)
      updateContextMenu();
  });
}

filterNotifier.on("page.AllowlistingStateRevalidate", (page, filter) =>
{
  if (readyActivePages.has(page))
  {
    readyActivePages.set(page, !filter);
    updateContextMenu(page);
  }
});

Prefs.on("shouldShowBlockElementMenu", () =>
{
  updateContextMenu();
});

/**
 * Returns true if the given page is ready for the "block element" tool, false
 * otherwise.
 *
 * @event "composer.isPageReady"
 * @property {number} pageId
 * @returns {boolean}
 */
port.on("composer.isPageReady", (message, sender) =>
{
  return readyActivePages.has(new ext.Page({id: message.pageId}));
});

/**
 * Marks the page which sent this message as being ready for the
 * "block element" tool, but only if the page isn't allowlisted.
 *
 * @event "composer.ready"
 * @returns {boolean}
 */
port.on("composer.ready", (message, sender) =>
{
  readyActivePages.set(sender.page, !checkAllowlisted(sender.page));
  updateContextMenu(sender.page);
});
