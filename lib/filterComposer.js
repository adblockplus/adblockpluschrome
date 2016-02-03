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

let {extractHostFromFrame, stringifyURL, isThirdParty} = require("url");
let {getKey, checkWhitelisted} = require("whitelisting");
let {defaultMatcher} = require("matcher");
let {RegExpFilter} = require("filterClasses");

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

/**
 * Generates filters to block an element.
 * @param {Object}   details
 * @param {string}   details.tagName  The element's tag name
 * @param {string}   details.id       The element's "id" attribute
 * @param {string}   details.src      The element's "src" attribute
 * @param {string}   details.style    The element's "style" attribute
 * @param {string[]} details.classes  The classes given by the element's "class" attribute
 * @param {string[]} details.urls     The URLs considered when loading the element
 * @param {string}   details.type     The request type (will be ignored if there are no URLs)
 * @param {string}   details.baseURL  The URL of the document containing the element
 * @param {Page}     details.page     The page containing the element
 * @param {Frame}    details.frame    The frame containing the element
 *
 * @return {object} An object holding the list of generated filters and
 *                  the list of CSS selectors for the included element
 *                  hiding filters: {filters: [...], selectors: [...]}
 */
exports.composeFilters = function(details)
{
  let filters = [];
  let selectors = [];

  let page = details.page;
  let frame = details.frame;

  if (!checkWhitelisted(page, frame))
  {
    let typeMask = RegExpFilter.typeMap[details.type];
    let docDomain = extractHostFromFrame(frame);

    // Add a blocking filter for each URL of the element that can be blocked
    for (let url of details.urls)
    {
      let urlObj = new URL(url, details.baseURL);
      url = stringifyURL(urlObj);

      let filter = defaultMatcher.whitelist.matchesAny(
        url, typeMask, docDomain,
        isThirdParty(urlObj, docDomain),
        getKey(page, frame)
      );

      if (!filter)
      {
        let filterText = url.replace(/^[\w\-]+:\/+(?:www\.)?/, "||");

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
};
