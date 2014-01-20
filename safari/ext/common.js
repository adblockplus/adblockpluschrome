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

(function() {
  /* Events */

  WrappedEventTarget = function(target, eventName, capture)
  {
    this._listeners = [];
    this._wrappedListeners = [];

    this._target = target;
    this._eventName = eventName;
    this._capture = capture;
  };
  WrappedEventTarget.prototype = {
    addListener: function(listener)
    {
      var wrappedListener = this._wrapListener(listener);

      this._listeners.push(listener);
      this._wrappedListeners.push(wrappedListener);

      this._target.addEventListener(
        this._eventName,
        wrappedListener,
        this._capture
      );
    },
    removeListener: function(listener)
    {
      var idx = this._listeners.indexOf(listener);

      if (idx != -1)
      {
        this._target.removeEventListener(
          this._eventName,
          this._wrappedListeners[idx],
          this._capture
        );

        this._listeners.splice(idx, 1);
        this._wrappedListeners.splice(idx, 1);
      }
    }
  };

  MessageEventTarget = function(target)
  {
    WrappedEventTarget.call(this, target, "message", false);
  };
  MessageEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(event)
      {
        if (event.name == "request")
          listener(event.message.payload, this._getSenderDetails(event), function(message)
          {
            this._getResponseDispatcher(event).dispatchMessage("response",
            {
              requestId: event.message.requestId,
              payload: message
            });
          }.bind(this));
      }.bind(this);
    }
  };


  /* Message passing */

  var requestCounter = 0;

  _sendMessage = function(message, responseCallback, messageDispatcher, responseEventTarget, extra)
  {
    var requestId = ++requestCounter;

    if (responseCallback)
    {
      var responseListener = function(event)
      {
        if (event.name == "response" && event.message.requestId == requestId)
        {
          responseEventTarget.removeEventListener("message", responseListener, false);
          responseCallback(event.message.payload);
        }
      };
      responseEventTarget.addEventListener("message", responseListener, false);
    }

    var rawMessage = {requestId: requestId, payload: message};
    for (var k in extra)
      rawMessage[k] = extra[k];
    messageDispatcher.dispatchMessage("request", rawMessage);
  };


  /* I18n */

  var I18n = function()
  {
    this._localeCandidates = this._getLocaleCandidates();
    this._uiLocale = this._localeCandidates[0];
  };
  I18n.prototype = {
    _getLocaleCandidates: function()
    {
      var candidates = [];
      var defaultLocale = "en_US";

      var bits, i;
      for (i = (bits = navigator.language.split("-")).length; i > 0; i--)
      {
        var locale = bits.slice(0, i).join("_");
        candidates.push(locale);

        if (locale == defaultLocale)
          return candidates;
      }

      candidates.push(defaultLocale);
      return candidates;
    },
    _getCatalog: function(locale)
    {
      var xhr = new XMLHttpRequest();
      
      xhr.open("GET", safari.extension.baseURI + "_locales/" + locale + "/messages.json", false);

      try {
        xhr.send();
      }
      catch (e)
      {
        return null;
      }

      if (xhr.status != 200 && xhr.status != 0)
        return null;

      return JSON.parse(xhr.responseText);
    },
    getMessage: function(msgId, substitutions)
    {
      if (msgId == "@@ui_locale")
        return this._uiLocale;

      for (var i = 0; i < this._localeCandidates.length; i++)
      {
        var catalog = this._getCatalog(this._localeCandidates[i]);
        if (!catalog)
        {
          // if there is no catalog for this locale
          // candidate, don't try to load it again
          this._localeCandidates.splice(i--, 1);
          continue;
        }

        var msg = catalog[msgId];
        if (!msg)
          continue;

        var msgstr = msg.message;
        if (!msgstr)
          continue;

        for (var placeholder in msg.placeholders)
        {
          var placeholderDetails = msg.placeholders[placeholder];
          if (!placeholderDetails || !placeholderDetails.content)
            continue;
          if (placeholderDetails.content.indexOf("$") != 0)
            continue;

          var placeholderIdx = parseInt(placeholderDetails.content.substr(1));
          if (isNaN(placeholderIdx) || placeholderIdx < 1)
            continue;

          var placeholderValue;
          if (Object.prototype.toString.call(substitutions) == "[object Array]")
            placeholderValue = substitutions[placeholderIdx - 1];
          else if (placeholderIdx == 1)
            placeholderValue = substitutions;

          msgstr = msgstr.replace("$" + placeholder + "$", placeholderValue || "");
        }

        return msgstr;
      }

      return "";
    }
  };


  /* API */

  ext = {
    getURL: function(path)
    {
      return safari.extension.baseURI + path;
    },
    i18n: new I18n()
  };
})();
