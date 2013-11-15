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
  safari.self.tab.dispatchMessage("loading", document.location.href);


  /* Background page proxy */
  var proxy = {
    objects: [],
    callbacks: [],

    send: function(message)
    {
      var evt = document.createEvent("Event");
      evt.initEvent("beforeload");
      return safari.self.tab.canLoad(evt, {type: "proxy", payload: message});
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
        {
          callbackId = this.callbacks.push(obj) - 1;

          safari.self.addEventListener("message", function(event)
          {
            if (event.name == "proxyCallback")
            if (event.message.callbackId == callbackId)
              obj.apply(
                this.getObject(event.message.contextId),
                this.deserializeSequence(event.message.args)
              );
          }.bind(this));
        }

        return {type: "callback", callbackId: callbackId};
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
    createProperty: function(objectId, property, enumerable)
    {
      return {
        get: function()
        {
          return this.getProperty(objectId, property);
        }.bind(this),
        set: function(value)
        {
          this.checkResult(
            this.send(
            {
              type: "setProperty",
              objectId: objectId,
              property: property,
              value: this.serialize(value)
            })
          );
        }.bind(this),
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
            contextId: proxy.objects.indexOf(this),
            args: Array.prototype.map.call(
              arguments,
              proxy.serialize.bind(proxy)
            )
          })
        );
      };
    },
    getObject: function(objectId) {
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
            objectId, property,
            objectInfo.properties[property].enumerable
          ));

      if (objectInfo.isFunction)
        obj.prototype = this.getProperty(objectId, "prototype");

      return obj;
    }
  };


  /* Web request blocking */

  document.addEventListener("beforeload", function(event)
  {
    var type;

    switch(event.target.nodeName)
    {
      case "FRAME":
      case "IFRAME":
        type = "frame";
        break;
      case "IMG":
        type = "image";
        break;
      case "OBJECT":
      case "EMBED":
        type = "object";
        break;
      case "SCRIPT":
        type = "script";
        break;
      case "LINK":
        if (/(^|\s)stylesheet($|\s)/i.test(event.target.rel))
        {
          type = "stylesheet";
          break;
        }
      default:
        type = "other";
    }

    if (!safari.self.tab.canLoad(event, {type: "webRequest", payload: {url: event.url, type: type}}))
      event.preventDefault();
  }, true);


  /* API */

  ext.backgroundPage = {
    _eventTarget: safari.self,
    _messageDispatcher: safari.self.tab,

    sendMessage: sendMessage,
    getWindow: function() { return proxy.getObject(0); }
  };

  ext.onMessage = new MessageEventTarget(safari.self);
})();
