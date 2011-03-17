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

(function (_patchFunc12) {
  const formatVersion = 3;
  var observers = [];
  var FilterStorage = {
    sourceFile: null,
    fileProperties: {
      __proto__: null
    },
    subscriptions: [],
    knownSubscriptions: {
      __proto__: null
    },
    addObserver: function (observer) {
      if (observers.indexOf(observer) >= 0)
        return ;
      observers.push(observer);
    }
    ,
    removeObserver: function (observer) {
      var index = observers.indexOf(observer);
      if (index >= 0)
        observers.splice(index, 1);
    }
    ,
    triggerObservers: function (action, items, additionalData) {
      for (var _loopIndex0 = 0;
      _loopIndex0 < observers.length; ++ _loopIndex0) {
        var observer = observers[_loopIndex0];
        observer(action, items, additionalData);
      }
    }
    ,
    addSubscription: function (subscription, silent) {
      if (subscription.url in FilterStorage.knownSubscriptions)
        return ;
      FilterStorage.subscriptions.push(subscription);
      FilterStorage.knownSubscriptions[subscription.url] = subscription;
      addSubscriptionFilters(subscription);
      if (!silent)
        FilterStorage.triggerObservers("subscriptions add", [subscription]);
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
            FilterStorage.triggerObservers("subscriptions remove", [subscription]);
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
      FilterStorage.triggerObservers("subscriptions update", [subscription]);
      delete subscription.oldFilters;
      if (subscription instanceof SpecialSubscription && !subscription.filters.length && subscription.disabled) {
        subscription.disabled = false;
        FilterStorage.triggerObservers("subscriptions enable", [subscription]);
      }
    }
    ,
    addFilter: function (filter, insertBefore, silent) {
      var subscription = null;
      if (!subscription) {
        for (var _loopIndex1 = 0;
        _loopIndex1 < FilterStorage.subscriptions.length; ++ _loopIndex1) {
          var s = FilterStorage.subscriptions[_loopIndex1];
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
        FilterStorage.triggerObservers("filters add", [filter], insertBefore);
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
                FilterStorage.triggerObservers("filters remove", [filter]);
              if (!subscription.filters.length && subscription.disabled) {
                subscription.disabled = false;
                if (!silent)
                  FilterStorage.triggerObservers("subscriptions enable", [subscription]);
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
      FilterStorage.triggerObservers("filters hit", [filter]);
    }
    ,
    resetHitCounts: function (filters) {
      if (!filters) {
        filters = [];
        for (var _loopIndex3 = 0;
        _loopIndex3 < Filter.knownFilters.length; ++ _loopIndex3) {
          var filter = Filter.knownFilters[_loopIndex3];
          filters.push(filter);
        }
      }
      for (var _loopIndex2 = 0;
      _loopIndex2 < filters.length; ++ _loopIndex2) {
        var filter = filters[_loopIndex2];
        filter.hitCount = 0;
        filter.lastHit = 0;
      }
      FilterStorage.triggerObservers("filters hit", filters);
    }
    ,
    loadFromDisk: function (silent) {
      if (Prefs.patternsfile) {
        FilterStorage.sourceFile = Utils.resolveFilePath(Prefs.patternsfile);
      }
      if (!FilterStorage.sourceFile) {
        FilterStorage.sourceFile = Utils.resolveFilePath(Prefs.data_directory);
        if (FilterStorage.sourceFile)
          FilterStorage.sourceFile.append("patterns.ini");
      }
      if (!FilterStorage.sourceFile) {
        try {
          FilterStorage.sourceFile = Utils.resolveFilePath(Prefs.defaultBranch.getCharPref("data_directory"));
          if (FilterStorage.sourceFile)
            FilterStorage.sourceFile.append("patterns.ini");
        }
        catch (e){}
      }
      if (!FilterStorage.sourceFile)
        Cu.reportError("Adblock Plus: Failed to resolve filter file location from extensions.adblockplus.patternsfile preference");
      var realSourceFile = FilterStorage.sourceFile;
      if (!realSourceFile || !realSourceFile.exists()) {
        var patternsURL = Utils.ioService.newURI("chrome://adblockplus-defaults/content/patterns.ini", null, null);
        patternsURL = Utils.chromeRegistry.convertChromeURL(patternsURL);
        if (patternsURL instanceof Ci.nsIFileURL)
          realSourceFile = patternsURL.file;
      }
      var userFilters = null;
      var backup = 0;
      while (true) {
        FilterStorage.subscriptions = [];
        FilterStorage.knownSubscriptions = {
          
        };
        try {
          if (realSourceFile && realSourceFile.exists()) {
            var fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
            fileStream.init(realSourceFile, 1, 292, 0);
            var stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
            stream.init(fileStream, "UTF-8", 16384, 0);
            stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);
            userFilters = parseIniFile(stream);
            stream.close();
            if (!FilterStorage.subscriptions.length) {
              throw "No data in the file";
            }
          }
          break;
        }
        catch (e){
          Cu.reportError("Adblock Plus: Failed to read filters from file " + realSourceFile.path);
          Cu.reportError(e);
        }
        realSourceFile = FilterStorage.sourceFile;
        if (realSourceFile) {
          var part1 = realSourceFile.leafName;
          var part2 = "";
          if (/^(.*)(\.\w+)$/.test(part1)) {
            part1 = RegExp["$1"];
            part2 = RegExp["$2"];
          }
          realSourceFile = realSourceFile.clone();
          realSourceFile.leafName = part1 + "-backup" + (++ backup) + part2;
        }
      }
      for (var _loopIndex4 = 0;
      _loopIndex4 < ["~il~", "~wl~", "~fl~", "~eh~"].length; ++ _loopIndex4) {
        var specialSubscription = ["~il~", "~wl~", "~fl~", "~eh~"][_loopIndex4];
        if (!(specialSubscription in FilterStorage.knownSubscriptions)) {
          var subscription = Subscription.fromURL(specialSubscription);
          if (subscription)
            FilterStorage.addSubscription(subscription, true);
        }
      }
      if (userFilters) {
        for (var _loopIndex5 = 0;
        _loopIndex5 < userFilters.length; ++ _loopIndex5) {
          var filter = userFilters[_loopIndex5];
          filter = Filter.fromText(filter);
          if (filter)
            FilterStorage.addFilter(filter, null, true);
        }
      }
      if (!silent)
        FilterStorage.triggerObservers("load");
    }
    ,
    saveToDisk: function () {
      if (!FilterStorage.sourceFile)
        return ;
      FilterStorage.triggerObservers("beforesave");
      try {
        FilterStorage.sourceFile.normalize();
      }
      catch (e){}
      try {
        FilterStorage.sourceFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 493);
      }
      catch (e){}
      var tempFile = FilterStorage.sourceFile.clone();
      tempFile.leafName += "-temp";
      var fileStream, stream;
      try {
        fileStream = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
        fileStream.init(tempFile, 2 | 8 | 32, 420, 0);
        stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
        stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
      }
      catch (e){
        Cu.reportError(e);
        return ;
      }
      const maxBufLength = 1024;
      var buf = ["# Adblock Plus preferences", "version=" + formatVersion];
      if ("cacheTimestamp" in FilterStorage.fileProperties)
        buf.push("cacheTimestamp=" + FilterStorage.fileProperties.cacheTimestamp);
      var lineBreak = Utils.getLineBreak();
      function writeBuffer() {
        stream.writeString(buf.join(lineBreak) + lineBreak);
        buf.splice(0, buf.length);
      }
      var saved = {
        __proto__: null
      };
      for (var _loopIndex6 = 0;
      _loopIndex6 < FilterStorage.subscriptions.length; ++ _loopIndex6) {
        var subscription = FilterStorage.subscriptions[_loopIndex6];
        if (subscription instanceof ExternalSubscription)
          continue;
        for (var _loopIndex8 = 0;
        _loopIndex8 < subscription.filters.length; ++ _loopIndex8) {
          var filter = subscription.filters[_loopIndex8];
          if (!(filter.text in saved)) {
            filter.serialize(buf);
            saved[filter.text] = filter;
            if (buf.length > maxBufLength)
              writeBuffer();
          }
        }
      }
      for (var _loopIndex7 = 0;
      _loopIndex7 < FilterStorage.subscriptions.length; ++ _loopIndex7) {
        var subscription = FilterStorage.subscriptions[_loopIndex7];
        if (subscription instanceof ExternalSubscription)
          continue;
        buf.push("");
        subscription.serialize(buf);
        if (subscription.filters.length) {
          buf.push("", "[Subscription filters]");
          subscription.serializeFilters(buf);
        }
        if (buf.length > maxBufLength)
          writeBuffer();
      }
      try {
        stream.writeString(buf.join(lineBreak) + lineBreak);
        stream.flush();
        fileStream.QueryInterface(Ci.nsISafeOutputStream).finish();
      }
      catch (e){
        Cu.reportError(e);
        return ;
      }
      if (FilterStorage.sourceFile.exists()) {
        var part1 = FilterStorage.sourceFile.leafName;
        var part2 = "";
        if (/^(.*)(\.\w+)$/.test(part1)) {
          part1 = RegExp["$1"];
          part2 = RegExp["$2"];
        }
        var doBackup = (Prefs.patternsbackups > 0);
        if (doBackup) {
          var lastBackup = FilterStorage.sourceFile.clone();
          lastBackup.leafName = part1 + "-backup1" + part2;
          if (lastBackup.exists() && (Date.now() - lastBackup.lastModifiedTime) / 3600000 < Prefs.patternsbackupinterval)
            doBackup = false;
        }
        if (doBackup) {
          var backupFile = FilterStorage.sourceFile.clone();
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
      tempFile.moveTo(FilterStorage.sourceFile.parent, FilterStorage.sourceFile.leafName);
      FilterStorage.triggerObservers("save");
    }
    
  };
  function addSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex9 = 0;
    _loopIndex9 < subscription.filters.length; ++ _loopIndex9) {
      var filter = subscription.filters[_loopIndex9];
      filter.subscriptions.push(subscription);
    }
  }
  function removeSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex10 = 0;
    _loopIndex10 < subscription.filters.length; ++ _loopIndex10) {
      var filter = subscription.filters[_loopIndex10];
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
                  for (var _loopIndex11 = 0;
                  _loopIndex11 < curObj.length; ++ _loopIndex11) {
                    var text = curObj[_loopIndex11];
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
  if (typeof _patchFunc12 != "undefined")
    eval("(" + _patchFunc12.toString() + ")()");
  window.FilterStorage = FilterStorage;
}
)(window.FilterStoragePatch);
