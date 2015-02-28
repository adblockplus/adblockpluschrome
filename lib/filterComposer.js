/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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

let {getDecodedHostname, stringifyURL} = require("url");

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

/**
 * Escapes a token (e.g. tag, id, class or attribute) to be used in CSS selectors.
 *
 * @param {string} s
 * @return {string}
 */
function escapeCSS(s)
{
  return s.replace(/^[\d\-]|[^\w\-\u0080-\uFFFF]/g, escapeChar);
}
exports.escapeCSS = escapeCSS;

/**
 * Quotes a string to be used as attribute value in CSS selectors.
 *
 * @param {string} value
 * @return {string}
 */
function quoteCSS(value)
{
  return '"' + value.replace(/["\\\{\}\x00-\x1F\x7F]/g, escapeChar) + '"';
}
exports.quoteCSS = quoteCSS;

function canBlockURL(url)
{
  return url.protocol == "http:" || url.protocol == "https:";
}

/**
 * Generates filters to block an element.
 *
 * @param {string}   tagName  The element's tag name
 * @param {string}   [src]    The element's "src" attribute
 * @param {string}   [id]     The element's "id" attribute
 * @param {string}   [style]  The element's "style" attribute
 * @param {string[]} classes  The classes given by the element's "class" attribute
 * @param {string[]} urls     The URLs considered when loading the element
 * @param {URL}      baseURL  The URL of the document containing the element
 *
 * @return {object} An object holding the list of generated filters and
 *                  the list of CSS selectors for the included element
 *                  hiding filters: {filters: [...], selectors: [...]}
 */
function composeFilters(tagName, id, src, style, classes, urls, baseURL)
{
  // Add a blocking filter for each HTTP(S) URL associated with the element
  let filters = [];
  for (let url of urls)
  {
    let urlObj = new URL(url, baseURL);
    if (canBlockURL(urlObj))
    {
      let filter = stringifyURL(urlObj).replace(/^[\w\-]+:\/+(?:www\.)?/, "||");

      if (filters.indexOf(filter) == -1)
        filters.push(filter);
    }
  }

  // Generate CSS selectors based on the element's "id" and "class" attribute
  let selectors = [];
  if (id)
    selectors.push("#" + escapeCSS(id));
  if (classes.length > 0)
    selectors.push(classes.map(c => "." + escapeCSS(c)).join(""));

  // If there is a "src" attribute, specifiying a URL that we can't block,
  // generate a CSS selector matching the "src" attribute
  if (src && !canBlockURL(new URL(src, baseURL)))
    selectors.push(escapeCSS(tagName) + "[src=" + quoteCSS(src) + "]");

  // As last resort, if there is a "style" attribute, and we couldn't generate
  // any filters so far, generate a CSS selector matching the "style" attribute
  if (style && selectors.length == 0 && filters.length == 0)
    selectors.push(escapeCSS(tagName) + "[style=" + quoteCSS(style) + "]");

  // Add an element hiding filter for each generated CSS selector
  if (selectors.length > 0)
  {
    let domain = getDecodedHostname(baseURL).replace(/^www\./, "");

    for (let selector of selectors)
      filters.push(domain + "##" + selector);
  }

  return {filters: filters, selectors: selectors};
}
exports.composeFilters = composeFilters;
