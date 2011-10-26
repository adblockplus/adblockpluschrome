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

(function (_patchFunc3) {
  function _extend1(baseClass, props) {
    var dummyConstructor = function () {};
    dummyConstructor.prototype = baseClass.prototype;
    var result = new dummyConstructor();
    for (var k in props)
      result[k] = props[k];
    return result;
  }
  function Subscription(url) {
    this.url = url;
    this.filters = [];
    Subscription.knownSubscriptions[url] = this;
  }
  Subscription.prototype = {
    url: null,
    filters: null,
    disabled: false,
    serialize: function (buffer) {
      buffer.push("[Subscription]");
      buffer.push("url=" + this.url);
      if (this.disabled)
        buffer.push("disabled=true");
    }
    ,
    serializeFilters: function (buffer) {
      for (var _loopIndex0 = 0;
      _loopIndex0 < this.filters.length; ++ _loopIndex0) {
        var filter = this.filters[_loopIndex0];
        buffer.push(filter.text.replace(/\[/g, "\\["));
      }
    }
    ,
    toString: function () {
      var buffer = [];
      this.serialize(buffer);
      return buffer.join("\n");
    }
    
  };
  Subscription.knownSubscriptions = {
    
  };
  Subscription.fromURL = (function (url) {
    if (url in Subscription.knownSubscriptions)
      return Subscription.knownSubscriptions[url];
    if (url in SpecialSubscription.map && SpecialSubscription.map[url] instanceof Array)
      return new SpecialSubscription(url);
     else {
      try {
        url = Utils.ioService.newURI(url, null, null).spec;
        return new DownloadableSubscription(url, null);
      }
      catch (e){
        return null;
      }
    }
  }
  );
  Subscription.fromObject = (function (obj) {
    var result;
    if (obj.url in SpecialSubscription.map && SpecialSubscription.map[obj.url] instanceof Array)
      result = new SpecialSubscription(obj.url);
     else {
      if ("external" in obj && obj.external == "true")
        result = new ExternalSubscription(obj.url, obj.title);
       else {
        try {
          obj.url = Utils.ioService.newURI(obj.url, null, null).spec;
        }
        catch (e){
          return null;
        }
        result = new DownloadableSubscription(obj.url, obj.title);
        if ("autoDownload" in obj)
          result.autoDownload = (obj.autoDownload == "true");
        if ("nextURL" in obj)
          result.nextURL = obj.nextURL;
        if ("downloadStatus" in obj)
          result.downloadStatus = obj.downloadStatus;
        if ("lastModified" in obj)
          result.lastModified = obj.lastModified;
        if ("lastSuccess" in obj)
          result.lastSuccess = parseInt(obj.lastSuccess) || 0;
        if ("lastCheck" in obj)
          result.lastCheck = parseInt(obj.lastCheck) || 0;
        if ("expires" in obj)
          result.expires = parseInt(obj.expires) || 0;
        if ("softExpiration" in obj)
          result.softExpiration = parseInt(obj.softExpiration) || 0;
        if ("errors" in obj)
          result.errors = parseInt(obj.errors) || 0;
        if ("requiredVersion" in obj) {
          result.requiredVersion = obj.requiredVersion;
          if (Utils.versionComparator.compare(result.requiredVersion, Utils.addonVersion) > 0)
            result.upgradeRequired = true;
        }
        if ("alternativeLocations" in obj)
          result.alternativeLocations = obj.alternativeLocations;
      }
      if ("homepage" in obj)
        result.homepage = obj.homepage;
      if ("lastDownload" in obj)
        result.lastDownload = parseInt(obj.lastDownload) || 0;
    }
    if ("disabled" in obj)
      result.disabled = (obj.disabled == "true");
    return result;
  }
  );
  function SpecialSubscription(url) {
    Subscription.call(this, url);
    var data = SpecialSubscription.map[url];
    this._titleID = data[0];
    this._priority = data[1];
    this.filterTypes = data.slice(2);
  }
  SpecialSubscription.prototype = _extend1(Subscription, {
    _titleID: null,
    _priority: null,
    get priority() {
      return this._priority;
    }
    ,
    get title() {
      return Utils.getString(this._titleID);
    }
    ,
    filterTypes: null,
    isFilterAllowed: function (filter) {
      for (var _loopIndex2 = 0;
      _loopIndex2 < this.filterTypes.length; ++ _loopIndex2) {
        var type = this.filterTypes[_loopIndex2];
        if (filter instanceof type)
          return true;
      }
      return false;
    }
    
  });
  SpecialSubscription.map = {
    "~il~": ["invalid_description", 1, InvalidFilter, CommentFilter],
    "~wl~": ["whitelist_description", 3, WhitelistFilter, CommentFilter],
    "~fl~": ["filterlist_description", 4, BlockingFilter, CommentFilter],
    "~eh~": ["elemhide_description", 2, ElemHideFilter, CommentFilter]
  };
  function RegularSubscription(url, title) {
    Subscription.call(this, url);
    this.title = title || url;
  }
  RegularSubscription.prototype = _extend1(Subscription, {
    title: null,
    homepage: null,
    lastDownload: 0,
    serialize: function (buffer) {
      Subscription.prototype.serialize.call(this, buffer);
      buffer.push("title=" + this.title);
      if (this.homepage)
        buffer.push("homepage=" + this.homepage);
      if (this.lastDownload)
        buffer.push("lastDownload=" + this.lastDownload);
    }
    
  });
  function ExternalSubscription(url, title) {
    RegularSubscription.call(this, url, title);
  }
  ExternalSubscription.prototype = _extend1(RegularSubscription, {
    serialize: function (buffer) {
      RegularSubscription.prototype.serialize.call(this, buffer);
      buffer.push("external=true");
    }
    
  });
  function DownloadableSubscription(url, title) {
    RegularSubscription.call(this, url, title);
  }
  DownloadableSubscription.prototype = _extend1(RegularSubscription, {
    autoDownload: true,
    nextURL: null,
    downloadStatus: null,
    lastModified: null,
    lastSuccess: 0,
    lastCheck: 0,
    expires: 0,
    softExpiration: 0,
    errors: 0,
    requiredVersion: null,
    upgradeRequired: false,
    alternativeLocations: null,
    serialize: function (buffer) {
      RegularSubscription.prototype.serialize.call(this, buffer);
      if (!this.autoDownload)
        buffer.push("autoDownload=false");
      if (this.nextURL)
        buffer.push("nextURL=" + this.nextURL);
      if (this.downloadStatus)
        buffer.push("downloadStatus=" + this.downloadStatus);
      if (this.lastModified)
        buffer.push("lastModified=" + this.lastModified);
      if (this.lastSuccess)
        buffer.push("lastSuccess=" + this.lastSuccess);
      if (this.lastCheck)
        buffer.push("lastCheck=" + this.lastCheck);
      if (this.expires)
        buffer.push("expires=" + this.expires);
      if (this.softExpiration)
        buffer.push("softExpiration=" + this.softExpiration);
      if (this.errors)
        buffer.push("errors=" + this.errors);
      if (this.requiredVersion)
        buffer.push("requiredVersion=" + this.requiredVersion);
      if (this.alternativeLocations)
        buffer.push("alternativeLocations=" + this.alternativeLocations);
    }
    
  });
  if (typeof _patchFunc3 != "undefined")
    eval("(" + _patchFunc3.toString() + ")()");
  window.Subscription = Subscription;
  window.SpecialSubscription = SpecialSubscription;
  window.RegularSubscription = RegularSubscription;
  window.ExternalSubscription = ExternalSubscription;
  window.DownloadableSubscription = DownloadableSubscription;
}
)(window.SubscriptionClassesPatch);
