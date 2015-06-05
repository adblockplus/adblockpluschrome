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

/** @module filterValidation */

let {Filter, InvalidFilter, ElemHideBase} = require("filterClasses");

function isValidCSSSelector(selector)
{
  let style = document.createElement("style");
  document.documentElement.appendChild(style);
  let sheet = style.sheet;
  document.documentElement.removeChild(style);

  try
  {
    document.querySelector(selector);
    sheet.insertRule(selector + "{}", 0);
  }
  catch (e)
  {
    return false;
  }
  return true;
}

/**
 * @typedef ParsedFilter
 * @property {?Filter} [filter]  The parsed filter if it is valid. Or null if
 *                               the given string is empty or a filter list header.
 * @property {string} [error]    An error message indicated that the filter cannot
 *                               be parsed or contains an invalid CSS selector.
 */

let parseFilter =
/**
 * Parses and validates a filter given by the user.
 *
 * @param {string}  text
 * @param {Boolean} [ignoreHeaders=false]  If true, {filter: null} is
                                           returned instead an error
                                           for filter list headers.
 * @return {ParsedFilter}
 */
exports.parseFilter = function(text, ignoreHeaders)
{
  let filter = null;
  text = Filter.normalize(text);

  if (text)
  {
    if (text[0] != "[")
    {
      filter = Filter.fromText(text);

      if (filter instanceof InvalidFilter)
        return {error: filter.reason};

      if (filter instanceof ElemHideBase && !isValidCSSSelector(filter.selector))
        return {error: ext.i18n.getMessage("invalid_css_selector", "'" + filter.selector + "'")};
    }
    else if (!ignoreHeaders)
    {
      return {error: ext.i18n.getMessage("unexpected_filter_list_header")};
    }
  }

  return {filter: filter};
};

/**
 * @typedef ParsedFilters
 * @property {Filter[]} [filters]  The parsed filters if all of them are valid.
 * @property {string} [error]      An error message indicated that any filter cannot
 *                                 be parsed or contains an invalid CSS selector.
 */

/**
 * Parses and validates a newline-separated list of filters given by the user.
 *
 * @param {string}  text
 * @param {Boolean} [ignoreHeaders=false]  If true, filter list headers
 *                                         will be stripped instead of
 *                                         returning an error.
 * @return {ParsedFilters}
 */
exports.parseFilters = function(text, ignoreHeaders)
{
  let lines = text.split("\n");
  let filters = [];

  for (let i = 0; i < lines.length; i++)
  {
    let {filter, error} = parseFilter(lines[i], ignoreHeaders);

    if (error)
      return {error: ext.i18n.getMessage("line", (i + 1).toString()) + ": " + error};

    if (filter)
      filters.push(filter);
  }

  return {filters: filters};
};
