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
      url: document.location.href,
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
    // we don't block non-HTTP requests anyway, so we can bail out
    // without asking the background page. This is even necessary
    // because passing large data (like a photo encoded as data: URL)
    // to the background page, freezes Safari.
    if (!/^https?:/.test(event.url))
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
        url: event.url,
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
        var evt = document.createEvent("Event");
        evt.initEvent("error");
        event.target.dispatchEvent(evt);
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
      var objectId = this.objects.indexOf(obj);
      if (objectId != -1)
        return {type: "hosted", objectId: objectId};

      if (typeof obj == "function")
      {
        var callbackId = this.callbacks.indexOf(obj);
        if (callbackId == -1)
          callbackId = this.callbacks.push(obj) - 1;

        return {type: "callback", callbackId: callbackId, frameId: documentInfo.frameId};
      }

      if (typeof obj == "object" &&
          obj != null &&
          obj.constructor != Date &&
          obj.constructor != RegExp)
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
    getObjectId: function(obj)
    {
      return this.objects.indexOf(obj);
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
          return proxy.getProperty(proxy.getObjectId(this), property);
        },
        set: function(value)
        {
          proxy.checkResult(
            proxy.send(
            {
              type: "setProperty",
              objectId: proxy.getObjectId(this),
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
            contextId: proxy.getObjectId(this),
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
      }

      var ignored = [];
      if ("prototypeOf" in objectInfo)
      {
        var prototype = window[objectInfo.prototypeOf].prototype;

        ignored = Object.getOwnPropertyNames(prototype);
        ignored.splice(ignored.indexOf("constructor"), 1);

        obj.__proto__ = prototype;
      }
      else
      {
        if (objectInfo.isFunction)
          ignored = Object.getOwnPropertyNames(function() {});
        else
          ignored = [];

        if ("prototypeId" in objectInfo)
          obj.__proto__ = this.getObject(objectInfo.prototypeId);
        else
          obj.__proto__ = null;
      }

      for (var property in objectInfo.properties)
        if (ignored.indexOf(property) == -1)
          Object.defineProperty(obj, property, this.createProperty(
            property, objectInfo.properties[property].enumerable
          ));

      if (objectInfo.isFunction)
        obj.prototype = this.getProperty(objectId, "prototype");

      return obj;
    }
  };

  ext.backgroundPage = {
    sendMessage: function(message, responseCallback)
    {
      messageProxy.sendMessage(message, responseCallback, documentInfo);
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
