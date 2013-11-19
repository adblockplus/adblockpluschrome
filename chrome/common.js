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

  WrappedEventTarget = function(target)
  {
    this._listeners = [];
    this._wrappedListeners = [];
    this._target = target;
  };
  WrappedEventTarget.prototype = {
    _prepareExtraArguments: function()
    {
      return [];
    },
    addListener: function(listener)
    {
      var extraArgs = Array.prototype.slice.call(arguments, 1);
      extraArgs = this._prepareExtraArguments.apply(this, extraArgs);

      var wrappedListener = this._wrapListener(listener);
      this._listeners.push(listener);
      this._wrappedListeners.push(wrappedListener);

      this._target.addListener.apply(this._target, [wrappedListener].concat(extraArgs));
    },
    removeListener: function(listener)
    {
      var idx = this._listeners.indexOf(listener);

      if (idx != -1) {
        this._target.removeListener(this._wrappedListeners[idx]);

        this._listeners.splice(idx, 1);
        this._wrappedListeners.splice(idx, 1);
      }
    }
  };

  var MessageEventTarget = function()
  {
    WrappedEventTarget.call(this, (chrome.runtime || {}).onMessage || chrome.extension.onRequest);
  };
  MessageEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapListener: function(listener) {
      return function(message, sender, sendResponse)
      {
        return listener(message, {tab: sender.tab && new Tab(sender.tab)}, sendResponse);
      };
    }
  };


  /* API */

  ext = {
    backgroundPage: {
      sendMessage: (chrome.runtime || {}).sendMessage || chrome.extension.sendRequest,
      getWindow: chrome.extension.getBackgroundPage
    },
    getURL: chrome.extension.getURL,
    onMessage: new MessageEventTarget(),
    i18n: chrome.i18n
  };
})();
