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
  "fanboy_es": "Fanboy's Espa\xF1ol/Portugu\xEAs supplement",
  "france": 'EasyList + Liste FR (Fran\xE7ais)',
  "china": '<a href="http://code.google.com/p/adblock-chinalist/">ChinaList</a> (\u4E2D\u6587)',
  "russia": '<a href="http://code.google.com/p/ruadlist/">RU AdList</a> (\u0420\u0443\u0441\u0441\u043A\u0438\u0439, \u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430)',
  "korea": '<a href="http://corset.tistory.com/">Corset</a> (\uD55C\uAD6D\uC5B4)',
  "romania": '<a href="http://www.picpoc.ro/">ROList</a> (Rom\xE2nesc)',
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
  "hungary": 'Szab\xF3 P\xE9ter'
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
