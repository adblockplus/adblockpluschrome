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

  var MessageProxy = ext._MessageProxy = function(messageDispatcher)
  {
    this._messageDispatcher = messageDispatcher;
    this._responseCallbacks = {__proto__: null};
    this._responseCallbackCounter = 0;
  };
  MessageProxy.prototype = {
    _sendResponse: function(request, message)
    {
      var response = {};
      for (var prop in request)
        response[prop] = request[prop];
      response.payload = message;

      this._messageDispatcher.dispatchMessage("response", response);
    },
    handleRequest: function(request, sender)
    {
      var sendResponse;
      if ("callbackId" in request)
        sendResponse = this._sendResponse.bind(this, request);
      else
        sendResponse = function() {};

      ext.onMessage._dispatch(request.payload, sender, sendResponse);
    },
    handleResponse: function(response)
    {
      var callbackId = response.callbackId;
      var callback = this._responseCallbacks[callbackId];
      if (callback)
      {
        delete this._responseCallbacks[callbackId];
        callback(response.payload);
      }
    },
    sendMessage: function(message, responseCallback, extra)
    {
      var request = {payload: message};

      if (responseCallback)
      {
        request.callbackId = ++this._responseCallbackCounter;
        this._responseCallbacks[request.callbackId] = responseCallback;
      }

      for (var prop in extra)
        request[prop] = extra[prop];

      this._messageDispatcher.dispatchMessage("request", request);
    }
  };

  ext.onMessage = new ext._EventTarget();


  /* I18n */

  var localeCandidates = null;
  var uiLocale;

  var getLocaleCandidates = function()
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
  };

  var getCatalog = function(locale)
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
  };

  ext.i18n = {
    getMessage: function(msgId, substitutions)
    {
      if (!localeCandidates)
      {
        localeCandidates = getLocaleCandidates();
        uiLocale = localeCandidates[0];
      }

      if (msgId == "@@ui_locale")
        return uiLocale;

      for (var i = 0; i < localeCandidates.length; i++)
      {
        var catalog = getCatalog(localeCandidates[i]);
        if (!catalog)
        {
          // if there is no catalog for this locale
          // candidate, don't try to load it again
          localeCandidates.splice(i--, 1);
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
          if (typeof substitutions != "string")
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


  /* Utils */

  ext.getURL = function(path)
  {
    return safari.extension.baseURI + path;
  };
})();
