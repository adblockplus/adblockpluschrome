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
 * @fileOverview Element hiding implementation.
 * This file is included from AdblockPlus.js.
 */

/**
 * Element hiding component
 * @class
 */
var elemhide =
{
  /**
   * List of known filters
   * @type Array of ElemHideFilter
   */
  filters: [],

  /**
   * Lookup table, has keys for all filters already added
   * @type Object
   */
  knownFilters: {__proto__: null},

  /**
   * Lookup table for filters by their associated key
   * @type Object
   */
  keys: {__proto__: null},

  /**
   * Currently applied stylesheet URL
   * @type nsIURI
   */
  url: null,

  /**
   * Indicates whether filters have been added or removed since the last apply() call.
   * @type Boolean
   */
  isDirty: false,

  /**
   * Initialization function, should be called after policy initialization.
   */
  init: function()
  {
  },

  /**
   * Removes all known filters
   */
  clear: function()
  {
    this.filters = [];
    this.knownFilters= {__proto__: null};
    this.keys = {__proto__: null};
    this.isDirty = false;
    this.unapply();
  },

  /**
   * Add a new element hiding filter
   * @param {ElemHideFilter} filter
   */
  add: function(filter)
  {
    if (filter.text in this.knownFilters)
      return;

    this.filters.push(filter);

    do {
      filter.key = Math.random().toFixed(15).substr(5);
    } while (filter.key in this.keys);

    this.keys[filter.key] = filter;
    this.knownFilters[filter.text] = true;
    this.isDirty = true;
  },

  /**
   * Removes an element hiding filter
   * @param {ElemHideFilter} filter
   */
  remove: function(filter)
  {
    if (!(filter.text in this.knownFilters))
      return;

    var i = this.filters.indexOf(filter);
    if (i >= 0)
      this.filters.splice(i, 1);

    delete this.keys[filter.key];
    delete this.knownFilters[filter.text];
    this.isDirty = true;
  },
  
    // Returns a list of CSS selectors that should be hidden
    getSelectorsToHide: function(domain) {
        // TODO: cache by domain
        var selectors = new Array();
        for (i in this.filters) {
            sel = this.filters[i].selector;
            if(this.filters[i].isActiveOnDomain(domain) /* && (sel[0] == '#' || sel[0] == '.') */)
            	selectors.push(sel);
        }
        return selectors;
  },

  get_css_data: function(domain) {
	var cssData = "";
	for (i in this.filters) {
		sel = this.filters[i].selector;
		if(this.filters[i].isActiveOnDomain(domain) && (sel[0] == '#' || sel[0] == '.'))
			cssData += sel + " { display:none !important }\n";
	}
	return cssData;
  },

  /**
   * Generates stylesheet URL and applies it globally
   */
  get_css_data_crap: function()
  {
    // Return immediately if nothing to do
    //if (!this.url && (!prefs.enabled || !this.filters.length))
    //  return;

    // Grouping selectors by domains
    var domains = {__proto__: null};
    for (i in this.filters)
    {
      var filter = this.filters[i];
     // console.log(filter.selector);
      var domain = filter.selectorDomain || "";

      var list;
      if (domain in domains)
        list = domains[domain];
      else
      {
        list = {__proto__: null};
        domains[domain] = list;
      }
      list[filter.selector] = filter.key;
    }

    // Joining domains list
    var cssData = "";
    var cssTemplate = "-moz-binding: url(" + this.scheme + "://%ID%/#dummy) !important;";

    for (i in domains)
    {
      var domain = domains[i];
      var rules = [];
      var list = domains[domain];
      for (i in list) {
        selector = list[i];
	//console.log(selector);
        rules.push(selector + "{" + cssTemplate.replace("%ID%", list[selector]) + "}\n");
      }

      //if (domain)
        // cssData += '@-moz-document domain("' + domain.split(",").join('"),domain("') + '"){\n' + rules.join('') + '}\n';
	cssData = rules.join('');
      //else {
        // Only allow unqualified rules on a few protocols to prevent them from blocking chrome
     //   cssData += '@-moz-document url-prefix("http://"),url-prefix("https://"),'
     //             + 'url-prefix("mailbox://"),url-prefix("imap://"),'
     //             + 'url-prefix("news://"),url-prefix("snews://"){\n'
     //               + rules.join('')
     //             + '}\n';
     // } 
    }
    timeLine.log("done building CSS data");

    return(cssData);

    /*if (cssData)
    {
      timeLine.log("start inserting stylesheet");
      try {
        this.url = ioService.newURI("data:text/css;charset=utf8," + encodeURIComponent("\n" + cssData), null, null);
        styleService.loadAndRegisterSheet(this.url, styleService.USER_SHEET);
      } catch(e) {};
      timeLine.log("done inserting stylesheet");
    }
    timeLine.leave("elemhide.apply() done");
*/
  },

  /**
   * Unapplies current stylesheet URL
   */
  unapply: function()
  {
    if (this.url) {
      try {
        styleService.unregisterSheet(this.url, styleService.USER_SHEET);
      } catch (e) {}
      this.url = null;
    }
  },
};
abp.elemhide = elemhide;
