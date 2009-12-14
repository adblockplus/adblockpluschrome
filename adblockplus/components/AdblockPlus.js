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
 * Portions created by the Initial Developer are Copyright (C) 2006-2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Constants / Globals
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const Node = Ci.nsIDOMNode;
const Element = Ci.nsIDOMElement;
const Window = Ci.nsIDOMWindow;

const loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const versionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"].createInstance(Ci.nsIVersionComparator);
var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
var windowWatcher= Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
try
{
  var headerParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
}
catch(e)
{
  headerParser = null;
}

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Application startup/shutdown observer, triggers init()/shutdown() methods in abp object.
 * @constructor
 */
function Initializer() {}
Initializer.prototype =
{
  classDescription: "Adblock Plus initializer",
  contractID: "@adblockplus.org/abp/startup;1",
  classID: Components.ID("{d32a3c00-4ed3-11de-8a39-0800200c9a66}"),
  _xpcom_categories: [{ category: "app-startup", service: true }],

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(subject, topic, data)
  {
    switch (topic)
    {
      case "app-startup":
        let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
        observerService.addObserver(this, "profile-after-change", true);
        observerService.addObserver(this, "quit-application", true);
        break;
      case "profile-after-change":
        abp.init();
        break;
      case "quit-application":
        abp.shutdown();
        break;
    }
  }
};

/**
 * Adblock Plus XPCOM component
 * @class
 */
