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
 * T. Joseph <tom@adblockplus.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Wladimir Palant
 *
 * ***** END LICENSE BLOCK ***** */

// List of suggested filter lists
var filterFiles = {
  "easylist": "https://easylist-downloads.adblockplus.org/easylist.txt", // "easylist.txt",
  "germany": "https://easylist-downloads.adblockplus.org/easylistgermany.txt", // "easylistgermany.txt",
  "fanboy": "https://secure.fanboy.co.nz/fanboy-adblock.txt",
  "fanboy_es": "https://secure.fanboy.co.nz/fanboy-espanol.txt",
  "france": "https://easylist-downloads.adblockplus.org/liste_fr+easylist.txt", // "liste_fr.txt",
  "china": "http://adblock-chinalist.googlecode.com/svn/trunk/adblock.txt", // "adblock.txt",
  "russia": "https://ruadlist.googlecode.com/svn/trunk/advblock.txt",
  "korea": "http://abp-corset.googlecode.com/hg/corset.txt", // "corset.txt",
  "romania": "http://www.zoso.ro/pages/rolist.txt", // "menetzrolist.txt",
  "italy": "http://mozilla.gfsolone.com/filtri.txt", // "filtri.txt",
  "poland": "http://www.niecko.pl/adblock/adblock.txt", // PLgeneral
  "hungary": "http://pete.teamlupus.hu/hufilter.txt", // hufilter
  "extras": "https://easylist-downloads.adblockplus.org/chrome_supplement.txt"
};

var filterListTitles = {
  "easylist": '<a href="http://easylist.adblockplus.org/">EasyList</a>',
  "germany": 'EasyList Germany',
  "fanboy": '<a href="http://www.fanboy.co.nz/adblock/">Fanboy\'s List</a>',
  "fanboy_es": "Fanboy's Español/Português supplement",
  "france": 'EasyList + Liste FR (Français)',
  "china": '<a href="http://code.google.com/p/adblock-chinalist/">ChinaList</a> (中文)',
  "russia": '<a href="http://code.google.com/p/ruadlist/">RU AdList</a> (Русский, Українська)',
  "korea": '<a href="http://corset.tistory.com/">Corset</a> (한국어)',
  "romania": '<a href="http://www.picpoc.ro/">ROList</a> (Românesc)',
  "italy": '<a href="http://mozilla.gfsolone.com/">Xfiles</a> (Italiano)',
  "poland": '<a href="http://www.niecko.pl/adblock/">PLgeneral</a> (Polski)',
  "hungary": '<a href="http://pete.teamlupus.hu/site/?pg=hufilter">hufilter</a> (Magyar)',
  "extras": '<a href="' + filterFiles["extras"] + '">Recommended filters for Google Chrome</a>'
};

var filterListAuthors = {
  "easylist": 'Michael, Ares2, Erunno, Khrin, MonztA',
  "germany": 'Ares2, Erunno, MonztA',
  "fanboy": 'fanboy, Nitrox',
  "fanboy_es": 'fanboy, Nitrox',
  "france": 'Lian',
  "china": 'Gythialy',
  "russia": 'Lain_13',
  "korea": 'maybee',
  "romania": 'MenetZ, Zoso',
  "italy": 'Gioxx',
  "poland": 'Krzysztof Niecko',
  "hungary": 'Szabó Péter'
};

// Filter lists turned on by default, guessed based on i18n reported locale.
// "easylist" and "extras" should be on by default everywhere, so it isn't included here.
var defaultFilterListsByLocale = {
  "de": ['easylist', 'germany'],
  "es": ['easylist', 'fanboy_es'],
  "fr": ['france'],
  "hu": ['easylist', 'hungary'],
  "it": ['easylist', 'italy'],
  "ko": ['easylist', 'korea'],
  "po": ['easylist', 'poland'],
  "pt": ['easylist', 'fanboy_es'],
  "pt_BR": ['easylist', 'fanboy_es'],
  "ro": ['easylist', 'romania'],
  "ru": ['easylist', 'russia'],
  "zh": ['easylist', 'china'],
  "zh_CN": ['easylist', 'china'],
  "zh_TW": ['easylist', 'china']
};

// Default filter list expiration time is 3 days (specified in milliseconds)
// But, in case that is garbled in the filter list, clamp it to a predefined range
const MILLISECONDS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE;
const SECONDS_IN_DAY = 24 * SECONDS_IN_HOUR;
const MIN_EXPIRATION_INTERVAL = 1 * SECONDS_IN_DAY;
const DEFAULT_EXPIRATION_INTERVAL =  3 * SECONDS_IN_DAY;
const MAX_EXPIRATION_INTERVAL = 14 * SECONDS_IN_DAY;

// Adds entries in filterFiles for any user filters. Other functions will
// reference filterFiles directly, even though global variables are evil.
function loadUserFilterURLs() {
  // Get rid of all user_* entries; we'll restore them from localStorage
  for(key in filterFiles) {
    if(key.match(/^user_/))
      delete filterFiles[key];
  }
  // Read the user filter URLs from localStorage
  if(typeof localStorage["userFilterURLs"] != "string")
    return; // Nothing there
  var urls = JSON.parse(localStorage["userFilterURLs"]);
  for(key in urls)
    filterFiles[key] = urls[key];
}

// TODO: In case of error fetching a filter list, check to see whether
// we already have a copy cached, and leave it there.
// At present the cached copy can be deleted.
function FilterListFetcher(nameOrUrl, callback) {
  this.name = nameOrUrl;
  // Accept name as URL if it starts with http
  this.url = nameOrUrl.match(/^http/i) ? nameOrUrl : filterFiles[nameOrUrl];
  this.callback = callback;
  this.xhr = new XMLHttpRequest();
  this.error = false;
  var fetcher = this;
  this.xhr.onreadystatechange = function() {
    if(this.readyState != 4)
      return;
    if(this.status == 200) {
      // Check if it's actually a filter set and if so, save it along with its expiry information
      var result = this.responseText;
      if (result.match(/\[Adblock/))
      {
        var expires = DEFAULT_EXPIRATION_INTERVAL;
        if (/\bExpires\s*(?::|after)\s*(\d+)\s*(h)?/i.test(result))
        {
          var interval = parseInt(RegExp.$1);
          if (RegExp.$2)
            interval *= SECONDS_IN_HOUR;
          else
            interval *= SECONDS_IN_DAY;

          if (interval > 0)
            expires = interval;
        }
        expires *= MILLISECONDS_IN_SECOND;

        localStorage[fetcher.url] = JSON.stringify({lastDownloaded: Date.now(), lastUpdated: Date.now(), expires: expires, text: result});
        fetcher.callback(fetcher);
        return;
      } else {
        fetcher.error = chrome.i18n.getMessage("not_a_filter_list");
        fetcher.callback(fetcher);
        return;
      }
    } else if(this.status == 404) {
      fetcher.error = chrome.i18n.getMessage("not_found_on_server");
      localStorage[fetcher.url] = JSON.stringify({lastUpdated: Date.now(), error: fetcher.error});
      fetcher.callback(fetcher);
      return;
    } else if(this.status == 503) {
      // Most likely a 503 means quota exceeded on the server
      // XXX: We aren't signaling an error here because we don't want to disable checking of this filter list
    }
    // TODO: Doesn't actually do anything in case of other errors
  }
  try {
    this.xhr.open("GET", this.url, true);
    this.xhr.send(null);
  } catch(e) {
    fetcher.error = "Useless error message: " + e;
    fetcher.callback(fetcher);        
  }
}
