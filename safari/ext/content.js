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
  // the safari object is missing in frames created from javascript: URLs.
  // So we have to fallback to the safari object from the parent frame.
  if (!("safari" in window))
    window.safari = window.parent.safari;


  /* Intialization */

  var beforeLoadEvent = document.createEvent("Event");
  beforeLoadEvent.initEvent("beforeload");

  var isTopLevel = window == window.top;
  var isPrerendered = document.visibilityState == "prerender";

  var documentInfo = safari.self.tab.canLoad(
    beforeLoadEvent,
    {
      category: "loading",
      url: window.location.href,
      referrer: document.referrer,
      isTopLevel: isTopLevel,
      isPrerendered: isPrerendered
    }
  );

  if (isTopLevel && isPrerendered)
  {
    var onVisibilitychange = function()
    {
      safari.self.tab.dispatchMessage("replaced", {pageId: documentInfo.pageId});
      document.removeEventListener("visibilitychange", onVisibilitychange);
    };
    document.addEventListener("visibilitychange", onVisibilitychange);
  }


  /* Web requests */

  document.addEventListener("beforeload", function(event)
  {
    var url = resolveURL(event.url);

    // we don't block non-HTTP requests anyway, so we can bail out
    // without asking the background page. This is even necessary
    // because passing large data (like a photo encoded as data: URL)
    // to the background page, freezes Safari.
    if (!/^https?:/.test(url))
      return;

    var type;
    switch(event.target.localName)
    {
      case "frame":
      case "iframe":
        type = "sub_frame";
        break;
      case "img":
        type = "image";
        break;
      case "object":
      case "embed":
        type = "object";
        break;
      case "script":
        type = "script";
        break;
      case "link":
        if (/\bstylesheet\b/i.test(event.target.rel))
        {
          type = "stylesheet";
          break;
        }
      default:
        type = "other";
    }

    if (!safari.self.tab.canLoad(
      event, {
        category: "webRequest",
        url: url,
        type: type,
        pageId: documentInfo.pageId,
        frameId: documentInfo.frameId
      }
    ))
    {
      event.preventDefault();

      // Safari doesn't dispatch an "error" event when preventing an element
      // from loading by cancelling the "beforeload" event. So we have to
      // dispatch it manually. Otherwise element collapsing wouldn't work.
      if (type != "sub_frame")
      {
        setTimeout(function()
        {
          var evt = document.createEvent("Event");
          evt.initEvent("error");
          event.target.dispatchEvent(evt);
        }, 0);
      }
    }
  }, true);


  /* Context menus */

  document.addEventListener("contextmenu", function(event)
  {
    var element = event.srcElement;
    safari.self.tab.setContextMenuEventUserInfo(event, {
      pageId: documentInfo.pageId,
      srcUrl: ("src" in element) ? element.src : null,
      tagName: element.localName
    });
  });


  /* Background page */

  var backgroundPageProxy = {
    objects: [],
    callbacks: [],

    send: function(message)
    {
      message.category = "proxy";
      message.pageId = documentInfo.pageId;

      return safari.self.tab.canLoad(beforeLoadEvent, message);
    },
    checkResult: function(result)
    {
      if (!result.succeed)
        throw result.error;
    },
    deserializeResult: function(result)
    {
      this.checkResult(result);
      return this.deserialize(result.result);
    },
    serialize: function(obj, memo)
    {
      if (typeof obj == "object" && obj != null || typeof obj == "function")
      {
        if ("__proxyObjectId" in obj)
          return {type: "hosted", objectId: obj.__proxyObjectId};

        if (typeof obj == "function")
        {
          var callbackId;
          if ("__proxyCallbackId" in obj)
            callbackId = obj.__proxyCallbackId;
          else
          {
            callbackId = this.callbacks.push(obj) - 1;
            Object.defineProperty(obj, "__proxyCallbackId", {value: callbackId});
          }

          return {type: "callback", callbackId: callbackId, frameId: documentInfo.frameId};
        }

        if (obj.constructor != Date && obj.constructor != RegExp)
        {
          if (!memo)
            memo = {specs: [], objects: []};

          var idx = memo.objects.indexOf(obj);
          if (idx != -1)
            return memo.specs[idx];

          var spec = {};
          memo.specs.push(spec);
          memo.objects.push(obj);

          if (obj.constructor == Array)
          {
            spec.type = "array";
            spec.items = [];

            for (var i = 0; i < obj.length; i++)
              spec.items.push(this.serialize(obj[i], memo));
          }
          else
          {
            spec.type = "object";
            spec.properties = {};

            for (var k in obj)
              spec.properties[k] = this.serialize(obj[k], memo);
          }

          return spec;
        }
      }

      return {type: "value", value: obj};
    },
    deserializeSequence: function(specs, array, memo)
    {
      if (!array)
        array = [];

      if (!memo)
        memo = {specs: [], arrays: []};

      for (var i = 0; i < specs.length; i++)
        array.push(this.deserialize(specs[i], memo));

      return array;
    },
    deserialize: function(spec, memo)
    {
      switch (spec.type)
      {
        case "value":
          return spec.value;
        case "object":
          return this.getObject(spec.objectId);
        case "array":
          if (!memo)
            memo = {specs: [], arrays: []};

          var idx = memo.specs.indexOf(spec);
          if (idx != -1)
            return memo.arrays[idx];

          var array = [];
          memo.specs.push(spec);
          memo.arrays.push(array);

          return this.deserializeSequence(spec.items, array, memo);
      }
    },
    getProperty: function(objectId, property)
    {
      return this.deserializeResult(
        this.send(
        {
          type: "getProperty",
          objectId: objectId,
          property: property
        })
      );
    },
    createProperty: function(property, enumerable)
    {
      var proxy = this;
      return {
        get: function()
        {
          return proxy.getProperty(this.__proxyObjectId, property);
        },
        set: function(value)
        {
          proxy.checkResult(
            proxy.send(
            {
              type: "setProperty",
              objectId: this.__proxyObjectId,
              property: property,
              value: proxy.serialize(value)
            })
          );
        },
        enumerable: enumerable,
        configurable: true
      };
    },
    createFunction: function(objectId)
    {
      var proxy = this;
      return function()
      {
        return proxy.deserializeResult(
          proxy.send(
          {
            type: "callFunction",
            functionId: objectId,
            contextId: this.__proxyObjectId,
            args: Array.prototype.map.call(
              arguments,
              proxy.serialize.bind(proxy)
            )
          })
        );
      };
    },
    handleCallback: function(message)
    {
      this.callbacks[message.callbackId].apply(
        this.getObject(message.contextId),
        this.deserializeSequence(message.args)
      );
    },
    getObject: function(objectId)
    {
      var objectInfo = this.send({
        type: "inspectObject",
        objectId: objectId
      });

      var obj = this.objects[objectId];
      if (obj)
        Object.getOwnPropertyNames(obj).forEach(function(prop) { delete obj[prop]; });
      else
      {
        if (objectInfo.isFunction)
          obj = this.createFunction(objectId);
        else
          obj = {};

        this.objects[objectId] = obj;
        Object.defineProperty(obj, "__proxyObjectId", {value: objectId});
      }

      var excluded = [];
      var included = [];
      if ("prototypeOf" in objectInfo)
      {
        var prototype = window[objectInfo.prototypeOf].prototype;

        excluded = Object.getOwnPropertyNames(prototype);
        included = ["constructor"];

        obj.__proto__ = prototype;
      }
      else
      {
        if (objectInfo.isFunction)
        {
          excluded = Object.getOwnPropertyNames(function() {});
          included = ["prototype"];
        }

        if ("prototypeId" in objectInfo)
          obj.__proto__ = this.getObject(objectInfo.prototypeId);
        else
          obj.__proto__ = null;
      }

      for (var property in objectInfo.properties)
      {
        if (excluded.indexOf(property) == -1 || included.indexOf(property) != -1)
        {
          var desc = Object.getOwnPropertyDescriptor(obj, property);

          if (!desc || desc.configurable)
          {
            Object.defineProperty(obj, property, this.createProperty(
              property, objectInfo.properties[property].enumerable
            ));
          }
          else if (desc.writable)
            obj[property] = this.getProperty(objectId, property);
        }
      }

      return obj;
    }
  };

  ext.backgroundPage = {
    sendMessage: function(message, responseCallback)
    {
      messageProxy.sendMessage(message, responseCallback, documentInfo);
    },
    sendMessageSync: function(message)
    {
      return safari.self.tab.canLoad(
        beforeLoadEvent,
        {
          category: "request",
          pageId: documentInfo.pageId,
          frameId: documentInfo.frameId,
          payload: message
        }
      );
    },
    getWindow: function()
    {
      return backgroundPageProxy.getObject(0);
    }
  };


  /* Message processing */

  var messageProxy = new ext._MessageProxy(safari.self.tab);

  safari.self.addEventListener("message", function(event)
  {
    if (event.message.pageId == documentInfo.pageId)
    {
      if (event.name == "request")
      {
        messageProxy.handleRequest(event.message, {});
        return;
      }

      if (event.message.frameId == documentInfo.frameId)
      {
        switch (event.name)
        {
          case "response":
            messageProxy.handleResponse(event.message);
            break;
          case "proxyCallback":
            backgroundPageProxy.handleCallback(event.message);
            break;
        }
      }
    }
  });
})();
