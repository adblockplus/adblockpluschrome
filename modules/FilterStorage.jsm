/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc11) {
  const formatVersion = 4;
  var FilterStorage = {
    get formatVersion() {
      return formatVersion;
    },
    get sourceFile() {
      var file = null;
      if (Prefs.patternsfile) {
        file = Utils.resolveFilePath(Prefs.patternsfile);
      }
      if (!file) {
        file = Utils.resolveFilePath(Prefs.data_directory);
        if (file)
          file.append("patterns.ini");
      }
      if (!file) {
        try {
          file = Utils.resolveFilePath(Prefs.defaultBranch.getCharPref("data_directory"));
          if (file)
            file.append("patterns.ini");
        }
        catch (e){}
      }
      if (!file)
        Cu.reportError("Adblock Plus: Failed to resolve filter file location from extensions.adblockplus.patternsfile preference");
      this.__defineGetter__("sourceFile", function () {
        return file;
      });
      return this.sourceFile;
    }
    ,
    fileProperties: {
      __proto__: null
    },
    subscriptions: [],
    knownSubscriptions: {
      __proto__: null
    },
    getGroupForFilter: function (filter) {
      var generalSubscription = null;
      for (var _loopIndex0 = 0;
      _loopIndex0 < FilterStorage.subscriptions.length; ++ _loopIndex0) {
        var subscription = FilterStorage.subscriptions[_loopIndex0];
        if (subscription instanceof SpecialSubscription) {
          if (subscription.isDefaultFor(filter))
            return subscription;
          if (!generalSubscription && (!subscription.defaults || !subscription.defaults.length))
            generalSubscription = subscription;
        }
      }
      return generalSubscription;
    }
    ,
    addSubscription: function (subscription, silent) {
      if (subscription.url in FilterStorage.knownSubscriptions)
        return ;
      FilterStorage.subscriptions.push(subscription);
      FilterStorage.knownSubscriptions[subscription.url] = subscription;
      addSubscriptionFilters(subscription);
      if (!silent)
        FilterNotifier.triggerListeners("subscription.added", subscription);
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
            FilterNotifier.triggerListeners("subscription.removed", subscription);
          return ;
        }
      }
    }
    ,
    moveSubscription: function (subscription, insertBefore) {
      var currentPos = FilterStorage.subscriptions.indexOf(subscription);
      if (currentPos < 0)
        return ;
      var newPos = insertBefore ? FilterStorage.subscriptions.indexOf(insertBefore) : -1;
      if (newPos < 0)
        newPos = FilterStorage.subscriptions.length;
      if (currentPos < newPos)
        newPos--;
      if (currentPos == newPos)
        return ;
      FilterStorage.subscriptions.splice(currentPos, 1);
      FilterStorage.subscriptions.splice(newPos, 0, subscription);
      FilterNotifier.triggerListeners("subscription.moved", subscription);
    }
    ,
    updateSubscriptionFilters: function (subscription, filters) {
      removeSubscriptionFilters(subscription);
      subscription.oldFilters = subscription.filters;
      subscription.filters = filters;
      addSubscriptionFilters(subscription);
      FilterNotifier.triggerListeners("subscription.updated", subscription);
      delete subscription.oldFilters;
      if (subscription instanceof SpecialSubscription && !subscription.filters.length && subscription.disabled)
        subscription.disabled = false;
    }
    ,
    addFilter: function (filter, subscription, position, silent) {
      if (!subscription) {
        if (filter.subscriptions.some(function (s) {
          return s instanceof SpecialSubscription;
        }))
          return ;
        subscription = FilterStorage.getGroupForFilter(filter);
      }
      if (!subscription) {
        subscription = SpecialSubscription.createForFilter(filter);
        this.addSubscription(subscription);
        return ;
      }
      if (typeof position == "undefined")
        position = subscription.filters.length;
      if (filter.subscriptions.indexOf(subscription) < 0)
        filter.subscriptions.push(subscription);
      subscription.filters.splice(position, 0, filter);
      if (!silent)
        FilterNotifier.triggerListeners("filter.added", filter, subscription, position);
    }
    ,
    removeFilter: function (filter, subscription, position) {
      var subscriptions = (subscription ? [subscription] : filter.subscriptions.slice());
      for (var i = 0;
      i < subscriptions.length; i++) {
        var subscription = subscriptions[i];
        if (subscription instanceof SpecialSubscription) {
          var positions = [];
          if (typeof position == "undefined") {
            var index = -1;
            do {
              index = subscription.filters.indexOf(filter, index + 1);
              if (index >= 0)
                positions.push(index);
            }
            while (index >= 0);
          }
           else
            positions.push(position);
          for (var j = positions.length - 1;
          j >= 0; j--) {
            var position = positions[j];
            if (subscription.filters[position] == filter) {
              subscription.filters.splice(position, 1);
              if (subscription.filters.indexOf(filter) < 0) {
                var index = filter.subscriptions.indexOf(subscription);
                if (index >= 0)
                  filter.subscriptions.splice(index, 1);
              }
              FilterNotifier.triggerListeners("filter.removed", filter, subscription, position);
            }
          }
        }
      }
    }
    ,
    moveFilter: function (filter, subscription, oldPosition, newPosition) {
      if (!(subscription instanceof SpecialSubscription) || subscription.filters[oldPosition] != filter)
        return ;
      newPosition = Math.min(Math.max(newPosition, 0), subscription.filters.length - 1);
      if (oldPosition == newPosition)
        return ;
      subscription.filters.splice(oldPosition, 1);
      subscription.filters.splice(newPosition, 0, filter);
      FilterNotifier.triggerListeners("filter.moved", filter, subscription, oldPosition, newPosition);
    }
    ,
    increaseHitCount: function (filter) {
      if (!Prefs.savestats || Prefs.privateBrowsing || !(filter instanceof ActiveFilter))
        return ;
      filter.hitCount++;
      filter.lastHit = Date.now();
    }
    ,
    resetHitCounts: function (filters) {
      if (!filters) {
        filters = [];
        for (var _loopIndex2 = 0;
        _loopIndex2 < Filter.knownFilters.length; ++ _loopIndex2) {
          var filter = Filter.knownFilters[_loopIndex2];
          filters.push(filter);
        }
      }
      for (var _loopIndex1 = 0;
      _loopIndex1 < filters.length; ++ _loopIndex1) {
        var filter = filters[_loopIndex1];
        filter.hitCount = 0;
        filter.lastHit = 0;
      }
    }
    ,
    loadFromDisk: function (sourceFile, silent) {
      if (!silent) {
        Filter.knownFilters = {
          __proto__: null
        };
        Subscription.knownSubscriptions = {
          __proto__: null
        };
      }
      var explicitFile = true;
      if (!sourceFile) {
        sourceFile = FilterStorage.sourceFile;
        explicitFile = false;
        if (!sourceFile || !sourceFile.exists()) {
          var patternsURL = Utils.ioService.newURI("chrome://adblockplus-defaults/content/patterns.ini", null, null);
          patternsURL = Utils.chromeRegistry.convertChromeURL(patternsURL);
          if (patternsURL instanceof Ci.nsIFileURL)
            sourceFile = patternsURL.file;
        }
      }
      var userFilters = null;
      var backup = 0;
      while (true) {
        FilterStorage.subscriptions = [];
        FilterStorage.knownSubscriptions = {
          __proto__: null
        };
        try {
          if (sourceFile && sourceFile.exists()) {
            var fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
            fileStream.init(sourceFile, 1, 292, 0);
            var stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
            stream.init(fileStream, "UTF-8", 16384, 0);
            stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);
            userFilters = parseIniFile(stream);
            stream.close();
            if (!FilterStorage.subscriptions.length) {
              throw new Error("No data in the file");
            }
          }
          break;
        }
        catch (e){
          Cu.reportError("Adblock Plus: Failed to read filters from file " + sourceFile.path);
          Cu.reportError(e);
        }
        if (explicitFile)
          break;
        sourceFile = FilterStorage.sourceFile;
        if (!sourceFile)
          break;
        var part1 = sourceFile.leafName;
        var part2 = "";
        if (/^(.*)(\.\w+)$/.test(part1)) {
          part1 = RegExp["$1"];
          part2 = RegExp["$2"];
        }
        sourceFile = sourceFile.clone();
        sourceFile.leafName = part1 + "-backup" + (++ backup) + part2;
      }
      for (var _loopIndex3 = 0;
      _loopIndex3 < ["~il~", "~wl~", "~fl~", "~eh~"].length; ++ _loopIndex3) {
        var specialSubscription = ["~il~", "~wl~", "~fl~", "~eh~"][_loopIndex3];
        if (specialSubscription in FilterStorage.knownSubscriptions) {
          var subscription = Subscription.fromURL(specialSubscription);
          if (subscription.filters.length == 0)
            FilterStorage.removeSubscription(subscription, true);
        }
      }
      if (userFilters) {
        for (var _loopIndex4 = 0;
        _loopIndex4 < userFilters.length; ++ _loopIndex4) {
          var filter = userFilters[_loopIndex4];
          filter = Filter.fromText(filter);
          if (filter)
            FilterStorage.addFilter(filter, null, undefined, true);
        }
      }
      if (!silent)
        FilterNotifier.triggerListeners("load");
    }
    ,
    saveToDisk: function (targetFile) {
      var explicitFile = true;
      if (!targetFile) {
        targetFile = FilterStorage.sourceFile;
        explicitFile = false;
      }
      if (!targetFile)
        return ;
      try {
        targetFile.normalize();
      }
      catch (e){}
      try {
        targetFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 493);
      }
      catch (e){}
      var tempFile = targetFile.clone();
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
      var lineBreak = Utils.getLineBreak();
      function writeBuffer() {
        stream.writeString(buf.join(lineBreak) + lineBreak);
        buf.splice(0, buf.length);
      }
      var saved = {
        __proto__: null
      };
      for (var _loopIndex5 = 0;
      _loopIndex5 < FilterStorage.subscriptions.length; ++ _loopIndex5) {
        var subscription = FilterStorage.subscriptions[_loopIndex5];
        if (subscription instanceof ExternalSubscription)
          continue;
        for (var _loopIndex7 = 0;
        _loopIndex7 < subscription.filters.length; ++ _loopIndex7) {
          var filter = subscription.filters[_loopIndex7];
          if (!(filter.text in saved)) {
            filter.serialize(buf);
            saved[filter.text] = filter;
            if (buf.length > maxBufLength)
              writeBuffer();
          }
        }
      }
      for (var _loopIndex6 = 0;
      _loopIndex6 < FilterStorage.subscriptions.length; ++ _loopIndex6) {
        var subscription = FilterStorage.subscriptions[_loopIndex6];
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
      if (!explicitFile && targetFile.exists()) {
        var part1 = targetFile.leafName;
        var part2 = "";
        if (/^(.*)(\.\w+)$/.test(part1)) {
          part1 = RegExp["$1"];
          part2 = RegExp["$2"];
        }
        var doBackup = (Prefs.patternsbackups > 0);
        if (doBackup) {
          var lastBackup = targetFile.clone();
          lastBackup.leafName = part1 + "-backup1" + part2;
          if (lastBackup.exists() && (Date.now() - lastBackup.lastModifiedTime) / 3600000 < Prefs.patternsbackupinterval)
            doBackup = false;
        }
        if (doBackup) {
          var backupFile = targetFile.clone();
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
       else
        if (targetFile.exists())
          targetFile.remove(false);
      tempFile.moveTo(targetFile.parent, targetFile.leafName);
      if (!explicitFile)
        FilterNotifier.triggerListeners("save");
    }
    ,
    getBackupFiles: function () {
      var result = [];
      var part1 = FilterStorage.sourceFile.leafName;
      var part2 = "";
      if (/^(.*)(\.\w+)$/.test(part1)) {
        part1 = RegExp["$1"];
        part2 = RegExp["$2"];
      }
      for (var i = 1;
      ;
      i++) {
        var file = FilterStorage.sourceFile.clone();
        file.leafName = part1 + "-backup" + i + part2;
        if (file.exists())
          result.push(file);
         else
          break;
      }
      return result;
    }
    
  };
  function addSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex8 = 0;
    _loopIndex8 < subscription.filters.length; ++ _loopIndex8) {
      var filter = subscription.filters[_loopIndex8];
      filter.subscriptions.push(subscription);
    }
  }
  function removeSubscriptionFilters(subscription) {
    if (!(subscription.url in FilterStorage.knownSubscriptions))
      return ;
    for (var _loopIndex9 = 0;
    _loopIndex9 < subscription.filters.length; ++ _loopIndex9) {
      var filter = subscription.filters[_loopIndex9];
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
                  for (var _loopIndex10 = 0;
                  _loopIndex10 < curObj.length; ++ _loopIndex10) {
                    var text = curObj[_loopIndex10];
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
  if (typeof _patchFunc11 != "undefined")
    eval("(" + _patchFunc11.toString() + ")()");
  window.FilterStorage = FilterStorage;
}
)(window.FilterStoragePatch);
