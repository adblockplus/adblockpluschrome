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

(function (_patchFunc13) {
  const formatVersion = 3;
  var sourceFile = null;
  var subscriptionObservers = [];
  var filterObservers = [];
  var FilterStorage = {
    fileProperties: {
      __proto__: null
    },
    subscriptions: [],
    knownSubscriptions: {
      __proto__: null
    },
    startup: function () {
      FilterStorage.loadFromDisk();
      Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService).addObserver(FilterStoragePrivate, "browser:purge-session-history", true);
    }
    ,
    shutdown: function () {
      FilterStorage.saveToDisk();
    }
    ,
    addSubscriptionObserver: function (observer) {
      if (subscriptionObservers.indexOf(observer) >= 0)
        return ;
      subscriptionObservers.push(observer);
    }
    ,
    removeSubscriptionObserver: function (observer) {
      var index = subscriptionObservers.indexOf(observer);
      if (index >= 0)
        subscriptionObservers.splice(index, 1);
    }
    ,
    triggerSubscriptionObservers: function (action, subscriptions) {
      for (var _loopIndex0 = 0;
      _loopIndex0 < subscriptionObservers.length; ++ _loopIndex0) {
        var observer = subscriptionObservers[_loopIndex0];
        observer(action, subscriptions);
      }
    }
    ,
    triggerFilterObservers: function (action, filters, additionalData) {
      for (var _loopIndex1 = 0;
      _loopIndex1 < filterObservers.length; ++ _loopIndex1) {
        var observer = filterObservers[_loopIndex1];
        observer(action, filters, additionalData);
      }
    }
    ,
    addFilterObserver: function (observer) {
      if (filterObservers.indexOf(observer) >= 0)
        return ;
      filterObservers.push(observer);
    }
    ,
    removeFilterObserver: function (observer) {
      var index = filterObservers.indexOf(observer);
      if (index >= 0)
        filterObservers.splice(index, 1);
    }
    ,
    addSubscription: function (subscription, silent) {
      if (subscription.url in FilterStorage.knownSubscriptions)
        return ;
      FilterStorage.subscriptions.push(subscription);
      FilterStorage.knownSubscriptions[subscription.url] = subscription;
      addSubscriptionFilters(subscription);
      if (!silent)
        FilterStorage.triggerSubscriptionObservers("add", [subscription]);
    }
    ,
    removeSubscription: function (subscription, silent) {
      for (var i = 0;
      i < FilterStorage.subscriptions.length; i++) {
        if (FilterStorage.subscriptions[i].url == subscription.url) {
          removeSubscriptionFilters(subscription);
          FilterStorage.subscriptions.splice(i--, 1);
          delete FilterStorage.knownSubscriptions[subscription.url];
          if (!silent)
            FilterStorage.triggerSubscriptionObservers("remove", [subscription]);
          return ;
        }
      }
    }
    ,
    updateSubscriptionFilters: function (subscription, filters) {
      removeSubscriptionFilters(subscription);
      subscription.oldFilters = subscription.filters;
      subscription.filters = filters;
      addSubscriptionFilters(subscription);
      FilterStorage.triggerSubscriptionObservers("update", [subscription]);
      delete subscription.oldFilters;
      if (subscription instanceof SpecialSubscription && !subscription.filters.length && subscription.disabled) {
        subscription.disabled = false;
        FilterStorage.triggerSubscriptionObservers("enable", [subscription]);
      }
    }
    ,
    addFilter: function (filter, insertBefore, silent) {
      var subscription = null;
      if (!subscription) {
        for (var _loopIndex2 = 0;
        _loopIndex2 < FilterStorage.subscriptions.length; ++ _loopIndex2) {
          var s = FilterStorage.subscriptions[_loopIndex2];
          if (s instanceof SpecialSubscription && s.isFilterAllowed(filter)) {
            if (s.filters.indexOf(filter) >= 0)
              return ;
            if (!subscription || s.priority > subscription.priority)
              subscription = s;
          }
        }
      }
      if (!subscription)
        return ;
      var insertIndex = -1;
      if (insertBefore)
        insertIndex = subscription.filters.indexOf(insertBefore);
      filter.subscriptions.push(subscription);
      if (insertIndex >= 0)
        subscription.filters.splice(insertIndex, 0, filter);
       else
        subscription.filters.push(filter);
      if (!silent)
        FilterStorage.triggerFilterObservers("add", [filter], insertBefore);
    }
    ,
    removeFilter: function (filter, silent) {
      for (var i = 0;
      i < filter.subscriptions.length; i++) {
        var subscription = filter.subscriptions[i];
        if (subscription instanceof SpecialSubscription) {
          for (var j = 0;
          j < subscription.filters.length; j++) {
            if (subscription.filters[j].text == filter.text) {
              filter.subscriptions.splice(i, 1);
              subscription.filters.splice(j, 1);
              if (!silent)
                FilterStorage.triggerFilterObservers("remove", [filter]);
              if (!subscription.filters.length && subscription.disabled) {
                subscription.disabled = false;
                if (!silent)
                  FilterStorage.triggerSubscriptionObservers("enable", [subscription]);
              }
              return ;
            }
          }
        }
      }
    }
    ,
    increaseHitCount: function (filter) {
      if (!Prefs.savestats || Prefs.privateBrowsing || !(filter instanceof ActiveFilter))
        return ;
      filter.hitCount++;
      filter.lastHit = Date.now();
      FilterStorage.triggerFilterObservers("hit", [filter]);
    }
    ,
    resetHitCounts: function (filters) {
      if (!filters) {
        filters = [];
        for (var _loopIndex4 = 0;
        _loopIndex4 < Filter.knownFilters.length; ++ _loopIndex4) {
          var filter = Filter.knownFilters[_loopIndex4];
          filters.push(filter);
        }
      }
      for (var _loopIndex3 = 0;
      _loopIndex3 < filters.length; ++ _loopIndex3) {
        var filter = filters[_loopIndex3];
        filter.hitCount = 0;
        filter.lastHit = 0;
      }
      FilterStorage.triggerFilterObservers("hit", filters);
    }
    ,
    loadFromDisk: function () {
      FilterStorage.subscriptions = [];
      FilterStorage.knownSubscriptions = {
        
      };
      function getFileByPath(path) {
        if (!path)
          return null;
        try {
          var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
          file.initWithPath(path);
          return file;
        }
        catch (e){}
        try {
          var profileDir = Utils.dirService.get("ProfD", Ci.nsIFile);
          var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
          file.setRelativeDescriptor(profileDir, path);
          return file;
        }
        catch (e){}
        return null;
      }
      sourceFile = getFileByPath(Prefs.patternsfile);
      if (!sourceFile) {
        try {
          sourceFile = getFileByPath(Prefs.getDefaultBranch.getCharPref("patternsfile"));
        }
        catch (e){}
      }
      if (!sourceFile)
        dump("Adblock Plus: Failed to resolve filter file location from extensions.adblockplus.patternsfile preference\n");
      var realSourceFile = sourceFile;
      if (!realSourceFile || !realSourceFile.exists()) {
        var patternsURL = Utils.ioService.newURI("chrome://adblockplus-defaults/content/patterns.ini", null, null);
        patternsURL = Utils.chromeRegistry.convertChromeURL(patternsURL);
        if (patternsURL instanceof Ci.nsIFileURL)
          realSourceFile = patternsURL.file;
      }
      var stream = null;
      try {
        if (realSourceFile && realSourceFile.exists()) {
          var fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
          fileStream.init(realSourceFile, 1, 292, 0);
          stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
          stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
          stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);
        }
      }
      catch (e){
        dump("Adblock Plus: Failed to read filters from file " + realSourceFile.path + ": " + e + "\n");
        stream = null;
      }
      var userFilters = null;
      if (stream) {
        userFilters = parseIniFile(stream);
        stream.close();
      }
      for (var _loopIndex5 = 0;
      _loopIndex5 < ["~il~", "~wl~", "~fl~", "~eh~"].length; ++ _loopIndex5) {
        var specialSubscription = ["~il~", "~wl~", "~fl~", "~eh~"][_loopIndex5];
        if (!(specialSubscription in FilterStorage.knownSubscriptions)) {
          var subscription = Subscription.fromURL(specialSubscription);
          if (subscription)
            FilterStorage.addSubscription(subscription, true);
        }
      }
      if (userFilters) {
        for (var _loopIndex6 = 0;
        _loopIndex6 < userFilters.length; ++ _loopIndex6) {
          var filter = userFilters[_loopIndex6];
          filter = Filter.fromText(filter);
          if (filter)
            FilterStorage.addFilter(filter, null, true);
        }
      }
      FilterStorage.triggerSubscriptionObservers("reload", FilterStorage.subscriptions);
    }
    ,
    saveToDisk: function () {
      if (!sourceFile)
        return ;
      try {
        sourceFile.normalize();
      }
      catch (e){}
      try {
        sourceFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 493);
      }
      catch (e){}
      var tempFile = sourceFile.clone();
      tempFile.leafName += "-temp";
      var stream;
      try {
        var fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
        fileStream.init(tempFile, 2 | 8 | 32, 420, 0);
        stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
        stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
      }
      catch (e){
        dump("Adblock Plus: failed to create file " + tempFile.path + ": " + e + "\n");
        return ;
      }
      const maxBufLength = 1024;
      var buf = ["# Adblock Plus preferences", "version=" + formatVersion];
      var lineBreak = Utils.getLineBreak();
      function writeBuffer() {
        try {
          stream.writeString(buf.join(lineBreak) + lineBreak);
          buf = [];
          return true;
        }
        catch (e){
          stream.close();
          dump("Adblock Plus: failed to write to file " + tempFile.path + ": " + e + "\n");
          try {
            tempFile.remove(false);
          }
          catch (e2){}
          return false;
        }
      }
      var saved = {
        __proto__: null
      };
      for (var _loopIndex7 = 0;
      _loopIndex7 < FilterStorage.subscriptions.length; ++ _loopIndex7) {
        var subscription = FilterStorage.subscriptions[_loopIndex7];
        if (subscription instanceof ExternalSubscription)
          continue;
        for (var _loopIndex9 = 0;
        _loopIndex9 < subscription.filters.length; ++ _loopIndex9) {
          var filter = subscription.filters[_loopIndex9];
          if (!(filter.text in saved)) {
            filter.serialize(buf);
            saved[filter.text] = filter;
            if (buf.length > maxBufLength && !writeBuffer())
              return ;
          }
        }
      }
      for (var _loopIndex8 = 0;
      _loopIndex8 < FilterStorage.subscriptions.length; ++ _loopIndex8) {
        var subscription = FilterStorage.subscriptions[_loopIndex8];
        if (subscription instanceof ExternalSubscription)
          continue;
        buf.push("");
        subscription.serialize(buf);
        if (subscription.filters.length) {
          buf.push("", "[Subscription filters]");
          subscription.serializeFilters(buf);
        }
        if (buf.length > maxBufLength && !writeBuffer())
          return ;
      }
      try {
        stream.writeString(buf.join(lineBreak) + lineBreak);
        stream.close();
      }
      catch (e){
        dump("Adblock Plus: failed to close file " + tempFile.path + ": " + e + "\n");
        try {
          tempFile.remove(false);
        }
        catch (e2){}
        return ;
      }
      if (sourceFile.exists()) {
        var part1 = sourceFile.leafName;
        var part2 = "";
        if (/^(.*)(\.\w+)$/.test(part1)) {
          part1 = RegExp["$1"];
          part2 = RegExp["$2"];
        }
        var doBackup = (Prefs.patternsbackups > 0);
        if (doBackup) {
          var lastBackup = sourceFile.clone();
          lastBackup.leafName = part1 + "-backup1" + part2;
          if (lastBackup.exists() && (Date.now() - lastBackup.lastModifiedTime) / 3600000 < Prefs.patternsbackupinterval)
            doBackup = false;
        }
        if (doBackup) {
          var backupFile = sourceFile.clone();
          backupFile.leafName = part1 + "-backup" + Prefs.patternsbackups + part2;
          try {
            backupFile.remove(false);
          }
          catch (e){}
          for (var i = Prefs.patternsbackups - 1;
          i >= 0; i--) {
            backupFile.leafName = part1 + (i > 0 ? "-backup" + i : "") + part2;
            try {
              backupFile.moveTo(backupFile.parent, part1 + "-backup" + (i + 1) + part2);
            }
            catch (e){}
          }
        }
      }
      tempFile.moveTo(sourceFile.parent, sourceFile.leafName);
    }
    
  };
  var FilterStoragePrivate = {
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
  function addSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex10 = 0;
    _loopIndex10 < subscription.filters.length; ++ _loopIndex10) {
      var filter = subscription.filters[_loopIndex10];
      filter.subscriptions.push(subscription);
    }
  }
  function removeSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex11 = 0;
    _loopIndex11 < subscription.filters.length; ++ _loopIndex11) {
      var filter = subscription.filters[_loopIndex11];
      var i = filter.subscriptions.indexOf(subscription);
      if (i >= 0)
        filter.subscriptions.splice(i, 1);
    }
  }
  function parseIniFile(stream) {
    var wantObj = true;
    FilterStorage.fileProperties = {
      
    };
    var curObj = FilterStorage.fileProperties;
    var curSection = null;
    var line = {
      
    };
    var haveMore = true;
    var userFilters = null;
    while (true) {
      if (haveMore)
        haveMore = stream.readLine(line);
       else
        line.value = "[end]";
      var val = line.value;
      if (wantObj === true && /^(\w+)=(.*)$/.test(val))
        curObj[RegExp["$1"]] = RegExp["$2"];
       else
        if (/^\s*\[(.+)\]\s*$/.test(val)) {
          var newSection = RegExp["$1"].toLowerCase();
          if (curObj) {
            switch (curSection) {
              case "filter": ;
              case "pattern": {
                if ("text" in curObj)
                  Filter.fromObject(curObj);
                break;
              }
              case "subscription": {
                var subscription = Subscription.fromObject(curObj);
                if (subscription)
                  FilterStorage.addSubscription(subscription, true);
                break;
              }
              case "subscription filters": ;
              case "subscription patterns": {
                if (FilterStorage.subscriptions.length) {
                  var subscription = FilterStorage.subscriptions[FilterStorage.subscriptions.length - 1];
                  for (var _loopIndex12 = 0;
                  _loopIndex12 < curObj.length; ++ _loopIndex12) {
                    var text = curObj[_loopIndex12];
                    var filter = Filter.fromText(text);
                    if (filter) {
                      subscription.filters.push(filter);
                      filter.subscriptions.push(subscription);
                    }
                  }
                }
                break;
              }
              case "user patterns": {
                userFilters = curObj;
                break;
              }
            }
          }
          if (newSection == "end")
            break;
          curSection = newSection;
          switch (curSection) {
            case "filter": ;
            case "pattern": ;
            case "subscription": {
              wantObj = true;
              curObj = {
                
              };
              break;
            }
            case "subscription filters": ;
            case "subscription patterns": ;
            case "user patterns": {
              wantObj = false;
              curObj = [];
              break;
            }
            default: {
              wantObj = undefined;
              curObj = null;
            }
          }
        }
         else
          if (wantObj === false && val)
            curObj.push(val.replace(/\\\[/g, "["));
    }
    return userFilters;
  }
  if (typeof _patchFunc13 != "undefined")
    eval("(" + _patchFunc13.toString() + ")()");
  window.FilterStorage = FilterStorage;
}
)(window.FilterStoragePatch);
