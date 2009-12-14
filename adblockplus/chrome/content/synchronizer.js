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
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview Manages synchronization of filter subscriptions.
 * This file is included from AdblockPlus.js.
 */

var XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIJSXMLHttpRequest");

/**
 * This object is responsible for downloading filter subscriptions whenever
 * necessary.
 * @class
 */
var synchronizer =
{
  /**
   * Map of subscriptions currently being downloaded, all currently downloaded
   * URLs are keys of that map.
   */
  executing: {__proto__: null},

  /**
   * Initializes synchronizer so that it checks hourly whether any subscriptions
   * need to be downloaded.
   */
  init: function()
  {
    let me = this;
    let callback = function()
    {
      me.timer.delay = 3600000;
      me.checkSubscriptions();
    };

    this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.timer.initWithCallback(callback, 300000, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  /**
   * Checks whether any subscriptions need to be downloaded and starts the download
   * if necessary.
   */
  checkSubscriptions: function()
  {
    let time = Date.now()/1000;
    for each (let subscription in filterStorage.subscriptions)
    {
      if (!(subscription instanceof DownloadableSubscription) || !subscription.autoDownload)
        continue;
  
      if (subscription.expires > time)
        continue;

      // Get the number of hours since last download
      let interval = (time - subscription.lastDownload) / 3600;
      if (interval >= prefs.synchronizationinterval)
        synchronizer.execute(subscription);
    }
  },

  /**
   * Checks whether a subscription is currently being downloaded.
   * @param {String} url  URL of the subscription
   * @return {Boolean}
   */
  isExecuting: function(url)
  {
    return url in this.executing;
  },

  /**
   * Extracts a list of filters from text returned by a server.
   * @param {DownloadableSubscription} subscription  subscription the info should be placed into
   * @param {String} text server response
   * @return {Array of Filter}
   */
  readFilters: function(subscription, text)
  {
    let lines = text.split(/[\r\n]+/);
    if (!/\[Adblock(?:\s*Plus\s*([\d\.]+)?)?\]/i.test(lines[0]))
    {
      this.setError(subscription, "synchronize_invalid_data");
      return null;
    }
    let minVersion = RegExp.$1;

    for (let i = 0; i < lines.length; i++)
    {
      if (/!\s*checksum[\s\-:]+([\w\+\/]+)/i.test(lines[i]))
      {
        lines.splice(i, 1);
        let checksumExpected = RegExp.$1;
        let checksum = generateChecksum(lines);

        if (checksum && checksum != checksumExpected)
        {
          this.setError(subscription, "synchronize_checksum_mismatch");
          return null;
        }

        break;
      }
    }

    delete subscription.requiredVersion;
    delete subscription.upgradeRequired;
    if (minVersion)
    {
      subscription.requiredVersion = minVersion;
      if (abp.versionComparator.compare(minVersion, abp.getInstalledVersion()) > 0)
        subscription.upgradeRequired = true;
    }

    lines.shift();
    let result = [];
    for each (let line in lines)
    {
      let filter = Filter.fromText(normalizeFilter(line));
      if (filter)
        result.push(filter);
    }

    return result;
  },

  /**
   * Handles an error during a subscription download.
   * @param {DownloadableSubscription} subscription  subscription that failed to download
   * @param {String} error error ID in global.properties
   */
  setError: function(subscription, error)
  {
    subscription.lastDownload = parseInt(Date.now() / 1000);
    subscription.downloadStatus = error;
    if (error == "synchronize_checksum_mismatch")
    {
      // No fallback for successful download with checksum mismatch, reset error counter
      subscription.errors = 0;
    }
    else
      subscription.errors++;

    if (subscription.errors >= prefs.subscriptions_fallbackerrors && /^https?:\/\//i.test(subscription.url))
    {
      subscription.errors = 0;

      let request = new XMLHttpRequest();
      request.open("GET", prefs.subscriptions_fallbackurl.replace(/%s/g, encodeURIComponent(subscription.url)));
      request.overrideMimeType("text/plain");
      request.channel.loadGroup = null;
      request.channel.loadFlags = request.channel.loadFlags |
                                  request.channel.INHIBIT_CACHING |
                                  request.channel.VALIDATE_ALWAYS;
      request.onload = function(ev)
      {
        if (/^301\s+(\S+)/.test(request.responseText))  // Moved permanently    
          subscription.nextURL = RegExp.$1;
        else if (/^410\b/.test(request.responseText))   // Gone
        {
          subscription.autoDownload = false;
          filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);
        }
        filterStorage.saveToDisk();
      }
      request.send(null);
    }

    filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);
    filterStorage.saveToDisk();
  },

  /**
   * Starts the download of a subscription.
   * @param {DownloadableSubscription} subscription  Subscription to be downloaded
   * @param {Boolean}  forceDownload  if true, the subscription will even be redownloaded if it didn't change on the server
   */
  execute: function(subscription, forceDownload)
  {
    let url = subscription.url;
    if (url in this.executing)
      return;

    let newURL = subscription.nextURL;
    let hadTemporaryRedirect = false;
    subscription.nextURL = null;

    let curVersion = abp.getInstalledVersion();
    let loadFrom = (newURL || url).replace(/%VERSION%/, "ABP" + curVersion);

    let request = null;
    try {
      request = new XMLHttpRequest();
      request.open("GET", loadFrom);
    }
    catch (e) {
      this.setError(subscription, "synchronize_invalid_url");
      return;
    }

    try {
      request.overrideMimeType("text/plain");
      request.channel.loadGroup = null;
      request.channel.loadFlags = request.channel.loadFlags |
                                  request.channel.INHIBIT_CACHING |
                                  request.channel.VALIDATE_ALWAYS;

      var oldNotifications = request.channel.notificationCallbacks;
      var oldEventSink = null;
      request.channel.notificationCallbacks =
      {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIChannelEventSink]),

        getInterface: function(iid)
        {
          if (iid.equals(Ci.nsIChannelEventSink))
          {
            try {
              oldEventSink = oldNotifications.QueryInterface(iid);
            } catch(e) {}
            return this;
          }
    
          return (oldNotifications ? oldNotifications.QueryInterface(iid) : null);
        },

        onChannelRedirect: function(oldChannel, newChannel, flags)
        {
          if (flags & Ci.nsIChannelEventSink.REDIRECT_TEMPORARY)
            hadTemporaryRedirect = true;
          else if (!hadTemporaryRedirect)
            newURL = newChannel.URI.spec;

          if (oldEventSink)
            oldEventSink.onChannelRedirect(oldChannel, newChannel, flags);
        }
      }
    } catch (e) {}

    if (subscription.lastModified && !forceDownload)
      request.setRequestHeader("If-Modified-Since", subscription.lastModified);
      this.request = request;

    let me = this;
    request.onerror = function(ev)
    {
      delete me.executing[url];
      try {
        request.channel.notificationCallbacks = null;
      } catch (e) {}

      me.setError(subscription, "synchronize_connection_error");
    };

    request.onload = function(ev)
    {
      delete me.executing[url];
      try {
        request.channel.notificationCallbacks = null;
      } catch (e) {}

      // Status will be 0 for non-HTTP requests
      if (request.status && request.status != 200 && request.status != 304)
      {
        me.setError(subscription, "synchronize_connection_error");
        return;
      }

      let newFilters = null;
      if (request.status != 304)
      {
        newFilters = me.readFilters(subscription, request.responseText);
        if (!newFilters)
          return;

        subscription.lastModified = request.getResponseHeader("Last-Modified");
      }

      subscription.lastDownload = parseInt(Date.now() / 1000);
      subscription.downloadStatus = "synchronize_ok";
      subscription.errors = 0;

      let expires = parseInt(new Date(request.getResponseHeader("Expires")).getTime() / 1000) || 0;
      for each (let filter in newFilters)
      {
        if (filter instanceof CommentFilter && /\bExpires\s*(?::|after)\s*(\d+)\s*(h)?/i.test(filter.text))
        {
          var hours = parseInt(RegExp.$1);
          if (!RegExp.$2)
            hours *= 24;
          if (hours > 0)
          {
            let time = subscription.lastDownload + hours * 3600;
            if (time > expires)
              expires = time;
          }
        }
        if (filter instanceof CommentFilter && /\bRedirect(?:\s*:\s*|\s+to\s+|\s+)(\S+)/i.test(filter.text))
          subscription.nextURL = RegExp.$1;
      }
      subscription.expires = (expires > subscription.lastDownload ? expires : 0);

      // Expiration date shouldn't be more than two weeks in the future
      if (subscription.expires - subscription.lastDownload > 14*24*3600)
        subscription.expires = subscription.lastDownload + 14*24*3600;

      if (newURL && newURL != url)
      {
        let listed = (subscription.url in filterStorage.knownSubscriptions);
        if (listed)
          filterStorage.removeSubscription(subscription);

        url = newURL;

        let newSubscription = Subscription.fromURL(url);
        for (let key in newSubscription)
          delete newSubscription[key];
        for (let key in subscription)
          newSubscription[key] = subscription[key];

        delete Subscription.knownSubscriptions[subscription.url];
        newSubscription.oldSubscription = subscription;
        subscription = newSubscription;
        subscription.url = url;

        if (!(subscription.url in filterStorage.knownSubscriptions) && listed)
          filterStorage.addSubscription(subscription);
      }

      if (newFilters)
        filterStorage.updateSubscriptionFilters(subscription, newFilters);
      else
        filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);
      delete subscription.oldSubscription;

      filterStorage.saveToDisk();
    };

    this.executing[url] = true;
    filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);

    try {
      request.send(null);
    }
    catch (e) {
      this.setError(subscription, "synchronize_connection_error");
      return;
    }
  }
};
abp.synchronizer = synchronizer;
