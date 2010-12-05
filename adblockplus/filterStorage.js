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
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * T. Joseph <tom@adblockplus.org>
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview FilterStorage class responsible to managing user's subscriptions and filters.
 * This file is included from AdblockPlus.js.
 */

// var dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

/**
 * This class reads user's filters from disk, manages them in memory and writes them back.
 * @class
 */
var filterStorage =
{
  /**
   * Version number of the filter storage file format.
   * @type Integer
   */
  formatVersion: 3,

  /**
   * Map of properties listed in the filter storage file before the sections
   * start. Right now this should be only the format version.
   */
  fileProperties: {},

  /**
   * List of filter subscriptions containing all filters
   * @type Array of Subscription
   */
  subscriptions: [],

  /**
   * Map of subscriptions already on the list, by their URL/identifier
   * @type Object
   */
  knownSubscriptions: {__proto__: null},

  /**
   * File that the filter list has been loaded from and should be saved to
   * @type nsIFile
   */
  file: null,

  /**
   * List of observers for subscription changes (addition, deletion)
   * @type Array of function(String, Array of Subscription)
   */
  subscriptionObservers: [],

  /**
   * List of observers for filter changes (addition, deletion)
   * @type Array of function(String, Array of Filter)
   */
  filterObservers: [],

  /**
   * Initializes the component, e.g. triggers the initial load from disk.
   */
  init: function()
  {
    this.loadFromDisk();
/*
    Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)
                                         .addObserver(this, "browser:purge-session-history", true); */
  },

  /**
   * Adds an observer for subscription changes (addition, deletion)
   * @param {function(String, Array of Subscription)} observer
   */
  addSubscriptionObserver: function(observer)
  {
    if (this.subscriptionObservers.indexOf(observer) >= 0)
      return;

    this.subscriptionObservers.push(observer);
  },

  /**
   * Removes a subscription observer previosly added with addSubscriptionObserver
   * @param {function(String, Array of Subscription)} observer
   */
  removeSubscriptionObserver: function(observer)
  {
    var index = this.subscriptionObservers.indexOf(observer);
    if (index >= 0)
      this.subscriptionObservers.splice(index, 1);
  },

  /**
   * Calls subscription observers after a change
   * @param {String} action change code ("add", "remove", "enable", "disable", "update", "updateinfo", "reload")
   * @param {Array of Subscription} subscriptions subscriptions the change applies to
   */
  triggerSubscriptionObservers: function(action, subscriptions)
  {
    for (var observer in this.subscriptionObservers)
      observer(action, subscriptions);
  },

  /**
   * Adds an observer for filter changes (addition, deletion)
   * @param {function(String, Array of Filter)} observer
   */
  addFilterObserver: function(observer)
  {
    if (this.filterObservers.indexOf(observer) >= 0)
      return;

    this.filterObservers.push(observer);
  },

  /**
   * Removes a filter observer previosly added with addFilterObserver
   * @param {function(String, Array of Filter)} observer
   */
  removeFilterObserver: function(observer)
  {
    var index = this.filterObservers.indexOf(observer);
    if (index >= 0)
      this.filterObservers.splice(index, 1);
  },

  /**
   * Calls filter observers after a change
   * @param {String} action change code ("add", "remove", "enable", "disable", "hit")
   * @param {Array of Filter} filters the change applies to
   * @param additionalData optional additional data, depends on change code
   */
  triggerFilterObservers: function(action, filters, additionalData)
  {
    for (var observer in this.filterObservers)
      observer(action, filters, additionalData);
  },

  /**
   * Joins subscription's filters to the subscription without any notifications.
   * @param {Subscription} subscription filter subscription that should be connected to its filters
   */
  _addSubscriptionFilters: function(subscription)
  {
    if (!(subscription.url in this.knownSubscriptions))
      return;

    for (var filter in subscription.filters)
      filter.subscriptions.push(subscription);
  },

  /**
   * Adds a filter subscription to the list
   * @param {Subscription} subscription filter subscription to be added
   * @param {Boolean} silent  if true, no observers will be triggered (to be used when filter list is reloaded)
   */
  addSubscription: function(subscription, silent)
  {
    if (subscription.url in this.knownSubscriptions)
      return;

    this.subscriptions.push(subscription);
    this.knownSubscriptions[subscription.url] = subscription;
    this._addSubscriptionFilters(subscription);

    if (!silent)
      this.triggerSubscriptionObservers("add", [subscription]);
  },

  /**
   * Removes subscription's filters from the subscription without any notifications.
   * @param {Subscription} subscription filter subscription to be removed
   */
  _removeSubscriptionFilters: function(subscription)
  {
    if (!(subscription.url in this.knownSubscriptions))
      return;

    for (var filter in subscription.filters)
    {
      var i = filter.subscriptions.indexOf(subscription);
      if (i >= 0)
        filter.subscriptions.splice(i, 1);
    }
  },

  /**
   * Removes a filter subscription from the list
   * @param {Subscription} subscription filter subscription to be removed
   * @param {Boolean} silent  if true, no observers will be triggered (to be used when filter list is reloaded)
   */
  removeSubscription: function(subscription, silent)
  {
    for (var i = 0; i < this.subscriptions.length; i++)
    {
      if (this.subscriptions[i].url == subscription.url)
      {
        this._removeSubscriptionFilters(subscription);

        this.subscriptions.splice(i--, 1);
        delete this.knownSubscriptions[subscription.url];
        if (!silent)
          this.triggerSubscriptionObservers("remove", [subscription]);
        return;
      }
    }
  },

  /**
   * Replaces the list of filters in a subscription by a new list
   * @param {Subscription} subscription filter subscription to be updated
   * @param {Array of Filter} filters new filter lsit
   */
  updateSubscriptionFilters: function(subscription, filters)
  {
    this._removeSubscriptionFilters(subscription);
    subscription.oldFilters = subscription.filters;
    subscription.filters = filters;
    this._addSubscriptionFilters(subscription);
    this.triggerSubscriptionObservers("update", [subscription]);
    delete subscription.oldFilters;
  },

  /**
   * Adds a user-defined filter to the list
   * @param {Filter} filter
   * @param {Filter} insertBefore   filter to insert before (if possible)
   * @param {Boolean} silent  if true, no observers will be triggered (to be used when filter list is reloaded)
   */
  addFilter: function(filter, insertBefore, silent)
  {
    var subscription = null;
    if (!subscription)
    {
      for (var s in this.subscriptions)
      {
        if (s instanceof SpecialSubscription && s.isFilterAllowed(filter))
        {
          if (s.filters.indexOf(filter) >= 0)
            return;

          if (!subscription || s.priority > subscription.priority)
            subscription = s;
        }
      }
    }

    if (!subscription)
      return;

    var insertIndex = -1;
    if (insertBefore)
      insertIndex = subscription.filters.indexOf(insertBefore);

    filter.subscriptions.push(subscription);
    if (insertIndex >= 0)
      subscription.filters.splice(insertIndex, 0, filter);
    else
      subscription.filters.push(filter);
    if (!silent)
      this.triggerFilterObservers("add", [filter], insertBefore);
  },

  /**
   * Removes a user-defined filter from the list
   * @param {Filter} filter
   * @param {Boolean} silent  if true, no observers will be triggered (to be used when filter list is reloaded)
   */
  removeFilter: function(filter, silent)
  {
    for (var i = 0; i < filter.subscriptions.length; i++)
    {
      var subscription = filter.subscriptions[i];
      if (subscription instanceof SpecialSubscription)
      {
        for (var j = 0; j < subscription.filters.length; j++)
        {
          if (subscription.filters[j].text == filter.text)
          {
            filter.subscriptions.splice(i, 1);
            subscription.filters.splice(j, 1);
            if (!silent)
              this.triggerFilterObservers("remove", [filter]);
            return;
          }
        }
      }
    }
  },

  /**
   * Increases the hit count for a filter by one
   * @param {Filter} filter
   */
  increaseHitCount: function(filter)
  {
    if (!prefs.savestats || prefs.privateBrowsing || !(filter instanceof ActiveFilter))
      return;

    filter.hitCount++;
    filter.lastHit = Date.now();
    this.triggerFilterObservers("hit", [filter]);
  },

  /**
   * Resets hit count for some filters
   * @param {Array of Filter} filters  filters to be reset, if null all filters will be reset
   */
  resetHitCounts: function(filters)
  {
    if (!filters)
    {
      filters = [];
      for (var filter in Filter.knownFilters)
        filters.push(filter);
    }
    for (var filter in filters)
    {
      filter.hitCount = 0;
      filter.lastHit = 0;
    }
    this.triggerFilterObservers("hit", filters);
  },

  /**
   * Loads all subscriptions from the disk
   */
  loadFromDisk: function()
  {
    timeLine.enter("Entered filterStorage.loadFromDisk()");

    this.subscriptions = [];
    this.knownSubscriptions = {__proto__: null};

    function getFileByPath(path)
    {
      try {
        // Assume an absolute path first
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(path);
        return file;
      } catch (e) {}

      try {
        // Try relative path now
        var profileDir = dirService.get("ProfD", Ci.nsIFile);
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.setRelativeDescriptor(profileDir, path);
        return file;
      } catch (e) {}

      return null;
    }

    this.file = getFileByPath(prefs.patternsfile);
    if (!this.file && "patternsfile" in prefs.prefList)
      this.file = getFileByPath(this.prefList.patternsfile[2]);   // Try default

    if (!this.file)
      dump("Adblock Plus: Failed to resolve filter file location from extensions.adblockplus.patternsfile preference\n");

    timeLine.log("done locating patterns.ini file");

    var stream = null;
    try
    {
      if (this.file && this.file.exists())
      {
        var fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        fileStream.init(this.file, 0x01, 0444, 0);

        stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
        stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
        stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);
      }
    }
    catch (e)
    {
      dump("Adblock Plus: Failed to read filters from file " + this.file.path + ": " + e + "\n");
      stream = null;
    }

    var userFilters = null;
    if (stream)
    {
      userFilters = this.parseIniFile(stream);

      stream.close();
    }
    else
    {
      // Probably the first time we run - try to import settings from Adblock
      var importBranch = prefService.getBranch("adblock.");

      try {
        if (importBranch.prefHasUserValue("patterns"))
          for (var text in importBranch.getCharPref("patterns").split(" "))
            this.addFilter(Filter.fromText(text), null, true);
      } catch (e) {}

      try {
        for (var url in importBranch.getCharPref("syncpath").split("|"))
          if (!(url in this.knownSubscriptions))
            this.addSubscription(Subscription.fromURL(url));
      } catch (e) {}
    }

    timeLine.log("done parsing file");

    // Add missing special subscriptions if necessary
    for (var specialSubscription in ["~il~", "~wl~", "~fl~", "~eh~"])
    {
      if (!(specialSubscription in this.knownSubscriptions))
      {
        var subscription = Subscription.fromURL(specialSubscription);
        if (subscription)
          this.addSubscription(subscription, true);
      }
    }

    if (userFilters)
    {
      for (var filter in userFilters)
      {
        filter = Filter.fromText(filter);
        if (filter)
          this.addFilter(filter, null, true);
      }
    }

    timeLine.log("load complete, calling observers");
    this.triggerSubscriptionObservers("reload", this.subscriptions);
    timeLine.leave("filterStorage.loadFromDisk() done");
  },

  /**
   * Parses filter data from a stream. If the data contains user filters outside of filter
   * groups (Adblock Plus 0.7.x data) these filters are returned - they need to be added
   * separately.
   */
  parseIniFile: function(/**nsIUnicharLineInputStream*/ stream) /**Array of String*/
  {
    var wantObj = true;
    this.fileProperties = {};
    var curObj = this.fileProperties;
    var curSection = null;
    var line = {};
    var haveMore = true;
    var userFilters = null;
    while (true)
    {
      if (haveMore)
        haveMore = stream.readLine(line);
      else
        line.value = "[end]";

      var val = line.value;
      if (wantObj === true && /^(\w+)=(.*)$/.test(val))
        curObj[RegExp.$1] = RegExp.$2;
      else if (/^\s*\[(.+)\]\s*$/.test(val))
      {
        var newSection = RegExp.$1.toLowerCase();
        if (curObj)
        {
          // Process current object before going to next section
          switch (curSection)
          {
            case "filter":
            case "pattern":
              if ("text" in curObj)
                Filter.fromObject(curObj);
              break;
            case "subscription":
              var subscription = Subscription.fromObject(curObj);
              if (subscription)
                this.addSubscription(subscription, true);
              break;
            case "subscription filters":
            case "subscription patterns":
              if (this.subscriptions.length)
              {
                var subscription = this.subscriptions[this.subscriptions.length - 1];
                for (var text in curObj)
                {
                  var filter = Filter.fromText(text);
                  if (filter)
                  {
                    subscription.filters.push(filter);
                    filter.subscriptions.push(subscription);
                  }
                }
              }
              break;
            case "user patterns":
              userFilters = curObj;
              break;
          }
        }

        if (newSection == 'end')
          break;

        curSection = newSection;
        switch (curSection)
        {
          case "filter":
          case "pattern":
          case "subscription":
            wantObj = true;
            curObj = {};
            break;
          case "subscription filters":
          case "subscription patterns":
          case "user patterns":
            wantObj = false;
            curObj = [];
            break;
          default:
            wantObj = undefined;
            curObj = null;
        }
      }
      else if (wantObj === false && val)
        curObj.push(val.replace(/\\\[/g, "["));
    }
    return userFilters;
  },

  /**
   * Saves all subscriptions back to disk
   */
  saveToDisk: function()
  {
    if (!this.file)
      return;

    timeLine.enter("Entered filterStorage.saveToDisk()");

    try {
      this.file.normalize();
    } catch (e) {}

    // Make sure the file's parent directory exists
    try {
      this.file.parent.create(this.file.DIRECTORY_TYPE, 0755);
    } catch (e) {}

    var tempFile = this.file.clone();
    tempFile.leafName += "-temp";
    var stream;
    try {
      var fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      fileStream.init(tempFile, 0x02 | 0x08 | 0x20, 0644, 0);

      stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    }
    catch (e) {
      dump("Adblock Plus: failed to create file " + tempFile.path + ": " + e + "\n");
      return;
    }

    timeLine.log("created temp file");

    const maxBufLength = 1024;
    var buf = ["# Adblock Plus preferences", "version=" + this.formatVersion];
    var lineBreak = abp.getLineBreak();
    function writeBuffer()
    {
      try {
        stream.writeString(buf.join(lineBreak) + lineBreak);
        buf = [];
        return true;
      }
      catch (e) {
        stream.close();
        dump("Adblock Plus: failed to write to file " + tempFile.path + ": " + e + "\n");
        try {
          tempFile.remove(false);
        }
        catch (e2) {}
        return false;
      }
    }

    var saved = {__proto__: null};

    // Save filter data
    for (var subscription in this.subscriptions)
    {
      for (var filter in subscription.filters)
      {
        if (!(filter.text in saved))
        {
          filter.serialize(buf);
          saved[filter.text] = filter;

          if (buf.length > maxBufLength && !writeBuffer())
            return;
        }
      }
    }
    timeLine.log("saved filter data");

    // Save subscriptions
    for (var subscription in this.subscriptions)
    {
      buf.push("");
      subscription.serialize(buf);
      if (subscription.filters.length)
      {
        buf.push("", "[Subscription filters]")
        subscription.serializeFilters(buf);
      }

      if (buf.length > maxBufLength && !writeBuffer())
        return;
    }
    timeLine.log("saved subscription data");

    try {
      stream.writeString(buf.join(lineBreak) + lineBreak);
      stream.close();
    }
    catch (e) {
      dump("Adblock Plus: failed to close file " + tempFile.path + ": " + e + "\n");
      try {
        tempFile.remove(false);
      }
      catch (e2) {}
      return;
    }
    timeLine.log("finalized file write");

    if (this.file.exists()) {
      // Check whether we need to backup the file
      var part1 = this.file.leafName;
      var part2 = "";
      if (/^(.*)(\.\w+)$/.test(part1))
      {
        part1 = RegExp.$1;
        part2 = RegExp.$2;
      }

      var doBackup = (prefs.patternsbackups > 0);
      if (doBackup)
      {
        var lastBackup = this.file.clone();
        lastBackup.leafName = part1 + "-backup1" + part2;
        if (lastBackup.exists() && (Date.now() - lastBackup.lastModifiedTime) / 3600000 < prefs.patternsbackupinterval)
          doBackup = false;
      }

      if (doBackup)
      {
        var backupFile = this.file.clone();
        backupFile.leafName = part1 + "-backup" + prefs.patternsbackups + part2;

        // Remove oldest backup
        try {
          backupFile.remove(false);
        } catch (e) {}

        // Rename backup files
        for (var i = prefs.patternsbackups - 1; i >= 0; i--) {
          backupFile.leafName = part1 + (i > 0 ? "-backup" + i : "") + part2;
          try {
            backupFile.moveTo(backupFile.parent, part1 + "-backup" + (i+1) + part2);
          } catch (e) {}
        }
      }
    }

    tempFile.moveTo(this.file.parent, this.file.leafName);
    timeLine.log("created backups and renamed temp file");
    timeLine.leave("filterStorage.saveToDisk() done");
  },

  observe: function(subject, topic, data)
  {
    if (topic == "browser:purge-session-history" && prefs.clearStatsOnHistoryPurge)
    {
      this.resetHitCounts();
      this.saveToDisk();
    }
  }
  //QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};
abp.filterStorage = filterStorage;
