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
 * T. Joseph <ttjoseph@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2009-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Wladimir Palant
 *
 * ***** END LICENSE BLOCK ***** */

// Loads and inserts i18n strings into matching elements. Any inner HTML already in the
// element is parsed as JSON and used as parameters to substitute into placeholders in the
// i18n message.
function loadI18nStrings() {
    var nodes = document.querySelectorAll("[class^='i18n_']");
    for(var i = 0; i < nodes.length; i++) {
        var arguments = JSON.parse("[" + nodes[i].innerHTML + "]");
        if(arguments.length > 0)
            nodes[i].innerHTML = chrome.i18n.getMessage(nodes[i].className.substring(5), arguments);
        else
            nodes[i].innerHTML = chrome.i18n.getMessage(nodes[i].className.substring(5));
    }
}

function i18n_time(h, m) {
    var locale = chrome.i18n.getMessage("@@ui_locale");
    if(m < 10) m = "0" + m;
    if(locale == "fr") {
        return h + "h" + m;
    } else {
        var ampm = "a.m.";
        if(h >= 12) {
            h -= 12;
            ampm = "p.m.";
        }
        if(h == 0) h = 12;
        return(h + ":" + m + " " + ampm);
    }
}

// Provides a more readable string of the current date and time
function i18n_timeDateStrings(when) {
    var monthNames = JSON.parse(chrome.i18n.getMessage("month_names"));
    var d = new Date(when);
    var timeString = i18n_time(d.getHours(), d.getMinutes());
    var now = new Date();
    if(d.getDate() == now.getDate() && d.getMonth() == now.getMonth() && d.getFullYear() == now.getFullYear())
            dateString = chrome.i18n.getMessage("today");
    else
            dateString = chrome.i18n.getMessage("date_format", [d.getDate(), monthNames[d.getMonth()], d.getFullYear()]);
    
    return [timeString, dateString];
}

