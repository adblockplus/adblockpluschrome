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
 * Portions created by the Initial Developer are Copyright (C) 2006-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc0) {
  function Matcher() {
    this.clear();
  }
  Matcher.prototype = {
    filterByKeyword: null,
    keywordByFilter: null,
    clear: function () {
      this.filterByKeyword = {
        __proto__: null
      };
      this.keywordByFilter = {
        __proto__: null
      };
    }
    ,
    add: function (filter) {
      if (filter.text in this.keywordByFilter)
        return ;
      var keyword = this.findKeyword(filter);
      switch (typeof this.filterByKeyword[keyword]) {
        case "undefined": {
          this.filterByKeyword[keyword] = filter.text;
          break;
        }
        case "string": {
          this.filterByKeyword[keyword] = [this.filterByKeyword[keyword], filter.text];
          break;
        }
        default: {
          this.filterByKeyword[keyword].push(filter.text);
          break;
        }
      }
      this.keywordByFilter[filter.text] = keyword;
    }
    ,
    remove: function (filter) {
      if (!(filter.text in this.keywordByFilter))
        return ;
      var keyword = this.keywordByFilter[filter.text];
      var list = this.filterByKeyword[keyword];
      if (typeof list == "string")
        delete this.filterByKeyword[keyword];
       else {
        var index = list.indexOf(filter.text);
        if (index >= 0) {
          list.splice(index, 1);
          if (list.length == 1)
            this.filterByKeyword[keyword] = list[0];
        }
      }
      delete this.keywordByFilter[filter.text];
    }
    ,
    findKeyword: function (filter) {
      var defaultResult = (filter.contentType & RegExpFilter.typeMap.DONOTTRACK ? "donottrack" : "");
      var text = filter.text;
      if (Filter.regexpRegExp.test(text))
        return defaultResult;
      if (Filter.optionsRegExp.test(text))
        text = RegExp.leftContext;
      if (text.substr(0, 2) == "@@")
        text = text.substr(2);
      var candidates = text.toLowerCase().match(/[^a-z0-9%*][a-z0-9%]{3,}(?=[^a-z0-9%*])/g);
      if (!candidates)
        return defaultResult;
      var hash = this.filterByKeyword;
      var result = defaultResult;
      var resultCount = 16777215;
      var resultLength = 0;
      for (var i = 0, l = candidates.length;
      i < l; i++) {
        var candidate = candidates[i].substr(1);
        var count;
        switch (typeof hash[candidate]) {
          case "undefined": {
            count = 0;
            break;
          }
          case "string": {
            count = 1;
            break;
          }
          default: {
            count = hash[candidate].length;
            break;
          }
        }
        if (count < resultCount || (count == resultCount && candidate.length > resultLength)) {
          result = candidate;
          resultCount = count;
          resultLength = candidate.length;
        }
      }
      return result;
    }
    ,
    hasFilter: function (filter) {
      return (filter.text in this.keywordByFilter);
    }
    ,
    getKeywordForFilter: function (filter) {
      if (filter.text in this.keywordByFilter)
        return this.keywordByFilter[filter.text];
       else
        return null;
    }
    ,
    _checkEntryMatch: function (keyword, location, contentType, docDomain, thirdParty) {
      var list = this.filterByKeyword[keyword];
      if (typeof list == "string") {
        var filter = Filter.knownFilters[list];
        if (!filter) {
          delete this.filterByKeyword[keyword];
          return null;
        }
        return (filter.matches(location, contentType, docDomain, thirdParty) ? filter : null);
      }
       else {
        for (var i = 0;
        i < list.length; i++) {
          var filter = Filter.knownFilters[list[i]];
          if (!filter) {
            if (list.length == 1) {
              delete this.filterByKeyword[keyword];
              return null;
            }
             else {
              list.splice(i--, 1);
              continue;
            }
          }
          if (filter.matches(location, contentType, docDomain, thirdParty))
            return filter;
        }
        return null;
      }
    }
    ,
    matchesAny: function (location, contentType, docDomain, thirdParty) {
      var candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
      if (candidates === null)
        candidates = [];
      if (contentType == "DONOTTRACK")
        candidates.unshift("donottrack");
       else
        candidates.push("");
      for (var i = 0, l = candidates.length;
      i < l; i++) {
        var substr = candidates[i];
        if (substr in this.filterByKeyword) {
          var result = this._checkEntryMatch(substr, location, contentType, docDomain, thirdParty);
          if (result)
            return result;
        }
      }
      return null;
    }
    ,
    toCache: function (cache) {
      cache.filterByKeyword = this.filterByKeyword;
    }
    ,
    fromCache: function (cache) {
      this.filterByKeyword = cache.filterByKeyword;
      this.filterByKeyword.__proto__ = null;
      delete this.keywordByFilter;
      this.__defineGetter__("keywordByFilter", function () {
        var result = {
          __proto__: null
        };
        for (var k in this.filterByKeyword) {
          var list = this.filterByKeyword[k];
          if (typeof list == "string")
            result[list] = k;
           else
            for (var i = 0, l = list.length;
            i < l; i++)
              result[list[i]] = k;
        }
        return this.keywordByFilter = result;
      }
      );
      this.__defineSetter__("keywordByFilter", function (value) {
        delete this.keywordByFilter;
        return this.keywordByFilter = value;
      }
      );
    }
    
  };
  function CombinedMatcher() {
    this.blacklist = new Matcher();
    this.whitelist = new Matcher();
    this.keys = {
      __proto__: null
    };
    this.resultCache = {
      __proto__: null
    };
  }
  CombinedMatcher.maxCacheEntries = 1000;
  CombinedMatcher.prototype = {
    blacklist: null,
    whitelist: null,
    keys: null,
    resultCache: null,
    cacheEntries: 0,
    clear: function () {
      this.blacklist.clear();
      this.whitelist.clear();
      this.keys = {
        __proto__: null
      };
      this.resultCache = {
        __proto__: null
      };
      this.cacheEntries = 0;
    }
    ,
    add: function (filter) {
      if (filter instanceof WhitelistFilter) {
        if (filter.siteKeys) {
          for (var i = 0;
          i < filter.siteKeys.length; i++)
            this.keys[filter.siteKeys[i]] = filter.text;
        }
         else
          this.whitelist.add(filter);
      }
       else
        this.blacklist.add(filter);
      if (this.cacheEntries > 0) {
        this.resultCache = {
          __proto__: null
        };
        this.cacheEntries = 0;
      }
    }
    ,
    remove: function (filter) {
      if (filter instanceof WhitelistFilter) {
        if (filter.siteKeys) {
          for (var i = 0;
          i < filter.siteKeys.length; i++)
            delete this.keys[filter.siteKeys[i]];
        }
         else
          this.whitelist.remove(filter);
      }
       else
        this.blacklist.remove(filter);
      if (this.cacheEntries > 0) {
        this.resultCache = {
          __proto__: null
        };
        this.cacheEntries = 0;
      }
    }
    ,
    findKeyword: function (filter) {
      if (filter instanceof WhitelistFilter)
        return this.whitelist.findKeyword(filter);
       else
        return this.blacklist.findKeyword(filter);
    }
    ,
    hasFilter: function (filter) {
      if (filter instanceof WhitelistFilter)
        return this.whitelist.hasFilter(filter);
       else
        return this.blacklist.hasFilter(filter);
    }
    ,
    getKeywordForFilter: function (filter) {
      if (filter instanceof WhitelistFilter)
        return this.whitelist.getKeywordForFilter(filter);
       else
        return this.blacklist.getKeywordForFilter(filter);
    }
    ,
    isSlowFilter: function (filter) {
      var matcher = (filter instanceof WhitelistFilter ? this.whitelist : this.blacklist);
      if (matcher.hasFilter(filter))
        return !matcher.getKeywordForFilter(filter);
       else
        return !matcher.findKeyword(filter);
    }
    ,
    matchesAnyInternal: function (location, contentType, docDomain, thirdParty) {
      var candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
      if (candidates === null)
        candidates = [];
      if (contentType == "DONOTTRACK")
        candidates.unshift("donottrack");
       else
        candidates.push("");
      var blacklistHit = null;
      for (var i = 0, l = candidates.length;
      i < l; i++) {
        var substr = candidates[i];
        if (substr in this.whitelist.filterByKeyword) {
          var result = this.whitelist._checkEntryMatch(substr, location, contentType, docDomain, thirdParty);
          if (result)
            return result;
        }
        if (substr in this.blacklist.filterByKeyword && blacklistHit === null)
          blacklistHit = this.blacklist._checkEntryMatch(substr, location, contentType, docDomain, thirdParty);
      }
      return blacklistHit;
    }
    ,
    matchesAny: function (location, contentType, docDomain, thirdParty) {
      var key = location + " " + contentType + " " + docDomain + " " + thirdParty;
      if (key in this.resultCache)
        return this.resultCache[key];
      var result = this.matchesAnyInternal(location, contentType, docDomain, thirdParty);
      if (this.cacheEntries >= CombinedMatcher.maxCacheEntries) {
        this.resultCache = {
          __proto__: null
        };
        this.cacheEntries = 0;
      }
      this.resultCache[key] = result;
      this.cacheEntries++;
      return result;
    }
    ,
    matchesByKey: function (location, key, docDomain) {
      key = key.toUpperCase();
      if (key in this.keys) {
        var filter = Filter.knownFilters[this.keys[key]];
        if (filter && filter.matches(location, "DOCUMENT", docDomain, false))
          return filter;
         else
          return null;
      }
       else
        return null;
    }
    ,
    toCache: function (cache) {
      cache.matcher = {
        whitelist: {
          
        },
        blacklist: {
          
        },
        keys: this.keys
      };
      this.whitelist.toCache(cache.matcher.whitelist);
      this.blacklist.toCache(cache.matcher.blacklist);
    }
    ,
    fromCache: function (cache) {
      this.whitelist.fromCache(cache.matcher.whitelist);
      this.blacklist.fromCache(cache.matcher.blacklist);
      this.keys = cache.matcher.keys;
    }
    
  };
  var defaultMatcher = new CombinedMatcher();
  if (typeof _patchFunc0 != "undefined")
    eval("(" + _patchFunc0.toString() + ")()");
  window.Matcher = Matcher;
  window.CombinedMatcher = CombinedMatcher;
  window.defaultMatcher = defaultMatcher;
}
)(window.MatcherPatch);
