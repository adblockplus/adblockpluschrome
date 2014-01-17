/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
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
  /* Events */

  SimpleEventTarget = function()
  {
    this._listeners = [];
  };
  SimpleEventTarget.prototype = {
    _onListenerAdded: function(listener, idx) {},
    _onListenerRemoved: function(listener, idx) {},

    addListener: function(listener)
    {
      var idx = this._listeners.push(listener) - 1;
      this._onListenerAdded(listener, idx);
    },
    removeListener: function(listener)
    {
      var idx = this._listeners.indexOf(listener);
      if (idx != -1)
      {
        this._listeners.splice(idx, 1);
        this._onListenerRemoved(listener, idx);
      }
    }
  };

  WrappedEventTarget = function(target)
  {
    SimpleEventTarget.call(this);

    this._wrappedListeners = [];
    this._target = target;
  };
  WrappedEventTarget.prototype = {
    __proto__: SimpleEventTarget.prototype,
    _onListenerAdded: function(listener, idx)
    {
      var wrappedListener = this._wrapListener(listener);

      this._wrappedListeners[idx] = wrappedListener;
      this._target.addListener.call(this._target, wrappedListener);
    },
    _onListenerRemoved: function(listener, idx)
    {
      this._target.removeListener(this._wrappedListeners[idx]);
      this._wrappedListeners.splice(idx, 1);
    }
  };

  MessageEventTarget = function()
  {
    var target;
    if ("runtime" in chrome && "onMessage" in chrome.runtime)
      target = chrome.runtime.onMessage;
    else if ("onMessage" in chrome.extension)
      target = chrome.extension.onMessage;
    else
      target = chrome.extension.onRequest;
    WrappedEventTarget.call(this, target);
  };
  MessageEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapSender: function(sender)
    {
      return {};
    },
    _wrapListener: function(listener)
    {
      return function(message, sender, sendResponse)
      {
        return listener(message, this._wrapSender(sender), sendResponse);
      }.bind(this);
    }
  };


  /* API */

  ext = {
    backgroundPage: {
      getWindow: function()
      {
        return chrome.extension.getBackgroundPage();
      }
    },
    getURL: chrome.extension.getURL,
    i18n: chrome.i18n
  };

  if ("runtime" in chrome && "sendMessage" in chrome.runtime)
    ext.backgroundPage.sendMessage = chrome.runtime.sendMessage;
  else if ("sendMessage" in chrome.extension)
    ext.backgroundPage.sendMessage = chrome.extension.sendMessage;
  else
    ext.backgroundPage.sendMessage = chrome.extension.sendRequest;
})();
