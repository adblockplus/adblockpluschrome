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
 * Portions created by the Initial Developer are Copyright (C) 2006-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc3) {
  function Matcher() {
    this.clear();
  }
  Matcher.shortcutLength = 8;
  Matcher.prototype = {
    shortcutHash: null,
    hasShortcuts: false,
    regexps: null,
    knownFilters: null,
    clear: function () {
      this.shortcutHash = {
        
      };
      this.hasShortcuts = false;
      this.regexps = [];
      this.knownFilters = {
        
      };
    }
    ,
    add: function (filter) {
      if (filter.text in this.knownFilters)
        return ;
      if (!filter.shortcut || filter.shortcut in this.shortcutHash)
        filter.shortcut = this.findShortcut(filter.text);
      if (filter.shortcut) {
        this.shortcutHash[filter.shortcut] = filter;
        this.hasShortcuts = true;
      }
       else
        this.regexps.push(filter);
      this.knownFilters[filter.text] = true;
    }
    ,
    remove: function (filter) {
      if (!(filter.text in this.knownFilters))
        return ;
      if (filter.shortcut)
        delete this.shortcutHash[filter.shortcut];
       else {
        var i = this.regexps.indexOf(filter);
        if (i >= 0)
          this.regexps.splice(i, 1);
      }
      delete this.knownFilters[filter.text];
    }
    ,
    findShortcut: function (text) {
      if (Filter.regexpRegExp.test(text))
        return null;
      if (Filter.optionsRegExp.test(text))
        text = RegExp.leftContext;
      if (text.substr(0, 2) == "@@")
        text = text.substr(2);
      var pos = text.length - 1;
      if (text[pos] == "|")
        text = text.substr(0, pos);
      if (text[0] == "|")
        text = text.substr(1);
      if (text[0] == "|")
        text = text.substr(1);
      text = text.replace(/\^/g, "*").toLowerCase();
      var len = Matcher.shortcutLength;
      var numCandidates = text.length - len + 1;
      var startingPoint = Math.floor((text.length - len) / 2);
      for (var i = 0, j = 0;
      i < numCandidates; i++ , (j > 0 ? (j = -j) : (j = -j + 1))) {
        var candidate = text.substr(startingPoint + j, len);
        if (candidate.indexOf("*") < 0 && !(candidate in this.shortcutHash))
          return candidate;
      }
      return null;
    }
    ,
    matchesAny: function (location, contentType, docDomain, thirdParty) {
      if (this.hasShortcuts) {
        var text = location.toLowerCase();
        var len = Matcher.shortcutLength;
        var endPos = text.length - len + 1;
        for (var i = 0;
        i <= endPos; i++) {
          var substr = text.substr(i, len);
          if (substr in this.shortcutHash) {
            var filter = this.shortcutHash[substr];
            if (filter.matches(location, contentType, docDomain, thirdParty))
              return filter;
          }
        }
      }
      for (var _loopIndex0 = 0;
      _loopIndex0 < this.regexps.length; ++ _loopIndex0) {
        var filter = this.regexps[_loopIndex0];
        if (filter.matches(location, contentType, docDomain, thirdParty))
          return filter;
      }
      return null;
    }
    
  };
  function CombinedMatcher() {
    this.blacklist = new Matcher();
    this.whitelist = new Matcher();
    this.resultCache = {
      
    };
  }
  CombinedMatcher.maxCacheEntries = 1000;
  CombinedMatcher.prototype = {
    blacklist: null,
    whitelist: null,
    resultCache: null,
    cacheEntries: 0,
    clear: function () {
      this.blacklist.clear();
      this.whitelist.clear();
      this.resultCache = {
        
      };
      this.cacheEntries = 0;
    }
    ,
    add: function (filter) {
      if (filter instanceof WhitelistFilter)
        this.whitelist.add(filter);
       else
        this.blacklist.add(filter);
      if (this.cacheEntries > 0) {
        this.resultCache = {
          
        };
        this.cacheEntries = 0;
      }
    }
    ,
    remove: function (filter) {
      if (filter instanceof WhitelistFilter)
        this.whitelist.remove(filter);
       else
        this.blacklist.remove(filter);
      if (this.cacheEntries > 0) {
        this.resultCache = {
          
        };
        this.cacheEntries = 0;
      }
    }
    ,
    findShortcut: function (text) {
      if (text.substr(0, 2) == "@@")
        return this.whitelist.findShortcut(text);
       else
        return this.blacklist.findShortcut(text);
    }
    ,
    matchesAnyInternal: function (location, contentType, docDomain, thirdParty) {
      var blacklistHit = null;
      if (this.whitelist.hasShortcuts || this.blacklist.hasShortcuts) {
        var hashWhite = this.whitelist.shortcutHash;
        var hashBlack = this.blacklist.shortcutHash;
        var text = location.toLowerCase();
        var len = Matcher.shortcutLength;
        var endPos = text.length - len + 1;
        for (var i = 0;
        i <= endPos; i++) {
          var substr = text.substr(i, len);
          if (substr in hashWhite) {
            var filter = hashWhite[substr];
            if (filter.matches(location, contentType, docDomain, thirdParty))
              return filter;
          }
          if (substr in hashBlack) {
            var filter = hashBlack[substr];
            if (filter.matches(location, contentType, docDomain, thirdParty))
              blacklistHit = filter;
          }
        }
      }
      for (var _loopIndex1 = 0;
      _loopIndex1 < this.whitelist.regexps.length; ++ _loopIndex1) {
        var filter = this.whitelist.regexps[_loopIndex1];
        if (filter.matches(location, contentType, docDomain, thirdParty))
          return filter;
      }
      if (blacklistHit)
        return blacklistHit;
      for (var _loopIndex2 = 0;
      _loopIndex2 < this.blacklist.regexps.length; ++ _loopIndex2) {
        var filter = this.blacklist.regexps[_loopIndex2];
        if (filter.matches(location, contentType, docDomain, thirdParty))
          return filter;
      }
      return null;
    }
    ,
    matchesAny: function (location, contentType, docDomain, thirdParty) {
      var key = location + " " + contentType + " " + docDomain + " " + thirdParty;
      if (key in this.resultCache)
        return this.resultCache[key];
      var result = this.matchesAnyInternal(location, contentType, docDomain, thirdParty);
      if (this.cacheEntries >= CombinedMatcher.maxCacheEntries) {
        this.resultCache = {
          
        };
        this.cacheEntries = 0;
      }
      this.resultCache[key] = result;
      this.cacheEntries++;
      return result;
    }
    
  };
  var defaultMatcher = new CombinedMatcher();
  if (typeof _patchFunc3 != "undefined")
    eval("(" + _patchFunc3.toString() + ")()");
  window.Matcher = Matcher;
  window.CombinedMatcher = CombinedMatcher;
  window.defaultMatcher = defaultMatcher;
}
)(window.MatcherPatch);
