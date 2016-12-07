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

/** @module filterComposer */

"use strict";

let {defaultMatcher} = require("matcher");
let {RegExpFilter} = require("filterClasses");
let {FilterNotifier} = require("filterNotifier");
let {Prefs} = require("prefs");
let {extractHostFromFrame, stringifyURL, isThirdParty} = require("url");
let {getKey, checkWhitelisted} = require("whitelisting");
let {port} = require("messaging");

let readyPages = new ext.PageMap();

/**
 * Checks whether the given page is ready to use the filter composer
 *
 * @param {Page} page
 * @return {boolean}
 */
exports.isPageReady = function(page)
{
  return readyPages.has(page);
};

function isValidString(s) {
  return s && s.indexOf("\0") == -1;
}

function escapeChar(chr)
{
  let code = chr.charCodeAt(0);

  // Control characters and leading digits must be escaped based on
  // their char code in CSS. Moreover, curly brackets aren't allowed
  // in elemhide filters, and therefore must be escaped based on their
  // char code as well.
  if (code <= 0x1F || code == 0x7F || /[\d\{\}]/.test(chr))
    return "\\" + code.toString(16) + " ";

  return "\\" + chr;
}

let escapeCSS =
/**
 * Escapes a token (e.g. tag, id, class or attribute) to be used in CSS selectors.
 *
 * @param {string} s
 * @return {string}
 * @static
 */
exports.escapeCSS = function(s)
{
  return s.replace(/^[\d\-]|[^\w\-\u0080-\uFFFF]/g, escapeChar);
};

let quoteCSS =
/**
 * Quotes a string to be used as attribute value in CSS selectors.
 *
 * @param {string} value
 * @return {string}
 * @static
 */
exports.quoteCSS = function(value)
{
  return '"' + value.replace(/["\\\{\}\x00-\x1F\x7F]/g, escapeChar) + '"';
};

function composeFilters(details)
{
  let filters = [];
  let selectors = [];

  let page = details.page;
  let frame = details.frame;

  if (!checkWhitelisted(page, frame))
  {
    let typeMask = RegExpFilter.typeMap[details.type];
    let docDomain = extractHostFromFrame(frame);
    let specificOnly = checkWhitelisted(page, frame, RegExpFilter.typeMap.GENERICBLOCK);

    // Add a blocking filter for each URL of the element that can be blocked
    for (let url of details.urls)
    {
      let urlObj = new URL(url, details.baseURL);
      url = stringifyURL(urlObj);

      let filter = defaultMatcher.whitelist.matchesAny(
        url, typeMask, docDomain,
        isThirdParty(urlObj, docDomain),
        getKey(page, frame), specificOnly
      );

      if (!filter)
      {
        let filterText = url.replace(/^[\w\-]+:\/+(?:www\.)?/, "||");

        if (specificOnly)
          filterText += "$domain=" + docDomain;

        if (filters.indexOf(filterText) == -1)
          filters.push(filterText);
      }
    }

    // If we couldn't generate any blocking filters, fallback to element hiding
    let selectors = [];
    if (filters.length == 0 && !checkWhitelisted(page, frame, RegExpFilter.typeMap.ELEMHIDE))
    {
      // Generate CSS selectors based on the element's "id" and "class" attribute
      if (isValidString(details.id))
        selectors.push("#" + escapeCSS(details.id));

      let classes = details.classes.filter(isValidString);
      if (classes.length > 0)
        selectors.push(classes.map(c => "." + escapeCSS(c)).join(""));

      // If there is a "src" attribute, specifiying a URL that we can't block,
      // generate a CSS selector matching the "src" attribute
      if (isValidString(details.src))
        selectors.push(escapeCSS(details.tagName) + "[src=" + quoteCSS(details.src) + "]");

      // As last resort, if there is a "style" attribute, and we couldn't generate
      // any filters so far, generate a CSS selector matching the "style" attribute
      if (isValidString(details.style) && selectors.length == 0 && filters.length == 0)
        selectors.push(escapeCSS(details.tagName) + "[style=" + quoteCSS(details.style) + "]");

      // Add an element hiding filter for each generated CSS selector
      for (let selector of selectors)
        filters.push(docDomain.replace(/^www\./, "") + "##" + selector);
    }
  }

  return {filters: filters, selectors: selectors};
}

let contextMenuItem = {
  title: ext.i18n.getMessage("block_element"),
  contexts: ["image", "video", "audio"],
  onclick: page =>
  {
    page.sendMessage({type: "composer.content.contextMenuClicked"});
  }
};

function updateContextMenu(page, filter)
{
  page.contextMenus.remove(contextMenuItem);

  if (typeof filter == "undefined")
    filter = checkWhitelisted(page);
  if (!filter && Prefs.shouldShowBlockElementMenu && readyPages.has(page))
    page.contextMenus.create(contextMenuItem);
}

FilterNotifier.on("page.WhitelistingStateRevalidate", updateContextMenu);

Prefs.on("shouldShowBlockElementMenu", () =>
{
  ext.pages.query({}, pages =>
  {
    for (let page of pages)
      updateContextMenu(page);
  });
});

port.on("composer.ready", (message, sender) =>
{
  readyPages.set(sender.page, null);
  updateContextMenu(sender.page);
});

port.on("composer.openDialog", (message, sender) =>
{
  return new Promise(resolve =>
  {
    ext.windows.create({
      url: ext.getURL("composer.html"),
      left: 50,
      top: 50,
      width: 420,
      height: 200,
      type: "popup"
    },
    popupPage =>
    {
      let popupPageId = popupPage.id;
      function onRemoved(removedPageId)
      {
        if (popupPageId == removedPageId)
        {
          sender.page.sendMessage({
            type: "composer.content.dialogClosed",
            popupId: popupPageId
          });
          ext.pages.onRemoved.removeListener(onRemoved);
        }
      }
      ext.pages.onRemoved.addListener(onRemoved);
      resolve(popupPageId);
    });
  });
});

port.on("composer.getFilters", (message, sender) =>
{
  return composeFilters({
    tagName: message.tagName,
    id:      message.id,
    src:     message.src,
    style:   message.style,
    classes: message.classes,
    urls:    message.urls,
    type:    message.mediatype,
    baseURL: message.baseURL,
    page:    sender.page,
    frame:   sender.frame
  });
});

ext.pages.onLoading.addListener(page =>
{
  page.sendMessage({type: "composer.content.finished"});
});
