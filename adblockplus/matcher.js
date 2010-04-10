/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * T. Joseph <ttjoseph@gmail.com>
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview Matcher class implementing matching addresses against a list of filters.
 * This file is included from AdblockPlus.js.
 */

/**
 * Blacklist/whitelist filter matching
 * @constructor
 */
function Matcher()
{
  this.clear();
}

/**
 * Length of a filter shortcut
 * @type Number
 */
Matcher.shortcutLength = 8;

/**
 * Maximal number of matching cache entries to be kept
 * @type Number
 */
Matcher.maxCacheEntries = 1000;

Matcher.prototype = {
  /**
   * Lookup table for filters by their shortcut
   * @type Object
   */
  shortcutHash: null,

  /**
   * Should be true if shortcutHash has any entries
   * @type Boolean
   */
  hasShortcuts: false,

  /**
   * Filters without a shortcut
   * @type Array of RegExpFilter
   */
  regexps: null,

  /**
   * Lookup table, has keys for all filters already added
   * @type Object
   */
  knownFilters: null,

  /**
   * Lookup table of previous matchesAny results
   * @type Object
   */
  resultCache: null,

  /**
   * Number of entries in resultCache
   * @type Number
   */
  cacheEntries: 0,

  /**
   * Removes all known filters
   */
  clear: function()
  {
    this.shortcutHash = {__proto__: null};
    this.hasShortcuts = false;
    this.regexps = [];
    this.knownFilters = {__proto__: null};
    this.resultCache = {__proto__: null};
    this.cacheEntries = 0;
  },

  /**
   * Adds a filter to the matcher
   * @param {RegExpFilter} filter
   */
  add: function(filter)
  {
    if (filter.text in this.knownFilters)
      return;

    // Look for a suitable shortcut if the current can't be used
    if (!filter.shortcut || filter.shortcut in this.shortcutHash)
      filter.shortcut = this.findShortcut(filter.text);

    if (filter.shortcut) {
      this.shortcutHash[filter.shortcut] = filter;
      this.hasShortcuts = true;
    }
    else {
      this.regexps.push(filter);
    }

    this.knownFilters[filter.text] = true;
    if (this.cacheEntries > 0)
    {
      this.resultCache = {__proto__: null};
      this.cacheEntries = 0;
    }
  },

  /**
   * Removes a filter from the matcher
   * @param {RegExpFilter} filter
   */
  remove: function(filter)
  {
    if (!(filter.text in this.knownFilters))
      return;

    if (filter.shortcut)
      delete this.shortcutHash[filter.shortcut];
    else
    {
      var i = this.regexps.indexOf(filter);
      if (i >= 0)
        this.regexps.splice(i, 1);
    }

    delete this.knownFilters[filter.text];
    if (this.cacheEntries > 0)
    {
      this.resultCache = {__proto__: null};
      this.cacheEntries = 0;
    }
  },

  /**
   * Looks up a free shortcut for a filter
   * @param {String} text text representation of the filter
   * @return {String} shortcut or null
   */
  findShortcut: function(text)
  {
    if (Filter.regexpRegExp.test(text))
      return null;

    text = text.replace(Filter.optionsRegExp, "").replace(/^@@/, "")
               .replace(/^\|{1,2}/, "").replace(/\|$/, "")
               .replace(/\^/g, "*").toLowerCase();

    var len = Matcher.shortcutLength;
    var numCandidates = text.length - len + 1;
    var startingPoint = Math.floor((text.length - len) / 2);
    for (var i = 0, j = 0; i < numCandidates; i++, (j > 0 ? j = -j : j = -j + 1))
    {
      var candidate = text.substr(startingPoint + j, len);
      if (candidate.indexOf("*") < 0 && !(candidate in this.shortcutHash))
        return candidate;
    }
    return null;
  },

  /**
   * Same as matchesAny but bypasses result cache
   */
  matchesAnyInternal: function(location, contentType, docDomain, thirdParty)
  {
    if (this.hasShortcuts)
    {
      // Optimized matching using shortcuts
      var text = location.toLowerCase();
      var len = Matcher.shortcutLength;
      var endPos = text.length - len + 1;
      for (var i = 0; i <= endPos; i++)
      {
        var substr = text.substr(i, len);
        if (substr in this.shortcutHash)
        {
          var filter = this.shortcutHash[substr];
          if (filter.matches(location, contentType, docDomain, thirdParty))
            return filter;
        }
      }
    }

    // Slow matching for filters without shortcut
    for (i in this.regexps) {
            
        var filter = this.regexps[i];
        if (filter.matches(location, contentType, docDomain, thirdParty))
            return filter;
    }

    return null;
  },

  /**
   * Tests whether the URL matches any of the known filters
   * @param {String} location URL to be tested
   * @param {String} contentType content type identifier of the URL
   * @param {String} docDomain domain name of the document that loads the URL
   * @param {Boolean} thirdParty should be true if the URL is a third-party request
   * @return {RegExpFilter} matching filter or null
   */
  matchesAny: function(location, contentType, docDomain, thirdParty)
  {
    var key = location + " " + contentType + " " + docDomain + " " + thirdParty;
    if (key in this.resultCache) {
      return this.resultCache[key];
    }

    var result = this.matchesAnyInternal(location, contentType, docDomain, thirdParty);

    if (this.cacheEntries >= Matcher.maxCacheEntries)
    {
      this.resultCache = {__proto__: null};
      this.cacheEntries = 0;
    }
  
    this.resultCache[key] = result;
    this.cacheEntries++;

    return result;
  }
};
abp.Matcher = Matcher;

/**
 * Matcher instance for blocking filters
 * @type Matcher
 */
var blacklistMatcher = new Matcher();
abp.blacklistMatcher = blacklistMatcher;

/**
 * Matcher instance for exception rules
 * @type Matcher
 */
var whitelistMatcher = new Matcher();
abp.whitelistMatcher = whitelistMatcher;
