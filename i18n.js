/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

// Loads and inserts i18n strings into matching elements. Any inner HTML already in the
// element is parsed as JSON and used as parameters to substitute into placeholders in the
// i18n message.
function loadI18nStrings() {
  var nodes = document.querySelectorAll("[class^='i18n_']");
  for(var i = 0; i < nodes.length; i++) {
    var arguments = JSON.parse("[" + nodes[i].textContent + "]");
    var stringName = nodes[i].className.split(/\s/)[0].substring(5);
    if(arguments.length > 0)
      nodes[i].innerHTML = chrome.i18n.getMessage(stringName, arguments);
    else
      nodes[i].innerHTML = chrome.i18n.getMessage(stringName);
  }
}

function i18n_time(h, m) {
  var locale = chrome.i18n.getMessage("@@ui_locale");
  if(m < 10)
    m = "0" + m;
  if(locale == "fr") {
    return h + "h" + m;
  } else {
    var ampm = "a.m.";
    if(h >= 12) {
      h -= 12;
      ampm = "p.m.";
    }
    if(h == 0)
      h = 12;
    return(h + ":" + m + " " + ampm);
  }
}

// Provides a more readable string of the current date and time
function i18n_timeDateStrings(when) {
  var d = new Date(when);
  var timeString = d.toLocaleTimeString();

  var now = new Date();
  if (d.toDateString() == now.toDateString())
    return [timeString];
  else
    return [timeString, d.toLocaleDateString()];
}
