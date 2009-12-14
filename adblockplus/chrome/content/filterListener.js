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
 * @fileOverview Component synchronizing filter storage with Matcher instances and elemhide.
 * This file is included from AdblockPlus.js.
 */

/**
 * This object will listen for changes in filters and subscription and forward these
 * to Matcher instances and elemhide object.
 * @class
 */
var filterListener =
{
  subscriptionFilter: null,

  _batchMode: false,
  /**
   * Set to true when executing many changes, changes will only be fully applied after this variable is set to false again.
   * @type Boolean
   */
  get batchMode()
  {
    return this._batchMode;
  },
  set batchMode(value)
  {
    this._batchMode = value;
    if (!this._batchMode && elemhide.isDirty)
      elemhide.apply();
  },

  /**
   * Registers listeners for filterStorage changes
   */
  init: function()
  {
    var me = this;
    filterStorage.addSubscriptionObserver(function(action, subscriptions) {me.onSubscriptionChange(action, subscriptions)});
    filterStorage.addFilterObserver(function(action, filters) {me.onFilterChange(action, filters)});
  },
  
  /**
   * Clears the filter lists.
   */
  clear: function()
  {
    blacklistMatcher.clear();
    whitelistMatcher.clear();
    elemhide.clear();
  },

  /**
   * Notifies Matcher instances or elemhide object about a new filter
   * if necessary.
   * @param {Filter} filter filter that has been added
   */
  addFilter: function(filter)
  {
    if (!(filter instanceof ActiveFilter) || filter.disabled || (this.subscriptionFilter && filter.subscriptions.some(this.subscriptionFilter)))
      return;

    if (filter instanceof BlockingFilter)
      blacklistMatcher.add(filter);
    else if (filter instanceof WhitelistFilter)
      whitelistMatcher.add(filter);
    else if (filter instanceof ElemHideFilter)
      elemhide.add(filter);
  },

  /**
   * Notifies Matcher instances or elemhide object about removal of a filter
   * if necessary.
   * @param {Filter} filter filter that has been removed
   */
  removeFilter: function(filter)
  {
    if (!(filter instanceof ActiveFilter) || (this.subscriptionFilter && filter.subscriptions.some(this.subscriptionFilter)))
      return;

    if (filter instanceof BlockingFilter)
      blacklistMatcher.remove(filter);
    else if (filter instanceof WhitelistFilter)
      whitelistMatcher.remove(filter);
    else if (filter instanceof ElemHideFilter)
      elemhide.remove(filter);
  },

  /**
   * Subscription change listener
   */
  onSubscriptionChange: function(action, subscriptions)
  {
    if (action != "remove")
    {
      subscriptions = subscriptions.filter(function(subscription)
      {
        // Ignore updates for subscriptions not in the list
        return subscription.url in filterStorage.knownSubscriptions;
      });
    }
    if (!subscriptions.length)
      return;

    if (action == "add" || action == "enable" ||
        action == "remove" || action == "disable" ||
        action == "update")
    {
      var subscriptionMap = {__proto__: null};
      for (i in subscriptions)
        subscriptionMap[subscriptions[i].url] = true;
      this.subscriptionFilter = function(subscription)
      {
        return !(subscription.url in subscriptionMap) && !subscription.disabled;
      }
    }
    else
      this.subscriptionFilter = null;

    if (action == "add" || action == "enable" ||
        action == "remove" || action == "disable")
    {
      var method = (action == "add" || action == "enable" ? this.addFilter : this.removeFilter);
      for (i in subscriptions)
        if (action == "disable" || !subscription.disabled)
          subscriptions[i].filters.forEach(method, this);
    }
    else if (action == "update")
    {
      for (i in subscriptions)
      {
        if (!subscriptions[i].disabled)
        {
          subscriptions[i].oldFilters.forEach(this.removeFilter, this);
          subscriptions[i].filters.forEach(this.addFilter, this);
        }
      }
    }
    else if (action == "reload")
    {
      blacklistMatcher.clear();
      whitelistMatcher.clear();
      elemhide.clear();
      for (i in subscriptions)
        if (!subscriptions[i].disabled)
          subscriptions[i].filters.forEach(this.addFilter, this);
    }

    if (!this._batchMode && elemhide.isDirty)
      elemhide.apply();
  },

  /**
   * Filter change listener
   */
  onFilterChange: function(action, filters)
  {
    if (action == "add" || action == "enable" ||
        action == "remove" || action == "disable")
    {
      this.subscriptionFilter = null;

      var method = (action == "add" || action == "enable" ? this.addFilter : this.removeFilter);
      if (action != "enable" && action != "disable")
      {
        filters = filters.filter(function(filter)
        {
          for (i in filter.subscriptions)
          {
            if (!(subscriptions[i] instanceof SpecialSubscription) || subscriptions[i].disabled)
              return false;
          }
          return true;
        });
      }
      filters.forEach(method, this);
      if (!this._batchMode && elemhide.isDirty)
        elemhide.apply();
    }
  }
};
abp.filterListener = filterListener;
