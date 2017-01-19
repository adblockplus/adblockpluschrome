/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

{
  // Workaround since HTMLCollection and NodeList didn't have iterator support
  // before Chrome 51.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=401699
  if (!(Symbol.iterator in HTMLCollection.prototype))
    HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  if (!(Symbol.iterator in NodeList.prototype))
    NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];

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
}
