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
 * The Original Code is Adblock Plus for Chrome.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2009-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  T. Joseph <tom@adblockplus.org>.
 *
 * ***** END LICENSE BLOCK ***** */

function ElemHidePatch()
{
  /**
   * Returns a list of selectors to be applied on a particular domain. With
   * specificOnly parameter set to true only the rules listing specific domains
   * will be considered.
   */
  ElemHide.getSelectorsForDomain = function(/**String*/ domain, /**Boolean*/ specificOnly)
  {
    var result = [];
    for (var key in filterByKey)
    {
      var filter = Filter.knownFilters[filterByKey[key]];
      if (specificOnly && !filter.includeDomains)
        continue;

      if (filter.isActiveOnDomain(domain))
        result.push(filter.selector);
    }
    return result;
  }
}

function FilterListenerPatch()
{
  /**
   * Triggers subscription observer "manually", temporary hack until that can
   * be done properly (via FilterStorage).
   */
  FilterListener.triggerSubscriptionObserver = function(action, subscriptions)
  {
    onSubscriptionChange(action, subscriptions);
  }

  /**
   * Triggers filter observer "manually", temporary hack until that can
   * be done properly (via FilterStorage).
   */
  FilterListener.triggerFilterObserver = function(action, filters)
  {
    onFilterChange(action, filters);
  }
}

function MatcherPatch()
{
  // Very ugly - we need to rewrite _checkEntryMatch() function to make sure
  // it calls Filter.fromText() instead of assuming that the filter exists.
  var origFunction = Matcher.prototype._checkEntryMatch.toString();
  var newFunction = origFunction.replace(/\bFilter\.knownFilters\[(.*?)\];/g, "Filter.fromText($1);");
  eval("Matcher.prototype._checkEntryMatch = " + newFunction);
}

var Components =
{
  interfaces: {},
  classes: {},
  results: {},
  utils: {},
  manager: null,
  ID: function()
  {
    return null;
  }
};
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var Utils =
{
  systemPrincipal: null,
  getString: function(id)
  {
    return id;
  }
};

var XPCOMUtils =
{
  generateQI: function() {}
};
