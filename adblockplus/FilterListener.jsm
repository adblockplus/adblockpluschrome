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
  var subscriptionFilter = null;
  const cacheVersion = 1;
  var batchMode = false;
  var isDirty = false;
  var FilterListener = {
    startup: function () {
      FilterStorage.addObserver(function (action, items) {
        if (/^filters (.*)/.test(action))
          onFilterChange(RegExp["$1"], items);
         else
          if (/^subscriptions (.*)/.test(action))
            onSubscriptionChange(RegExp["$1"], items);
           else
            onGenericChange(action, items);
      }
      );
      ElemHide.init();
      var initialized = false;
      var cacheFile = Utils.resolveFilePath(Prefs.data_directory);
      cacheFile.append("cache.js");
      if (cacheFile.exists()) {
        try {
          var stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
          stream.init(cacheFile, 1, 292, 0);
          var json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
          var cache = json.decodeFromStream(stream, "UTF-8");
          stream.close();
          if (cache.version == cacheVersion) {
            defaultMatcher.fromCache(cache);
            ElemHide.fromCache(cache);
          }
          var loadDone = false;
          function trapProperty(obj, prop) {
            var origValue = obj[prop];
            delete obj[prop];
            obj.__defineGetter__(prop, function () {
              delete obj[prop];
              obj[prop] = origValue;
              if (!loadDone) {
                loadDone = true;
                FilterStorage.loadFromDisk(true);
                if (FilterStorage.fileProperties.cacheTimestamp != cache.timestamp) {
                  FilterStorage.triggerObservers("load");
                }
              }
              return obj[prop];
            }
            );
            obj.__defineSetter__(prop, function (value) {
              delete obj[prop];
              return obj[prop] = value;
            }
            );
          }
          for (var _loopIndex0 = 0;
          _loopIndex0 < ["fileProperties", "subscriptions", "knownSubscriptions", "addSubscription", "removeSubscription", "updateSubscriptionFilters", "addFilter", "removeFilter", "increaseHitCount", "resetHitCounts"].length; ++ _loopIndex0) {
            var prop = ["fileProperties", "subscriptions", "knownSubscriptions", "addSubscription", "removeSubscription", "updateSubscriptionFilters", "addFilter", "removeFilter", "increaseHitCount", "resetHitCounts"][_loopIndex0];
            trapProperty(FilterStorage, prop);
          }
          trapProperty(Filter, "fromText");
          trapProperty(Filter, "knownFilters");
          trapProperty(Subscription, "fromURL");
          trapProperty(Subscription, "knownSubscriptions");
          initialized = true;
          ElemHide.apply();
        }
        catch (e){
          Cu.reportError(e);
        }
      }
      if (!initialized)
        FilterStorage.loadFromDisk();
      Utils.observerService.addObserver(FilterListenerPrivate, "browser:purge-session-history", true);
    }
    ,
    shutdown: function () {
      if (isDirty)
        FilterStorage.saveToDisk();
      Utils.observerService.removeObserver(FilterListenerPrivate, "browser:purge-session-history");
    }
    ,
    get batchMode() {
      return batchMode;
    }
    ,
    set batchMode(value) {
      batchMode = value;
      flushElemHide();
    }
    
  };
  var FilterListenerPrivate = {
    observe: function (subject, topic, data) {
      if (topic == "browser:purge-session-history" && Prefs.clearStatsOnHistoryPurge) {
        FilterStorage.resetHitCounts();
        FilterStorage.saveToDisk();
        Prefs.recentReports = "[]";
      }
    }
    ,
    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
  };
  function flushElemHide() {
    if (!batchMode && ElemHide.isDirty)
      ElemHide.apply();
  }
  function addFilter(filter) {
    if (!(filter instanceof ActiveFilter) || filter.disabled || (subscriptionFilter && filter.subscriptions.some(subscriptionFilter)))
      return ;
    if (filter instanceof RegExpFilter)
      defaultMatcher.add(filter);
     else
      if (filter instanceof ElemHideFilter)
        ElemHide.add(filter);
  }
  function removeFilter(filter) {
    if (!(filter instanceof ActiveFilter) || (subscriptionFilter && filter.subscriptions.some(subscriptionFilter)))
      return ;
    if (filter instanceof RegExpFilter)
      defaultMatcher.remove(filter);
     else
      if (filter instanceof ElemHideFilter)
        ElemHide.remove(filter);
  }
  function onSubscriptionChange(action, subscriptions) {
    isDirty = true;
    if (action != "remove") {
      subscriptions = subscriptions.filter(function (subscription) {
        return subscription.url in FilterStorage.knownSubscriptions;
      }
      );
    }
    if (!subscriptions.length)
      return ;
    if (action == "add" || action == "enable" || action == "remove" || action == "disable" || action == "update") {
      var subscriptionMap = {
        __proto__: null
      };
      for (var _loopIndex1 = 0;
      _loopIndex1 < subscriptions.length; ++ _loopIndex1) {
        var subscription = subscriptions[_loopIndex1];
        subscriptionMap[subscription.url] = true;
      }
      subscriptionFilter = (function (subscription) {
        return !(subscription.url in subscriptionMap) && !subscription.disabled;
      }
      );
    }
     else
      subscriptionFilter = null;
    if (action == "add" || action == "enable" || action == "remove" || action == "disable") {
      var method = (action == "add" || action == "enable" ? addFilter : removeFilter);
      for (var _loopIndex2 = 0;
      _loopIndex2 < subscriptions.length; ++ _loopIndex2) {
        var subscription = subscriptions[_loopIndex2];
        if (subscription.filters && (action == "disable" || !subscription.disabled))
          subscription.filters.forEach(method);
      }
    }
     else
      if (action == "update") {
        for (var _loopIndex3 = 0;
        _loopIndex3 < subscriptions.length; ++ _loopIndex3) {
          var subscription = subscriptions[_loopIndex3];
          if (!subscription.disabled) {
            subscription.oldFilters.forEach(removeFilter);
            subscription.filters.forEach(addFilter);
          }
        }
      }
    flushElemHide();
  }
  function onFilterChange(action, filters) {
    isDirty = true;
    if (action == "add" || action == "enable" || action == "remove" || action == "disable") {
      subscriptionFilter = null;
      var method = (action == "add" || action == "enable" ? addFilter : removeFilter);
      if (action != "enable" && action != "disable") {
        filters = filters.filter(function (filter) {
          return ((action == "add") == filter.subscriptions.some(function (subscription) {
            return !subscription.disabled;
          }));
        }
        );
      }
      filters.forEach(method);
      flushElemHide();
    }
  }
  function onGenericChange(action) {
    if (action == "load") {
      isDirty = false;
      defaultMatcher.clear();
      ElemHide.clear();
      for (var _loopIndex4 = 0;
      _loopIndex4 < FilterStorage.subscriptions.length; ++ _loopIndex4) {
        var subscription = FilterStorage.subscriptions[_loopIndex4];
        if (!subscription.disabled)
          subscription.filters.forEach(addFilter);
      }
      flushElemHide();
    }
     else
      if (action == "beforesave") {
        var cache = {
          version: cacheVersion,
          timestamp: Date.now()
        };
        defaultMatcher.toCache(cache);
        ElemHide.toCache(cache);
        var cacheFile = Utils.resolveFilePath(Prefs.data_directory);
        cacheFile.append("cache.js");
        try {
          cacheFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 493);
        }
        catch (e){}
        try {
          var fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
          fileStream.init(cacheFile, 2 | 8 | 32, 420, 0);
          var stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
          stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
          var json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
          stream.writeString(json.encode(cache));
          stream.close();
          FilterStorage.fileProperties.cacheTimestamp = cache.timestamp;
        }
        catch (e){
          delete FilterStorage.fileProperties.cacheTimestamp;
          Cu.reportError(e);
        }
      }
       else
        if (action == "save")
          isDirty = false;
  }
  if (typeof _patchFunc5 != "undefined")
    eval("(" + _patchFunc5.toString() + ")()");
  window.FilterListener = FilterListener;
}
)(window.FilterListenerPatch);
