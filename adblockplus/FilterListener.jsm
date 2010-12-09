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

(function (_patchFunc4) {
  var subscriptionFilter = null;
  var batchMode = false;
  var FilterListener = {
    startup: function () {
      onSubscriptionChange("reload", FilterStorage.subscriptions);
      FilterStorage.addSubscriptionObserver(onSubscriptionChange);
      FilterStorage.addFilterObserver(onFilterChange);
    }
    ,
    get batchMode() {
      return batchMode;
    }
    ,
    set batchMode(value) {
      batchMode = value;
      if (!batchMode && ElemHide.isDirty)
        ElemHide.apply();
    }
    
  };
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
      for (var _loopIndex0 = 0;
      _loopIndex0 < subscriptions.length; ++ _loopIndex0) {
        var subscription = subscriptions[_loopIndex0];
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
      for (var _loopIndex1 = 0;
      _loopIndex1 < subscriptions.length; ++ _loopIndex1) {
        var subscription = subscriptions[_loopIndex1];
        if (subscription.filters && (action == "disable" || !subscription.disabled))
          subscription.filters.forEach(method);
      }
    }
     else
      if (action == "update") {
        for (var _loopIndex2 = 0;
        _loopIndex2 < subscriptions.length; ++ _loopIndex2) {
          var subscription = subscriptions[_loopIndex2];
          if (!subscription.disabled) {
            subscription.oldFilters.forEach(removeFilter);
            subscription.filters.forEach(addFilter);
          }
        }
      }
       else
        if (action == "reload") {
          defaultMatcher.clear();
          ElemHide.clear();
          for (var _loopIndex3 = 0;
          _loopIndex3 < subscriptions.length; ++ _loopIndex3) {
            var subscription = subscriptions[_loopIndex3];
            if (!subscription.disabled)
              subscription.filters.forEach(addFilter);
          }
        }
    if (!batchMode && ElemHide.isDirty)
      ElemHide.apply();
  }
  function onFilterChange(action, filters) {
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
      if (!batchMode && ElemHide.isDirty)
        ElemHide.apply();
    }
  }
  if (typeof _patchFunc4 != "undefined")
    eval("(" + _patchFunc4.toString() + ")()");
  window.FilterListener = FilterListener;
}
)(window.FilterListenerPatch);
