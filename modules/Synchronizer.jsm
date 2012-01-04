/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc5) {
  const MILLISECONDS_IN_SECOND = 1000;
  const SECONDS_IN_MINUTE = 60;
  const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE;
  const SECONDS_IN_DAY = 24 * SECONDS_IN_HOUR;
  const INITIAL_DELAY = 6 * SECONDS_IN_MINUTE;
  const CHECK_INTERVAL = SECONDS_IN_HOUR;
  const MIN_EXPIRATION_INTERVAL = 1 * SECONDS_IN_DAY;
  const MAX_EXPIRATION_INTERVAL = 14 * SECONDS_IN_DAY;
  const MAX_ABSENSE_INTERVAL = 1 * SECONDS_IN_DAY;
  var XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIJSXMLHttpRequest");
  var timer = null;
  var executing = {
    __proto__: null
  };
  var Synchronizer = {
    startup: function () {
      var callback = function () {
        timer.delay = CHECK_INTERVAL * MILLISECONDS_IN_SECOND;
        checkSubscriptions();
      }
      ;
      timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      timer.initWithCallback(callback, INITIAL_DELAY * MILLISECONDS_IN_SECOND, Ci.nsITimer.TYPE_REPEATING_SLACK);
    }
    ,
    isExecuting: function (url) {
      return url in executing;
    }
    ,
    execute: function (subscription, manual, forceDownload) {
      Utils.runAsync(this.executeInternal, this, subscription, manual, forceDownload);
    }
    ,
    executeInternal: function (subscription, manual, forceDownload) {
      var url = subscription.url;
      if (url in executing)
        return ;
      var newURL = subscription.nextURL;
      var hadTemporaryRedirect = false;
      subscription.nextURL = null;
      var curVersion = Utils.addonVersion;
      var loadFrom = newURL;
      var isBaseLocation = true;
      if (!loadFrom)
        loadFrom = url;
      if (loadFrom == url) {
        if (subscription.alternativeLocations) {
          var options = [[1, url]];
          var totalWeight = 1;
          for (var _loopIndex0 = 0;
          _loopIndex0 < subscription.alternativeLocations.split(",").length; ++ _loopIndex0) {
            var alternative = subscription.alternativeLocations.split(",")[_loopIndex0];
            if (!/^https?:\/\//.test(alternative))
              continue;
            var weight = 1;
            var weightingRegExp = /;q=([\d\.]+)$/;
            if (weightingRegExp.test(alternative)) {
              weight = parseFloat(RegExp["$1"]);
              if (isNaN(weight) || !isFinite(weight) || weight < 0)
                weight = 1;
              if (weight > 10)
                weight = 10;
              alternative = alternative.replace(weightingRegExp, "");
            }
            options.push([weight, alternative]);
            totalWeight += weight;
          }
          var choice = Math.random() * totalWeight;
          for (var _loopIndex1 = 0;
          _loopIndex1 < options.length; ++ _loopIndex1) {
            var weight = options[_loopIndex1][0];
            var alternative = options[_loopIndex1][1];
            choice -= weight;
            if (choice < 0) {
              loadFrom = alternative;
              break;
            }
          }
          isBaseLocation = (loadFrom == url);
        }
      }
       else {
        forceDownload = true;
      }
      loadFrom = loadFrom.replace(/%VERSION%/, "ABP" + curVersion);
      var request = null;
      function errorCallback(error) {
        var channelStatus = -1;
        try {
          channelStatus = request.channel.status;
        }
        catch (e){}
        var responseStatus = "";
        try {
          responseStatus = request.channel.QueryInterface(Ci.nsIHttpChannel).responseStatus;
        }
        catch (e){}
        setError(subscription, error, channelStatus, responseStatus, loadFrom, isBaseLocation, manual);
      }
      try {
        request = new XMLHttpRequest();
        request.mozBackgroundRequest = true;
        request.open("GET", loadFrom);
      }
      catch (e){
        errorCallback("synchronize_invalid_url");
        return ;
      }
      try {
        request.overrideMimeType("text/plain");
        request.channel.loadFlags = request.channel.loadFlags | request.channel.INHIBIT_CACHING | request.channel.VALIDATE_ALWAYS;
        if (request.channel instanceof Ci.nsIHttpChannel)
          request.channel.redirectionLimit = 5;
        var oldNotifications = request.channel.notificationCallbacks;
        var oldEventSink = null;
        request.channel.notificationCallbacks = {
          QueryInterface: XPCOMUtils.generateQI([Ci.nsIInterfaceRequestor, Ci.nsIChannelEventSink]),
          getInterface: function (iid) {
            if (iid.equals(Ci.nsIChannelEventSink)) {
              try {
                oldEventSink = oldNotifications.QueryInterface(iid);
              }
              catch (e){}
              return this;
            }
            if (oldNotifications)
              return oldNotifications.QueryInterface(iid);
             else
              throw Cr.NS_ERROR_NO_INTERFACE;
          }
          ,
          onChannelRedirect: function (oldChannel, newChannel, flags) {
            if (isBaseLocation && !hadTemporaryRedirect && oldChannel instanceof Ci.nsIHttpChannel) {
              try {
                subscription.alternativeLocations = oldChannel.getResponseHeader("X-Alternative-Locations");
              }
              catch (e){
                subscription.alternativeLocations = null;
              }
            }
            if (flags & Ci.nsIChannelEventSink.REDIRECT_TEMPORARY)
              hadTemporaryRedirect = true;
             else
              if (!hadTemporaryRedirect)
                newURL = newChannel.URI.spec;
            if (oldEventSink)
              oldEventSink.onChannelRedirect(oldChannel, newChannel, flags);
          }
          ,
          asyncOnChannelRedirect: function (oldChannel, newChannel, flags, callback) {
            this.onChannelRedirect(oldChannel, newChannel, flags);
            callback.onRedirectVerifyCallback(Cr.NS_OK);
          }
          
        };
      }
      catch (e){
        Cu.reportError(e);
      }
      if (subscription.lastModified && !forceDownload)
        request.setRequestHeader("If-Modified-Since", subscription.lastModified);
      request.addEventListener("error", function (ev) {
        delete executing[url];
        try {
          request.channel.notificationCallbacks = null;
        }
        catch (e){}
        errorCallback("synchronize_connection_error");
      }
      , false);
      request.addEventListener("load", function (ev) {
        delete executing[url];
        try {
          request.channel.notificationCallbacks = null;
        }
        catch (e){}
        if (request.status && request.status != 200 && request.status != 304) {
          errorCallback("synchronize_connection_error");
          return ;
        }
        var newFilters = null;
        if (request.status != 304) {
          newFilters = readFilters(subscription, request.responseText, errorCallback);
          if (!newFilters)
            return ;
          subscription.lastModified = request.getResponseHeader("Last-Modified");
        }
        if (isBaseLocation && !hadTemporaryRedirect)
          subscription.alternativeLocations = request.getResponseHeader("X-Alternative-Locations");
        subscription.lastSuccess = subscription.lastDownload = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
        subscription.downloadStatus = "synchronize_ok";
        subscription.errors = 0;
        var now = Math.round((new Date(request.getResponseHeader("Date")).getTime() || Date.now()) / MILLISECONDS_IN_SECOND);
        var expires = Math.round(new Date(request.getResponseHeader("Expires")).getTime() / MILLISECONDS_IN_SECOND) || 0;
        var expirationInterval = (expires ? expires - now : 0);
        for (var _loopIndex2 = 0;
        _loopIndex2 < (newFilters || subscription.filters).length; ++ _loopIndex2) {
          var filter = (newFilters || subscription.filters)[_loopIndex2];
          if (filter instanceof CommentFilter && /\bExpires\s*(?::|after)\s*(\d+)\s*(h)?/i.test(filter.text)) {
            var interval = parseInt(RegExp["$1"]);
            if (RegExp["$2"])
              interval *= SECONDS_IN_HOUR;
             else
              interval *= SECONDS_IN_DAY;
            if (interval > expirationInterval)
              expirationInterval = interval;
          }
        }
        expirationInterval = Math.min(Math.max(expirationInterval, MIN_EXPIRATION_INTERVAL), MAX_EXPIRATION_INTERVAL);
        subscription.expires = (subscription.lastDownload + expirationInterval * 2);
        subscription.softExpiration = (subscription.lastDownload + Math.round(expirationInterval * (Math.random() * 0.4 + 0.8)));
        if (newFilters) {
          for (var i = 0;
          i < newFilters.length; i++) {
            var filter = newFilters[i];
            if (filter instanceof CommentFilter && /^!\s*(\w+)\s*:\s*(.*)/.test(filter.text)) {
              var keyword = RegExp["$1"].toLowerCase();
              var value = RegExp["$2"];
              var known = true;
              if (keyword == "redirect") {
                if (isBaseLocation && value != url)
                  subscription.nextURL = value;
              }
               else
                if (keyword == "homepage") {
                  var uri = Utils.makeURI(value);
                  if (uri && (uri.scheme == "http" || uri.scheme == "https"))
                    subscription.homepage = uri.spec;
                }
                 else
                  known = false;
              if (known)
                newFilters.splice(i--, 1);
            }
          }
        }
        if (isBaseLocation && newURL && newURL != url) {
          var listed = (subscription.url in FilterStorage.knownSubscriptions);
          if (listed)
            FilterStorage.removeSubscription(subscription);
          url = newURL;
          var newSubscription = Subscription.fromURL(url);
          for (var key in newSubscription)
            delete newSubscription[key];
          for (var key in subscription)
            newSubscription[key] = subscription[key];
          delete Subscription.knownSubscriptions[subscription.url];
          newSubscription.oldSubscription = subscription;
          subscription = newSubscription;
          subscription.url = url;
          if (!(subscription.url in FilterStorage.knownSubscriptions) && listed)
            FilterStorage.addSubscription(subscription);
        }
        if (newFilters)
          FilterStorage.updateSubscriptionFilters(subscription, newFilters);
        delete subscription.oldSubscription;
        FilterStorage.saveToDisk();
      }
      , false);
      executing[url] = true;
      FilterNotifier.triggerListeners("subscription.downloadStatus", subscription);
      try {
        request.send(null);
      }
      catch (e){
        delete executing[url];
        errorCallback("synchronize_connection_error");
        return ;
      }
    }
    
  };
  function checkSubscriptions() {
    var hadDownloads = false;
    var time = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
    for (var _loopIndex3 = 0;
    _loopIndex3 < FilterStorage.subscriptions.length; ++ _loopIndex3) {
      var subscription = FilterStorage.subscriptions[_loopIndex3];
      if (!(subscription instanceof DownloadableSubscription))
        continue;
      if (subscription.lastCheck && time - subscription.lastCheck > MAX_ABSENSE_INTERVAL) {
        subscription.softExpiration += time - subscription.lastCheck;
      }
      subscription.lastCheck = time;
      if (subscription.expires - time > MAX_EXPIRATION_INTERVAL)
        subscription.expires = time + MAX_EXPIRATION_INTERVAL;
      if (subscription.softExpiration - time > MAX_EXPIRATION_INTERVAL)
        subscription.softExpiration = time + MAX_EXPIRATION_INTERVAL;
      if (subscription.softExpiration > time && subscription.expires > time)
        continue;
      if (time - subscription.lastDownload >= MIN_EXPIRATION_INTERVAL) {
        hadDownloads = true;
        Synchronizer.execute(subscription, false);
      }
    }
    if (!hadDownloads) {
      FilterStorage.saveToDisk();
    }
  }
  function readFilters(subscription, text, errorCallback) {
    var lines = text.split(/[\r\n]+/);
    if (!/\[Adblock(?:\s*Plus\s*([\d\.]+)?)?\]/i.test(lines[0])) {
      errorCallback("synchronize_invalid_data");
      return null;
    }
    var minVersion = RegExp["$1"];
    for (var i = 0;
    i < lines.length; i++) {
      if (/!\s*checksum[\s\-:]+([\w\+\/]+)/i.test(lines[i])) {
        lines.splice(i, 1);
        var checksumExpected = RegExp["$1"];
        var checksum = Utils.generateChecksum(lines);
        if (checksum && checksum != checksumExpected) {
          errorCallback("synchronize_checksum_mismatch");
          return null;
        }
        break;
      }
    }
    delete subscription.requiredVersion;
    delete subscription.upgradeRequired;
    if (minVersion) {
      subscription.requiredVersion = minVersion;
      if (Utils.versionComparator.compare(minVersion, Utils.addonVersion) > 0)
        subscription.upgradeRequired = true;
    }
    lines.shift();
    var result = [];
    for (var _loopIndex4 = 0;
    _loopIndex4 < lines.length; ++ _loopIndex4) {
      var line = lines[_loopIndex4];
      var filter = Filter.fromText(Filter.normalize(line));
      if (filter)
        result.push(filter);
    }
    return result;
  }
  function setError(subscription, error, channelStatus, responseStatus, downloadURL, isBaseLocation, manual) {
    if (!isBaseLocation)
      subscription.alternativeLocations = null;
    try {
      Cu.reportError("Adblock Plus: Downloading filter subscription " + subscription.title + " failed (" + Utils.getString(error) + ")\n" + "Download address: " + downloadURL + "\n" + "Channel status: " + channelStatus + "\n" + "Server response: " + responseStatus);
    }
    catch (e){}
    subscription.lastDownload = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
    subscription.downloadStatus = error;
    if (!manual) {
      if (error == "synchronize_checksum_mismatch") {
        subscription.errors = 0;
      }
       else
        subscription.errors++;
      if (subscription.errors >= Prefs.subscriptions_fallbackerrors && /^https?:\/\//i.test(subscription.url)) {
        subscription.errors = 0;
        var fallbackURL = Prefs.subscriptions_fallbackurl;
        fallbackURL = fallbackURL.replace(/%VERSION%/g, encodeURIComponent(Utils.addonVersion));
        fallbackURL = fallbackURL.replace(/%SUBSCRIPTION%/g, encodeURIComponent(subscription.url));
        fallbackURL = fallbackURL.replace(/%URL%/g, encodeURIComponent(downloadURL));
        fallbackURL = fallbackURL.replace(/%ERROR%/g, encodeURIComponent(error));
        fallbackURL = fallbackURL.replace(/%CHANNELSTATUS%/g, encodeURIComponent(channelStatus));
        fallbackURL = fallbackURL.replace(/%RESPONSESTATUS%/g, encodeURIComponent(responseStatus));
        var request = new XMLHttpRequest();
        request.mozBackgroundRequest = true;
        request.open("GET", fallbackURL);
        request.overrideMimeType("text/plain");
        request.channel.loadFlags = request.channel.loadFlags | request.channel.INHIBIT_CACHING | request.channel.VALIDATE_ALWAYS;
        request.addEventListener("load", function (ev) {
          if (!(subscription.url in FilterStorage.knownSubscriptions))
            return ;
          if (/^301\s+(\S+)/.test(request.responseText))
            subscription.nextURL = RegExp["$1"];
           else
            if (/^410\b/.test(request.responseText)) {
              var data = "[Adblock]\n" + subscription.filters.map(function (f) {
                return f.text;
              }).join("\n");
              var url = "data:text/plain," + encodeURIComponent(data);
              var newSubscription = Subscription.fromURL(url);
              newSubscription.title = subscription.title;
              newSubscription.disabled = subscription.disabled;
              FilterStorage.removeSubscription(subscription);
              FilterStorage.addSubscription(newSubscription);
              Synchronizer.execute(newSubscription);
            }
          FilterStorage.saveToDisk();
        }
        , false);
        request.send(null);
      }
    }
    FilterStorage.saveToDisk();
  }
  if (typeof _patchFunc5 != "undefined")
    eval("(" + _patchFunc5.toString() + ")()");
  window.Synchronizer = Synchronizer;
}
)(window.SynchronizerPatch);
