/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2017 eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

(function()
{
  window.ext = {};

  let EventTarget = ext._EventTarget = function()
  {
    this._listeners = new Set();
  };
  EventTarget.prototype = {
    addListener(listener)
    {
      this._listeners.add(listener);
    },
    removeListener(listener)
    {
      this._listeners.delete(listener);
    },
    _dispatch(...args)
    {
      let results = [];
      let listeners = [...this._listeners];

      for (let listener of listeners)
        results.push(listener(...args));

      return results;
    }
  };

  // Workaround since HTMLCollection and NodeList didn't have iterator support
  // before Chrome 51.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=401699
  let arrayIterator = Array.prototype[Symbol.iterator];
  if (!(Symbol.iterator in HTMLCollection.prototype))
    HTMLCollection.prototype[Symbol.iterator] = arrayIterator;
  if (!(Symbol.iterator in NodeList.prototype))
    NodeList.prototype[Symbol.iterator] = arrayIterator;

  /* Message passing */

  ext.onMessage = new ext._EventTarget();


  /* Background page */

  ext.backgroundPage = {
    sendMessage: chrome.runtime.sendMessage,
    getWindow()
    {
      return chrome.extension.getBackgroundPage();
    }
  };


  /* Utils */

  ext.getURL = chrome.extension.getURL;
  ext.i18n = chrome.i18n;
}());