const abp =
{
  classDescription: "Adblock Plus component",
  classID: Components.ID("{259c2980-505f-11de-8a39-0800200c9a66}"),
  contractID: "@mozilla.org/adblockplus;1",
  _xpcom_factory: {
    createInstance: function(outer, iid)
    {
      if (outer)
        throw Cr.NS_ERROR_NO_AGGREGATION;

      return abp.QueryInterface(iid);
    }
  },
  _xpcom_categories: [{category: "content-policy"}, {category: "net-channel-event-sinks"}],

  //
  // nsISupports interface implementation
  //

  QueryInterface: function(iid)
  {
    // Note: do not use |this| in this method! It is being used in the
    // content policy component as well.

    if (iid.equals(Ci.nsIContentPolicy) || iid.equals(Ci.nsIChannelEventSink))
      return policy;

    if (iid.equals(Ci.nsISupports))
      return abp;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  //
  // IAdblockPlus interface implementation
  //

  /**
   * Returns current subscription count
   * @type Integer
   */
  get subscriptionCount()
  {
    return filterStorage.subscriptions.length;
  },

  /**
   * Wraps a subscription into IAdblockPlusSubscription structure.
   */
  _getSubscriptionWrapper: function(/**Subscription*/ subscription) /**IAdblockPlusSubscription*/
  {
    if (!subscription)
      return null;

    return {
      url: subscription.url,
      special: subscription instanceof SpecialSubscription,
      title: subscription.title,
      autoDownload: subscription instanceof DownloadableSubscription && subscription.autoDownload,
      disabled: subscription.disabled,
      external: subscription instanceof ExternalSubscription,
      lastDownload: subscription instanceof RegularSubscription ? subscription.lastDownload : 0,
      downloadStatus: subscription instanceof DownloadableSubscription ? subscription.downloadStatus : "synchronize_ok",
      lastModified: subscription instanceof DownloadableSubscription ? subscription.lastModified : null,
      expires: subscription instanceof DownloadableSubscription ? subscription.expires : 0,
      getPatterns: function(length)
      {
        let result = subscription.filters.map(function(filter)
        {
          return filter.text;
        });
        if (typeof length == "object")
          length.value = result.length;
        return result;
      }
    };
  },

  /**
   * Gets a subscription by its URL
   */
  getSubscription: function(/**String*/ id) /**IAdblockPlusSubscription*/
  {
    if (id in filterStorage.knownSubscriptions)
      return this._getSubscriptionWrapper(filterStorage.knownSubscriptions[id]);

    return null;
  },

  /**
   * Gets a subscription by its position in the list
   */
  getSubscriptionAt: function(/**Integer*/ index) /**IAdblockPlusSubscription*/
  {
    if (index < 0 || index >= filterStorage.subscriptions.length)
      return null;

    return this._getSubscriptionWrapper(filterStorage.subscriptions[index]);
  },

  /**
   * Updates an external subscription and creates it if necessary
   */
  updateExternalSubscription: function(/**String*/ id, /**String*/ title, /**Array of Filter*/ filters, /**Integer*/ length) /**Boolean*/
  {
    if (id == "Filterset.G" && this.denyFiltersetG)
      return false;

    try
    {
      // Don't allow valid URLs as IDs for external subscriptions
      if (ioService.newURI(id, null, null))
        return false;
    } catch (e) {}

    let subscription = Subscription.fromURL(id);
    if (!subscription)
      subscription = new ExternalSubscription(id, title);

    if (!(subscription instanceof ExternalSubscription))
      return false;

    subscription.lastDownload = parseInt(new Date().getTime() / 1000);

    let newFilters = [];
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        newFilters.push(filter);
    }

    if (id in filterStorage.knownSubscriptions)
      filterStorage.updateSubscriptionFilters(subscription, newFilters);
    else
    {
      subscription.filters = newFilters;
      filterStorage.addSubscription(subscription);
    }
    filterStorage.saveToDisk();

    return true;
  },

  /**
   * Removes an external subscription by its identifier
   */
  removeExternalSubscription: function(/**String*/ id) /**Boolean*/
  {
    if (!(id in filterStorage.knownSubscriptions && filterStorage.knownSubscriptions[id] instanceof ExternalSubscription))
      return false;

    filterStorage.removeSubscription(filterStorage.knownSubscriptions[id]);
    return true;
  },

  /**
   * Adds user-defined filters to the list
   */
  addPatterns: function(/**Array of String*/ filters, /**Integer*/ length)
  {
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        filterStorage.addFilter(filter);
    }
    filterStorage.saveToDisk();
  },

  /**
   * Removes user-defined filters from the list
   */
  removePatterns: function(/**Array of String*/ filters, /**Integer*/ length)
  {
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        filterStorage.removeFilter(filter);
    }
    filterStorage.saveToDisk();
  },

  /**
   * Returns installed Adblock Plus version
   */
  getInstalledVersion: function() /**String*/
  {
    return "{{VERSION}}";
  },

  /**
   * Returns source code revision this Adblock Plus build was created from (if available)
   */
  getInstalledBuild: function() /**String*/
  {
    return "{{BUILD}}";
  },

  //
  // Custom methods
  //

  /**
   * Will be set to true if init() was called already.
   * @type Boolean
   */
  initialized: false,

  /**
   * If true, incoming updates for Filterset.G should be rejected.
   * @type Boolean
   */
  denyFiltersetG: false,

  /**
   * Version comparator instance.
   * @type nsIVersionComparator
   */
  versionComparator: versionComparator,

  /**
   * Initializes the component, called on application startup.
   */
  init: function()
  {
    timeLine.enter("Entered abp.init()");

    if (this.initialized)
      return;
    this.initialized = true;

    timeLine.log("calling prefs.init()");
    prefs.init();

    timeLine.log("calling filterListener.init()");
    filterListener.init();

    timeLine.log("calling filterStorage.init()");
    filterStorage.init();

    timeLine.log("calling policy.init()");
    policy.init();

    timeLine.log("calling elemhide.init()");
    elemhide.init();

    timeLine.log("calling synchronizer.init()");
    synchronizer.init();

    timeLine.leave("abp.init() done");
  },

  /**
   * Saves all unsaved changes, called on application shutdown.
   */
  shutdown: function()
  {
    filterStorage.saveToDisk();
  },

  /**
   * Adds a new subscription to the list or changes the parameters of
   * an existing filter subscription.
   */
  addSubscription: function(/**String*/ url, /**String*/ title, /**Boolean*/ autoDownload, /**Boolean*/ disabled)
  {
    if (typeof autoDownload == "undefined")
      autoDownload = true;
    if (typeof disabled == "undefined")
      disabled = false;

    let subscription = Subscription.fromURL(url);
    if (!subscription)
      return;

    filterStorage.addSubscription(subscription);

    if (disabled != subscription.disabled)
    {
      subscription.disabled = disabled;
      filterStorage.triggerSubscriptionObservers(disabled ? "disable" : "enable", [subscription]);
    }

    subscription.title = title;
    if (subscription instanceof DownloadableSubscription)
      subscription.autoDownload = autoDownload;
    filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);

    if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
      synchronizer.execute(subscription);
    filterStorage.saveToDisk();
  },

  /**
   * Opens preferences dialog or focused already open dialog.
   * @param {String} location  (optional) filter suggestion
   * @param {Filter} filter    (optional) filter to be selected
   */
  openSettingsDialog: function(location, filter)
  {
    var dlg = windowMediator.getMostRecentWindow("abp:settings");
    var func = function()
    {
      if (typeof location == "string")
        dlg.setLocation(location);
      if (filter instanceof Filter)
        dlg.selectFilter(filter);
    }

    if (dlg)
    {
      func();

      try
      {
        dlg.focus();
      }
      catch (e)
      {
        // There must be some modal dialog open
        dlg = windowMediator.getMostRecentWindow("abp:subscription") || windowMediator.getMostRecentWindow("abp:about");
        if (dlg)
          dlg.focus();
      }
    }
    else
    {
      dlg = windowWatcher.openWindow(null, "chrome://adblockplus/content/ui/settings.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", null);
      dlg.addEventListener("post-load", func, false);
    }
  },

  /**
   * Opens a URL in the browser window. If browser window isn't passed as parameter,
   * this function attempts to find a browser window.
   */
  loadInBrowser: function(/**String*/ url, /**Window*/ currentWindow)
  {
    currentWindow = currentWindow ||
                    windowMediator.getMostRecentWindow("navigator:browser") ||
                    windowMediator.getMostRecentWindow("Songbird:Main") ||
                    windowMediator.getMostRecentWindow("emusic:window");
    let abpHooks = currentWindow ? currentWindow.document.getElementById("abp-hooks") : null;
    if (!abpHooks || !abpHooks.addTab || abpHooks.addTab(url) === false)
    {
      let protocolService = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
      protocolService.loadURI(makeURL(url), null);
    }
  },

  params: null,

  /**
   * Saves sidebar state before detaching/reattaching
   */
  setParams: function(params)
  {
    this.params = params;
  },

  /**
   * Retrieves and removes sidebar state after detaching/reattaching
   */
  getParams: function()
  {
    var ret = this.params;
    this.params = null;
    return ret;
  },

  headerParser: headerParser
};
abp.wrappedJSObject = abp;

