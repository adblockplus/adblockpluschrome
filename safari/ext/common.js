/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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
    this._responseCallbacks = Object.create(null);
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
      if ("callbackId" in request)
      {
        var sent = false;
        var sendResponse = function(message)
        {
          this._sendResponse(request, message);
          sent = true;
        }.bind(this);

        var results = ext.onMessage._dispatch(request.payload, sender, sendResponse);

        // The onMessage listener has to return true to indicate that a response
        // is sent later asynchronously. Otherwise if no response was sent yet,
        // we sent a response indicating that there is no response, that
        // the other end can remove the callback and doesn't leak memory.
        if (!sent && results.indexOf(true) == -1)
          this._sendResponse(request, undefined);
      }
      else
      {
        ext.onMessage._dispatch(request.payload, sender, function() {});
      }
    },
    handleResponse: function(response)
    {
      var callbackId = response.callbackId;
      var callback = this._responseCallbacks[callbackId];
      if (callback)
      {
        delete this._responseCallbacks[callbackId];

        if (typeof response.payload != "undefined")
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

  var getLocaleCandidates = function()
  {
    var candidates = [];
    var defaultLocale = "en_US";

    // e.g. "ja-jp-mac" -> "ja_JP", note that the part after the second
    // dash is dropped, since we only support language and region
    var [language, region] = navigator.language.split("-");
    region = region.toUpperCase();

    // e.g. "es-AR" -> "es_419", note that we combine all dialects of
    // Spanish outside of Spain, the same way Google Chrome does,
    // since we use the same translations as for the Chrome extension
    if (language == "es" && region && region != "ES")
      region = "419";

    if (region)
      candidates.push(language + "_" + region);

    candidates.push(language);

    if (candidates.indexOf(defaultLocale) == -1)
      candidates.push(defaultLocale);

    return candidates;
  };

  var initCatalog = function(uiLocale)
  {
    var bidiDir = /^(ar|fa|he|ug|ur)(_|$)/.test(uiLocale) ? "rtl" : "ltr";
    var catalog = Object.create(null);

    catalog["@@ui_locale"] = [uiLocale, []];
    catalog["@@bidi_dir" ] = [bidiDir,  []];

    return catalog;
  };

  var locales = getLocaleCandidates();
  var catalog = initCatalog(locales[0]);

  var replacePlaceholder = function(text, placeholder, content)
  {
    return text.split("$" + placeholder + "$").join(content || "");
  };

  var parseMessage = function(rawMessage)
  {
    var text = rawMessage.message;
    var placeholders = [];

    for (var placeholder in rawMessage.placeholders)
    {
      var content = rawMessage.placeholders[placeholder].content;

      if (/^\$\d+$/.test(content))
        placeholders[parseInt(content.substr(1), 10) - 1] = placeholder;
      else
        text = replacePlaceholder(text, placeholder, content);
    }

    return [text, placeholders];
  };

  var readCatalog = function(locale)
  {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", safari.extension.baseURI + "_locales/" + locale + "/messages.json", false);

    try
    {
      xhr.send();
    }
    catch (e)
    {
      return;
    }

    if (xhr.status != 200 && xhr.status != 0)
      return;

    var rawCatalog = JSON.parse(xhr.responseText);
    for (var msgId in rawCatalog)
    {
      if (!(msgId in catalog))
        catalog[msgId] = parseMessage(rawCatalog[msgId]);
    }
  };

  ext.i18n = {
    getMessage: function(msgId, substitutions)
    {
      while (true)
      {
        var message = catalog[msgId];
        if (message)
        {
          var [text, placeholders] = message;

          if (!(substitutions instanceof Array))
            substitutions = [substitutions];

          for (var i = 0; i < placeholders.length; i++)
            text = replacePlaceholder(text, placeholders[i], substitutions[i]);

          return text;
        }

        if (locales.length == 0)
          return "";

        readCatalog(locales.shift());
      }
    }
  };


  /* Utils */

  ext.getURL = function(path)
  {
    return safari.extension.baseURI + path;
  };
})();
