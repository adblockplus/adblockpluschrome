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

(function (_patchFunc5) {
  function _extend0(baseClass, props) {
    var dummyConstructor = function () { };
    dummyConstructor.prototype = baseClass.prototype;
    var result = new dummyConstructor();
    for (var k in props)
      result[k] = props[k];
    return result;
  }
  function Filter(text) {
    this.text = text;
    this.subscriptions = [];
  }
  Filter.prototype = {
    text: null,
    subscriptions: null,
    serialize: function (buffer) {
      buffer.push("[Filter]");
      buffer.push("text=" + this.text);
    }
    ,
    toString: function () {
      return this.text;
    }
    
  };
  Filter.knownFilters = {
    
  };
  Filter.elemhideRegExp = /^([^\/\*\|\@"!]*?)#(?:([\w\-]+|\*)((?:\([\w\-]+(?:[$^*]?=[^\(\)"]*)?\))*)|#([^{}]+))$/;
  Filter.regexpRegExp = /^(@@)?\/.*\/(?:\$~?[\w\-]+(?:=[^,\s]+)?(?:,~?[\w\-]+(?:=[^,\s]+)?)*)?$/;
  Filter.optionsRegExp = /\$(~?[\w\-]+(?:=[^,\s]+)?(?:,~?[\w\-]+(?:=[^,\s]+)?)*)$/;
  Filter.fromText = (function (text) {
    if (text in Filter.knownFilters)
      return Filter.knownFilters[text];
    if (!/\S/.test(text))
      return null;
    var ret;
    if (Filter.elemhideRegExp.test(text))
      ret = ElemHideFilter.fromText(text, RegExp["$1"], RegExp["$2"], RegExp["$3"], RegExp["$4"]);
     else
      if (text[0] == "!")
        ret = new CommentFilter(text);
       else
        ret = RegExpFilter.fromText(text);
    Filter.knownFilters[ret.text] = ret;
    return ret;
  }
  );
  Filter.fromObject = (function (obj) {
    var ret = Filter.fromText(obj.text);
    if (ret instanceof ActiveFilter) {
      if ("disabled" in obj)
        ret.disabled = (obj.disabled == "true");
      if ("hitCount" in obj)
        ret.hitCount = parseInt(obj.hitCount) || 0;
      if ("lastHit" in obj)
        ret.lastHit = parseInt(obj.lastHit) || 0;
    }
    return ret;
  }
  );
  Filter.normalize = (function (text) {
    if (!text)
      return text;
    text = text.replace(/[^\S ]/g, "");
    if (/^\s*!/.test(text)) {
      return text.replace(/^\s+/, "").replace(/\s+$/, "");
    }
     else
      if (Filter.elemhideRegExp.test(text)) {
        /^(.*?)(#+)(.*)$/.test(text);
        var domain = RegExp["$1"];
        var separator = RegExp["$2"];
        var selector = RegExp["$3"];
        return domain.replace(/\s/g, "") + separator + selector.replace(/^\s+/, "").replace(/\s+$/, "");
      }
       else
        return text.replace(/\s/g, "");
  }
  );
  function InvalidFilter(text, reason) {
    Filter.call(this, text);
    this.reason = reason;
  }
  InvalidFilter.prototype = _extend0(Filter, {
    reason: null,
    serialize: function (buffer) { }
  });
  function CommentFilter(text) {
    Filter.call(this, text);
  }
  CommentFilter.prototype = _extend0(Filter, {
    serialize: function (buffer) { }
  });
  function ActiveFilter(text, domains) {
    Filter.call(this, text);
    if (domains) {
      this.domainSource = domains;
      this.__defineGetter__("includeDomains", this._getIncludeDomains);
      this.__defineGetter__("excludeDomains", this._getExcludeDomains);
    }
  }
  ActiveFilter.prototype = _extend0(Filter, {
    disabled: false,
    hitCount: 0,
    lastHit: 0,
    domainSource: null,
    domainSeparator: null,
    includeDomains: null,
    excludeDomains: null,
    _getIncludeDomains: function () {
      this._generateDomains();
      return this.includeDomains;
    }
    ,
    _getExcludeDomains: function () {
      this._generateDomains();
      return this.excludeDomains;
    }
    ,
    _generateDomains: function () {
      var domains = this.domainSource.split(this.domainSeparator);
      delete this.domainSource;
      delete this.includeDomains;
      delete this.excludeDomains;
      if (domains.length == 1 && domains[0][0] != "~") {
        this.includeDomains = {
          
        };
        this.includeDomains[domains[0]] = true;
      }
       else {
        for (var _loopIndex1 = 0;
        _loopIndex1 < domains.length; ++ _loopIndex1) {
          var domain = domains[_loopIndex1];
          if (domain == "")
            continue;
          var hash = "includeDomains";
          if (domain[0] == "~") {
            hash = "excludeDomains";
            domain = domain.substr(1);
          }
          if (!this[hash])
            this[hash] = {
              
            };
          this[hash][domain] = true;
        }
      }
    }
    ,
    isActiveOnDomain: function (docDomain) {
      if (!docDomain)
        return (!this.includeDomains);
      if (!this.includeDomains && !this.excludeDomains)
        return true;
      docDomain = docDomain.replace(/\.+$/, "").toUpperCase();
      while (true) {
        if (this.includeDomains && docDomain in this.includeDomains)
          return true;
        if (this.excludeDomains && docDomain in this.excludeDomains)
          return false;
        var nextDot = docDomain.indexOf(".");
        if (nextDot < 0)
          break;
        docDomain = docDomain.substr(nextDot + 1);
      }
      return (this.includeDomains == null);
    }
    ,
    isActiveOnlyOnDomain: function (docDomain) {
      if (!docDomain || !this.includeDomains)
        return false;
      docDomain = docDomain.replace(/\.+$/, "").toUpperCase();
      for (var domain in this.includeDomains)
        if (domain != docDomain && (domain.length <= docDomain.length || domain.indexOf("." + docDomain) != domain.length - docDomain.length - 1))
          return false;
      return true;
    }
    ,
    serialize: function (buffer) {
      if (this.disabled || this.hitCount || this.lastHit) {
        Filter.prototype.serialize.call(this, buffer);
        if (this.disabled)
          buffer.push("disabled=true");
        if (this.hitCount)
          buffer.push("hitCount=" + this.hitCount);
        if (this.lastHit)
          buffer.push("lastHit=" + this.lastHit);
      }
    }
    
  });
  function RegExpFilter(text, regexpSource, contentType, matchCase, domains, thirdParty) {
    ActiveFilter.call(this, text, domains);
    if (contentType != null)
      this.contentType = contentType;
    if (matchCase)
      this.matchCase = matchCase;
    if (thirdParty != null)
      this.thirdParty = thirdParty;
    if (regexpSource[0] == "/" && regexpSource[regexpSource.length - 1] == "/") {
      this.regexp = new RegExp(regexpSource.substr(1, regexpSource.length - 2), this.matchCase ? "" : "i");
    }
     else {
      this.regexpSource = regexpSource;
      this.__defineGetter__("regexp", this._generateRegExp);
    }
  }
  RegExpFilter.prototype = _extend0(ActiveFilter, {
    domainSeparator: "|",
    regexpSource: null,
    regexp: null,
    contentType: 2147483647,
    matchCase: false,
    thirdParty: null,
    _generateRegExp: function () {
      var source = this.regexpSource.replace(/\*+/g, "*");
      if (source[0] == "*")
        source = source.substr(1);
      var pos = source.length - 1;
      if (pos >= 0 && source[pos] == "*")
        source = source.substr(0, pos);
      source = source.replace(/\^\|$/, "^").replace(/\W/g, "\\$&").replace(/\\\*/g, ".*").replace(/\\\^/g, "(?:[\\x00-\\x24\\x26-\\x2C\\x2F\\x3A-\\x40\\x5B-\\x5E\\x60\\x7B-\\x80]|$)").replace(/^\\\|\\\|/, "^[\\w\\-]+:\\/+(?!\\/)(?:[^\\/]+\\.)?").replace(/^\\\|/, "^").replace(/\\\|$/, "$");
      var regexp = new RegExp(source, this.matchCase ? "" : "i");
      delete this.regexp;
      delete this.regexpSource;
      return (this.regexp = regexp);
    }
    ,
    matches: function (location, contentType, docDomain, thirdParty) {
      if (this.regexp.test(location) && (RegExpFilter.typeMap[contentType] & this.contentType) != 0 && (this.thirdParty == null || this.thirdParty == thirdParty) && this.isActiveOnDomain(docDomain)) {
        return true;
      }
      return false;
    }
    
  });
  RegExpFilter.fromText = (function (text) {
    var constructor = BlockingFilter;
    var origText = text;
    if (text.indexOf("@@") == 0) {
      constructor = WhitelistFilter;
      text = text.substr(2);
    }
    var contentType = null;
    var matchCase = null;
    var domains = null;
    var thirdParty = null;
    var collapse = null;
    var options;
    if (Filter.optionsRegExp.test(text)) {
      options = RegExp["$1"].toUpperCase().split(",");
      text = RegExp.leftContext;
      for (var _loopIndex2 = 0;
      _loopIndex2 < options.length; ++ _loopIndex2) {
        var option = options[_loopIndex2];
        var value;
        var _tempVar3 = option.split("=", 2);
        option = _tempVar3[0];
        value = _tempVar3[1];
        option = option.replace(/-/, "_");
        if (option in RegExpFilter.typeMap) {
          if (contentType == null)
            contentType = 0;
          contentType |= RegExpFilter.typeMap[option];
        }
         else
          if (option[0] == "~" && option.substr(1) in RegExpFilter.typeMap) {
            if (contentType == null)
              contentType = RegExpFilter.prototype.contentType;
            contentType &= ~RegExpFilter.typeMap[option.substr(1)];
          }
           else
            if (option == "MATCH_CASE")
              matchCase = true;
             else
              if (option == "DOMAIN" && typeof value != "undefined")
                domains = value;
               else
                if (option == "THIRD_PARTY")
                  thirdParty = true;
                 else
                  if (option == "~THIRD_PARTY")
                    thirdParty = false;
                   else
                    if (option == "COLLAPSE")
                      collapse = true;
                     else
                      if (option == "~COLLAPSE")
                        collapse = false;
      }
    }
    if (constructor == WhitelistFilter && (contentType == null || (contentType & RegExpFilter.typeMap.DOCUMENT)) && (!options || options.indexOf("DOCUMENT") < 0) && !/^\|?[\w\-]+:/.test(text)) {
      if (contentType == null)
        contentType = RegExpFilter.prototype.contentType;
      contentType &= ~RegExpFilter.typeMap.DOCUMENT;
    }
    try {
      return new constructor(origText, text, contentType, matchCase, domains, thirdParty, collapse);
    }
    catch (e){
      return new InvalidFilter(text, e);
    }
  }
  );
  RegExpFilter.typeMap = {
    OTHER: 1,
    SCRIPT: 2,
    IMAGE: 4,
    STYLESHEET: 8,
    OBJECT: 16,
    SUBDOCUMENT: 32,
    DOCUMENT: 64,
    XBL: 512,
    PING: 1024,
    XMLHTTPREQUEST: 2048,
    OBJECT_SUBREQUEST: 4096,
    DTD: 8192,
    MEDIA: 16384,
    FONT: 32768,
    BACKGROUND: 4,
    DONOTTRACK: 536870912,
    ELEMHIDE: 1073741824
  };
  RegExpFilter.prototype.contentType &= ~(RegExpFilter.typeMap.ELEMHIDE | RegExpFilter.typeMap.DONOTTRACK);
  function BlockingFilter(text, regexpSource, contentType, matchCase, domains, thirdParty, collapse) {
    RegExpFilter.call(this, text, regexpSource, contentType, matchCase, domains, thirdParty);
    this.collapse = collapse;
  }
  BlockingFilter.prototype = _extend0(RegExpFilter, {
    collapse: null
  });
  function WhitelistFilter(text, regexpSource, contentType, matchCase, domains, thirdParty) {
    RegExpFilter.call(this, text, regexpSource, contentType, matchCase, domains, thirdParty);
  }
  WhitelistFilter.prototype = _extend0(RegExpFilter, {
    
  });
  function ElemHideFilter(text, domains, selector) {
    ActiveFilter.call(this, text, domains ? domains.toUpperCase() : null);
    if (domains)
      this.selectorDomain = domains.replace(/,~[^,]+/g, "").replace(/^~[^,]+,?/, "").toLowerCase();
    this.selector = selector;
  }
  ElemHideFilter.prototype = _extend0(ActiveFilter, {
    domainSeparator: ",",
    selectorDomain: null,
    selector: null
  });
  ElemHideFilter.fromText = (function (text, domain, tagName, attrRules, selector) {
    if (!selector) {
      if (tagName == "*")
        tagName = "";
      var id = null;
      var additional = "";
      if (attrRules) {
        attrRules = attrRules.match(/\([\w\-]+(?:[$^*]?=[^\(\)"]*)?\)/g);
        for (var _loopIndex4 = 0;
        _loopIndex4 < attrRules.length; ++ _loopIndex4) {
          var rule = attrRules[_loopIndex4];
          rule = rule.substr(1, rule.length - 2);
          var separatorPos = rule.indexOf("=");
          if (separatorPos > 0) {
            rule = rule.replace(/=/, "=\"") + "\"";
            additional += "[" + rule + "]";
          }
           else {
            if (id)
              return new InvalidFilter(text, Utils.getString("filter_elemhide_duplicate_id"));
             else
              id = rule;
          }
        }
      }
      if (id)
        selector = tagName + "." + id + additional + "," + tagName + "#" + id + additional;
       else
        if (tagName || additional)
          selector = tagName + additional;
         else
          return new InvalidFilter(text, Utils.getString("filter_elemhide_nocriteria"));
    }
    return new ElemHideFilter(text, domain, selector);
  }
  );
  if (typeof _patchFunc5 != "undefined")
    eval("(" + _patchFunc5.toString() + ")()");
  window.Filter = Filter;
  window.InvalidFilter = InvalidFilter;
  window.CommentFilter = CommentFilter;
  window.ActiveFilter = ActiveFilter;
  window.RegExpFilter = RegExpFilter;
  window.BlockingFilter = BlockingFilter;
  window.WhitelistFilter = WhitelistFilter;
  window.ElemHideFilter = ElemHideFilter;
}
)(window.FilterClassesPatch);