/*
 * Module declaration
 */
function ABPComponent() {}
ABPComponent.prototype = abp;
var NSGetModule = XPCOMUtils.generateNSGetModule([Initializer, ABPComponent]);

/*
 * Loading additional files
 */
loader.loadSubScript('chrome://adblockplus/content/utils.js');
loader.loadSubScript('chrome://adblockplus/content/filterClasses.js');
loader.loadSubScript('chrome://adblockplus/content/subscriptionClasses.js');
loader.loadSubScript('chrome://adblockplus/content/filterStorage.js');
loader.loadSubScript('chrome://adblockplus/content/matcher.js');
loader.loadSubScript('chrome://adblockplus/content/elemhide.js');
loader.loadSubScript('chrome://adblockplus/content/filterListener.js');
loader.loadSubScript('chrome://adblockplus/content/policy.js');
loader.loadSubScript('chrome://adblockplus/content/requests.js');
loader.loadSubScript('chrome://adblockplus/content/prefs.js');
loader.loadSubScript('chrome://adblockplus/content/synchronizer.js');

/*
 * Core Routines
 */

/**
 * Time logging module, used to measure startup time of Adblock Plus (development builds only).
 * @class
 */
var timeLine = {
  _nestingCounter: 0,
  _lastTimeStamp: null,

  /**
   * Logs an event to console together with the time it took to get there.
   */
  log: function(/**String*/ message, /**Boolean*/ _forceDisplay)
  {
    if (!_forceDisplay && this._invocationCounter <= 0)
      return;

    let now = (new Date()).getTime();
    let diff = this._lastTimeStamp ? (now - this._lastTimeStamp) : "first event";
    this._lastTimeStamp = now;

    // Indent message depending on current nesting level
    for (let i = 0; i < this._nestingCounter; i++)
      message = "* " + message;

    // Pad message with spaces
    let padding = [];
    for (let i = message.toString().length; i < 40; i++)
      padding.push(" ");
    dump("ABP timeline: " + message + padding.join("") + "\t (" + diff + ")\n");
  },

  /**
   * Called to indicate that application entered a block that needs to be timed.
   */
  enter: function(/**String*/ message)
  {
    this.log(message, true);
    this._nestingCounter = (this._nestingCounter <= 0 ? 1 : this._nestingCounter + 1);
  },

  /**
   * Called when applicaiton exited a block that timeLine.enter() was called for.
   */
  leave: function(/**String*/ message)
  {
    this._nestingCounter--;
    this.log(message, true);

    if (this._nestingCounter <= 0)
      this._lastTimeStamp = null;
  }
};
