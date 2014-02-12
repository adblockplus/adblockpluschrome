/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
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

(function()
{
  /* Message passing */

  var sendMessage;
  if ("runtime" in chrome && "sendMessage" in chrome.runtime)
    sendMessage = chrome.runtime.sendMessage;
  else if ("sendMessage" in chrome.extension)
    sendMessage = chrome.extension.sendMessage;
  else
    sendMessage = chrome.extension.sendRequest;

  ext._setupMessageListener = function(wrapSender)
  {
    var onMessage;
    if ("runtime" in chrome && "onMessage" in chrome.runtime)
      onMessage = chrome.runtime.onMessage;
    else if ("onMessage" in chrome.extension)
      onMessage = chrome.extension.onMessage;
    else
      onMessage = chrome.extension.onRequest;

    onMessage.addListener(function(message, sender, sendResponse)
    {
      ext.onMessage._dispatch(message, wrapSender(sender), sendResponse);
    });
  };

  ext.onMessage = new ext._EventTarget();


  /* Background page */

  ext.backgroundPage = {
    sendMessage: sendMessage,
    getWindow: function()
    {
      return chrome.extension.getBackgroundPage();
    }
  };


  /* Utils */

  ext.getURL = chrome.extension.getURL;
  ext.i18n = chrome.i18n;
})();
