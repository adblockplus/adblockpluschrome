/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc2) {
  const cacheVersion = 2;
  var batchMode = false;
  var isDirty = 0;
  var FilterListener = {
    startup: function () {
      FilterNotifier.addListener(function (action, item, newValue, oldValue) {
        if (/^filter\.(.*)/.test(action))
          onFilterChange(RegExp["$1"], item, newValue, oldValue);
         else
          if (/^subscription\.(.*)/.test(action))
            onSubscriptionChange(RegExp["$1"], item, newValue, oldValue);
           else
            onGenericChange(action, item);
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
          if (cache.version == cacheVersion && cache.patternsTimestamp == FilterStorage.sourceFile.clone().lastModifiedTime) {
            defaultMatcher.fromCache(cache);
            ElemHide.fromCache(cache);
            var loadDone = false;
            function trapProperty(obj, prop) {
              var origValue = obj[prop];
              delete obj[prop];
              obj.__defineGetter__(prop, function () {
                delete obj[prop];
                obj[prop] = origValue;
                if (!loadDone) {
                  loadDone = true;
                  FilterStorage.loadFromDisk(null, true);
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
      if (isDirty > 0)
        FilterStorage.saveToDisk();
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
    ,
    setDirty: function (factor) {
      if (factor == 0 && isDirty > 0)
        isDirty = 1;
       else
        isDirty += factor;
      if (isDirty >= 1 && !filtersFlushScheduled) {
        Utils.runAsync(flushFiltersInternal);
        filtersFlushScheduled = true;
      }
    }
    
  };
  var FilterListenerPrivate = {
    observe: function (subject, topic, data) {
      if (topic == "browser:purge-session-history" && Prefs.clearStatsOnHistoryPurge) {
        FilterStorage.resetHitCounts();
        FilterListener.setDirty(0);
        Prefs.recentReports = "[]";
      }
    }
    ,
    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
  };
  var elemhideFlushScheduled = false;
  function flushElemHide() {
    if (elemhideFlushScheduled)
      return ;
    Utils.runAsync(flushElemHideInternal);
    elemhideFlushScheduled = true;
  }
  function flushElemHideInternal() {
    elemhideFlushScheduled = false;
    if (!batchMode && ElemHide.isDirty)
      ElemHide.apply();
  }
  var filtersFlushScheduled = false;
  function flushFiltersInternal() {
    filtersFlushScheduled = false;
    FilterStorage.saveToDisk();
  }
  function addFilter(filter) {
    if (!(filter instanceof ActiveFilter) || filter.disabled)
      return ;
    var hasEnabled = false;
    for (var i = 0;
    i < filter.subscriptions.length; i++)
      if (!filter.subscriptions[i].disabled)
        hasEnabled = true;
    if (!hasEnabled)
      return ;
    if (filter instanceof RegExpFilter)
      defaultMatcher.add(filter);
     else
      if (filter instanceof ElemHideFilter)
        ElemHide.add(filter);
  }
  function removeFilter(filter) {
    if (!(filter instanceof ActiveFilter))
      return ;
    if (!filter.disabled) {
      var hasEnabled = false;
      for (var i = 0;
      i < filter.subscriptions.length; i++)
        if (!filter.subscriptions[i].disabled)
          hasEnabled = true;
      if (hasEnabled)
        return ;
    }
    if (filter instanceof RegExpFilter)
      defaultMatcher.remove(filter);
     else
      if (filter instanceof ElemHideFilter)
        ElemHide.remove(filter);
  }
  function onSubscriptionChange(action, subscription, newValue, oldValue) {
    if (action == "homepage" || action == "downloadStatus" || action == "lastDownload")
      FilterListener.setDirty(0.2);
     else
      FilterListener.setDirty(1);
    if (action != "added" && action != "removed" && action != "disabled" && action != "updated")
      return ;
    if (action != "removed" && !(subscription.url in FilterStorage.knownSubscriptions)) {
      return ;
    }
    if ((action == "added" || action == "removed" || action == "updated") && subscription.disabled) {
      return ;
    }
    if (action == "added" || action == "removed" || action == "disabled") {
      var method = (action == "added" || (action == "disabled" && newValue == false) ? addFilter : removeFilter);
      if (subscription.filters)
        subscription.filters.forEach(method);
    }
     else
      if (action == "updated") {
        subscription.oldFilters.forEach(removeFilter);
        subscription.filters.forEach(addFilter);
      }
    flushElemHide();
  }
  function onFilterChange(action, filter, newValue, oldValue) {
    if (action == "hitCount" || action == "lastHit")
      FilterListener.setDirty(0.0001);
     else
      if (action == "disabled" || action == "moved")
        FilterListener.setDirty(0.2);
       else
        FilterListener.setDirty(1);
    if (action != "added" && action != "removed" && action != "disabled")
      return ;
    if ((action == "added" || action == "removed") && filter.disabled) {
      return ;
    }
    if (action == "added" || (action == "disabled" && newValue == false))
      addFilter(filter);
     else
      removeFilter(filter);
    flushElemHide();
  }
  function onGenericChange(action) {
    if (action == "load") {
      isDirty = 0;
      defaultMatcher.clear();
      ElemHide.clear();
      for (var _loopIndex1 = 0;
      _loopIndex1 < FilterStorage.subscriptions.length; ++ _loopIndex1) {
        var subscription = FilterStorage.subscriptions[_loopIndex1];
        if (!subscription.disabled)
          subscription.filters.forEach(addFilter);
      }
      flushElemHide();
    }
     else
      if (action == "save") {
        isDirty = 0;
        var cache = {
          version: cacheVersion,
          patternsTimestamp: FilterStorage.sourceFile.clone().lastModifiedTime
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
          var json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
          if (Utils.versionComparator.compare(Utils.platformVersion, "5.0") >= 0) {
            json.encodeToStream(fileStream, "UTF-8", false, cache);
            fileStream.close();
          }
           else {
            var stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
            stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
            stream.writeString(json.encode(cache));
            stream.close();
          }
        }
        catch (e){
          delete FilterStorage.fileProperties.cacheTimestamp;
          Cu.reportError(e);
        }
      }
  }
  if (typeof _patchFunc2 != "undefined")
    eval("(" + _patchFunc2.toString() + ")()");
  window.FilterListener = FilterListener;
}
)(window.FilterListenerPatch);
