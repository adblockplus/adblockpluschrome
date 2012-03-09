/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc2) {
  function Subscription(url, title) {
    this.url = url;
    this.filters = [];
    this._title = title || Utils.getString("newGroup_title");
    Subscription.knownSubscriptions[url] = this;
  }
  Subscription.prototype = {
    url: null,
    filters: null,
    _title: null,
    _disabled: false,
    get title() {
      return this._title;
    },
    set title(value) {
      if (value != this._title) {
        var oldValue = this._title;
        this._title = value;
        FilterNotifier.triggerListeners("subscription.title", this, value, oldValue);
      }
      return this._title;
    }
    ,
    get disabled() {
      return this._disabled;
    },
    set disabled(value) {
      if (value != this._disabled) {
        var oldValue = this._disabled;
        this._disabled = value;
        FilterNotifier.triggerListeners("subscription.disabled", this, value, oldValue);
      }
      return this._disabled;
    }
    ,
    serialize: function (buffer) {
      buffer.push("[Subscription]");
      buffer.push("url=" + this.url);
      buffer.push("title=" + this._title);
      if (this._disabled)
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
    __proto__: null
  };
  Subscription.fromURL = (function (url) {
    if (url in Subscription.knownSubscriptions)
      return Subscription.knownSubscriptions[url];
    try {
      url = Utils.ioService.newURI(url, null, null).spec;
      return new DownloadableSubscription(url, null);
    }
    catch (e){
      return new SpecialSubscription(url);
    }
  }
  );
  Subscription.fromObject = (function (obj) {
    var result;
    try {
      obj.url = Utils.ioService.newURI(obj.url, null, null).spec;
      result = new DownloadableSubscription(obj.url, obj.title);
      if ("nextURL" in obj)
        result.nextURL = obj.nextURL;
      if ("downloadStatus" in obj)
        result._downloadStatus = obj.downloadStatus;
      if ("lastModified" in obj)
        result.lastModified = obj.lastModified;
      if ("lastSuccess" in obj)
        result.lastSuccess = parseInt(obj.lastSuccess) || 0;
      if ("lastCheck" in obj)
        result._lastCheck = parseInt(obj.lastCheck) || 0;
      if ("expires" in obj)
        result.expires = parseInt(obj.expires) || 0;
      if ("softExpiration" in obj)
        result.softExpiration = parseInt(obj.softExpiration) || 0;
      if ("errors" in obj)
        result._errors = parseInt(obj.errors) || 0;
      if ("requiredVersion" in obj) {
        result.requiredVersion = obj.requiredVersion;
        if (Utils.versionComparator.compare(result.requiredVersion, Utils.addonVersion) > 0)
          result.upgradeRequired = true;
      }
      if ("alternativeLocations" in obj)
        result.alternativeLocations = obj.alternativeLocations;
      if ("homepage" in obj)
        result._homepage = obj.homepage;
      if ("lastDownload" in obj)
        result._lastDownload = parseInt(obj.lastDownload) || 0;
    }
    catch (e){
      if (!("title" in obj)) {
        if (obj.url == "~wl~")
          obj.defaults = "whitelist";
         else
          if (obj.url == "~fl~")
            obj.defaults = "blocking";
           else
            if (obj.url == "~eh~")
              obj.defaults = "elemhide";
        if ("defaults" in obj)
          obj.title = Utils.getString(obj.defaults + "Group_title");
      }
      result = new SpecialSubscription(obj.url, obj.title);
      if ("defaults" in obj)
        result.defaults = obj.defaults.split(" ");
    }
    if ("disabled" in obj)
      result._disabled = (obj.disabled == "true");
    return result;
  }
  );
  function SpecialSubscription(url, title) {
    Subscription.call(this, url, title);
  }
  SpecialSubscription.prototype = {
    __proto__: Subscription.prototype,
    defaults: null,
    isDefaultFor: function (filter) {
      if (this.defaults && this.defaults.length) {
        for (var _loopIndex1 = 0;
        _loopIndex1 < this.defaults.length; ++ _loopIndex1) {
          var type = this.defaults[_loopIndex1];
          if (filter instanceof SpecialSubscription.defaultsMap[type])
            return true;
          if (!(filter instanceof ActiveFilter) && type == "blacklist")
            return true;
        }
      }
      return false;
    }
    ,
    serialize: function (buffer) {
      Subscription.prototype.serialize.call(this, buffer);
      if (this.defaults && this.defaults.length)
        buffer.push("defaults=" + this.defaults.filter(function (type) {
          return type in SpecialSubscription.defaultsMap;
        }).join(" "));
      if (this._lastDownload)
        buffer.push("lastDownload=" + this._lastDownload);
    }
    
  };
  SpecialSubscription.defaultsMap = {
    __proto__: null,
    "whitelist": WhitelistFilter,
    "blocking": BlockingFilter,
    "elemhide": ElemHideFilter
  };
  SpecialSubscription.create = (function (title) {
    var url;
    do {
      url = "~user~" + Math.round(Math.random() * 1000000);
    }
    while (url in Subscription.knownSubscriptions);
    return new SpecialSubscription(url, title);
  }
  );
  SpecialSubscription.createForFilter = (function (filter) {
    var subscription = SpecialSubscription.create();
    subscription.filters.push(filter);
    for (var type in SpecialSubscription.defaultsMap) {
      if (filter instanceof SpecialSubscription.defaultsMap[type])
        subscription.defaults = [type];
    }
    if (!subscription.defaults)
      subscription.defaults = ["blocking"];
    subscription.title = Utils.getString(subscription.defaults[0] + "Group_title");
    return subscription;
  }
  );
  function RegularSubscription(url, title) {
    Subscription.call(this, url, title || url);
  }
  RegularSubscription.prototype = {
    __proto__: Subscription.prototype,
    _homepage: null,
    _lastDownload: 0,
    get homepage() {
      return this._homepage;
    },
    set homepage(value) {
      if (value != this._homepage) {
        var oldValue = this._homepage;
        this._homepage = value;
        FilterNotifier.triggerListeners("subscription.homepage", this, value, oldValue);
      }
      return this._homepage;
    }
    ,
    get lastDownload() {
      return this._lastDownload;
    },
    set lastDownload(value) {
      if (value != this._lastDownload) {
        var oldValue = this._lastDownload;
        this._lastDownload = value;
        FilterNotifier.triggerListeners("subscription.lastDownload", this, value, oldValue);
      }
      return this._lastDownload;
    }
    ,
    serialize: function (buffer) {
      Subscription.prototype.serialize.call(this, buffer);
      if (this._homepage)
        buffer.push("homepage=" + this._homepage);
      if (this._lastDownload)
        buffer.push("lastDownload=" + this._lastDownload);
    }
    
  };
  function ExternalSubscription(url, title) {
    RegularSubscription.call(this, url, title);
  }
  ExternalSubscription.prototype = {
    __proto__: RegularSubscription.prototype,
    serialize: function (buffer) {
      throw new Error("Unexpected call, external subscriptions should not be serialized");
    }
    
  };
  function DownloadableSubscription(url, title) {
    RegularSubscription.call(this, url, title);
  }
  DownloadableSubscription.prototype = {
    __proto__: RegularSubscription.prototype,
    _downloadStatus: null,
    _lastCheck: 0,
    _errors: 0,
    nextURL: null,
    get downloadStatus() {
      return this._downloadStatus;
    },
    set downloadStatus(value) {
      var oldValue = this._downloadStatus;
      this._downloadStatus = value;
      FilterNotifier.triggerListeners("subscription.downloadStatus", this, value, oldValue);
      return this._downloadStatus;
    }
    ,
    lastModified: null,
    lastSuccess: 0,
    get lastCheck() {
      return this._lastCheck;
    },
    set lastCheck(value) {
      if (value != this._lastCheck) {
        var oldValue = this._lastCheck;
        this._lastCheck = value;
        FilterNotifier.triggerListeners("subscription.lastCheck", this, value, oldValue);
      }
      return this._lastCheck;
    }
    ,
    expires: 0,
    softExpiration: 0,
    get errors() {
      return this._errors;
    },
    set errors(value) {
      if (value != this._errors) {
        var oldValue = this._errors;
        this._errors = value;
        FilterNotifier.triggerListeners("subscription.errors", this, value, oldValue);
      }
      return this._errors;
    }
    ,
    requiredVersion: null,
    upgradeRequired: false,
    alternativeLocations: null,
    serialize: function (buffer) {
      RegularSubscription.prototype.serialize.call(this, buffer);
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
    
  };
  if (typeof _patchFunc2 != "undefined")
    eval("(" + _patchFunc2.toString() + ")()");
  window.Subscription = Subscription;
  window.SpecialSubscription = SpecialSubscription;
  window.RegularSubscription = RegularSubscription;
  window.ExternalSubscription = ExternalSubscription;
  window.DownloadableSubscription = DownloadableSubscription;
}
)(window.SubscriptionClassesPatch);
