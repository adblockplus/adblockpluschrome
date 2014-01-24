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

  var TabEventTarget = function()
  {
    WrappedEventTarget.apply(this, arguments);
  };
  TabEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(event)
      {
        if (event.target instanceof SafariBrowserTab)
          listener(new Tab(event.target));
      };
    }
  };

  var LoadingTabEventTarget = function(target)
  {
    WrappedEventTarget.call(this, target, "message", false);
  };
  LoadingTabEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function (event)
      {
        if (event.name == "loading")
          listener(new Tab(event.target));
      };
    }
  };

  var BackgroundMessageEventTarget = function()
  {
    MessageEventTarget.call(this, safari.application);
  };
  BackgroundMessageEventTarget.prototype = {
    __proto__: MessageEventTarget.prototype,
    _getResponseDispatcher: function(event)
    {
      return event.target.page;
    },
    _getSenderDetails: function(event)
    {
      return {
        tab: new Tab(event.target),
        frame: new Frame(
          event.message.documentUrl,
          event.message.isTopLevel,
          event.target
        )
      };
    }
  };


  /* Tabs */

  Tab = function(tab)
  {
    this._tab = tab;

    this.browserAction = new BrowserAction(this);

    this.onLoading = new LoadingTabEventTarget(tab);
    this.onCompleted = new TabEventTarget(tab, "navigate", false);
    this.onActivated = new TabEventTarget(tab, "activate", false);
    this.onRemoved = new TabEventTarget(tab, "close", false);
  };
  Tab.prototype = {
    get url()
    {
      return this._tab.url;
    },
    close: function()
    {
      this._tab.close();
    },
    activate: function()
    {
      this._tab.activate();
    },
    sendMessage: function(message, responseCallback)
    {
      _sendMessage(
        message, responseCallback,
        this._tab.page, this._tab
      );
    }
  };

  TabMap = function(deleteOnPageUnload)
  {
    this._data = [];
    this._deleteOnPageUnload = deleteOnPageUnload;

    this.delete = this.delete.bind(this);
    this._delete = this._delete.bind(this);
  };
  TabMap.prototype =
  {
    _indexOf: function(tab)
    {
      for (var i = 0; i < this._data.length; i++)
        if (this._data[i].tab._tab == tab._tab)
          return i;

      return -1;
    },
    _delete: function(tab)
    {
      // delay so that other onClosed listeners can still look this tab up
      setTimeout(this.delete.bind(this, tab), 0);
    },
    get: function(tab) {
      var idx;

      if (!tab || (idx = this._indexOf(tab)) == -1)
        return null;

      return this._data[idx].value;
    },
    set: function(tab, value)
    {
      var idx = this._indexOf(tab);

      if (idx != -1)
        this._data[idx].value = value;
      else
      {
        this._data.push({value: value, tab: tab});

        tab.onRemoved.addListener(this._delete);
        if (this._deleteOnPageUnload)
          tab.onLoading.addListener(this.delete);
      }
    },
    has: function(tab)
    {
      return this._indexOf(tab) != -1;
    },
    clear: function()
    {
      while (this._data.length > 0)
        this.delete(this._data[0].tab);
    },
    delete: function(tab)
    {
      var idx = this._indexOf(tab);

      if (idx != -1)
      {
        tab = this._data[idx].tab;
        this._data.splice(idx, 1);

        tab.onRemoved.removeListener(this._delete);
        tab.onLoading.removeListener(this.delete);
      }
    }
  };

  ext.tabs = {
    onLoading: new LoadingTabEventTarget(safari.application),
    onCompleted: new TabEventTarget(safari.application, "navigate", true),
    onActivated: new TabEventTarget(safari.application, "activate", true),
    onRemoved: new TabEventTarget(safari.application, "close", true)
  };


  /* Browser actions */

  var toolbarItemProperties = {};

  var getToolbarItemProperty = function(name)
  {
    var property = toolbarItemProperties[name];
    if (!property)
    {
      property = {tabs: new TabMap()};
      toolbarItemProperties[name] = property;
    }
    return property;
  };

  var getToolbarItemForWindow = function(win)
  {
    for (var i = 0; i < safari.extension.toolbarItems.length; i++)
    {
      var toolbarItem = safari.extension.toolbarItems[i];

      if (toolbarItem.browserWindow == win)
        return toolbarItem;
    }

    return null;
  };

  var BrowserAction = function(tab)
  {
    this._tab = tab;
  };
  BrowserAction.prototype = {
    _set: function(name, value)
    {
      var currentWindow = this._tab._tab.browserWindow;
      var toolbarItem = getToolbarItemForWindow(currentWindow);

      if (toolbarItem)
      {
        var property = getToolbarItemProperty(name);
        property.tabs.set(this._tab, value);

        if (!("global" in property))
          property.global = toolbarItem[name];

        if (this._tab._tab == currentWindow.activeTab)
          toolbarItem[name] = value;
      }
    },
    setIcon: function(path)
    {
      this._set("image", safari.extension.baseURI + path);
    },
    setBadge: function(badge)
    {
      if (!badge)
        this._set("badge", 0);
      else if ("number" in badge)
        this._set("badge", badge.number);
    }
  };

  ext.tabs.onActivated.addListener(function(tab)
  {
    var toolbarItem = getToolbarItemForWindow(tab._tab.browserWindow);

    if (!toolbarItem)
      return;

    for (var name in toolbarItemProperties)
    {
      var property = toolbarItemProperties[name];

      if (property.tabs.has(tab))
        toolbarItem[name] = property.tabs.get(tab);
      else
        toolbarItem[name] = property.global;
    }
  });

  ext.tabs.onLoading.addListener(function(tab)
  {
    var currentWindow = tab._tab.browserWindow;

    var toolbarItem;
    if (tab._tab == currentWindow.activeTab)
      toolbarItem = getToolbarItemForWindow(currentWindow);
    else
      toolbarItem = null;

    for (var name in toolbarItemProperties)
    {
      var property = toolbarItemProperties[name];
      property.tabs.delete(tab);

      if (toolbarItem)
        toolbarItem[name] = property.global;
    }
  });


  /* Windows */

  Window = function(win)
  {
    this._win = win;
  }
  Window.prototype = {
    get visible()
    {
      return this._win.visible;
    },
    getAllTabs: function(callback)
    {
      callback(this._win.tabs.map(function(tab) { return new Tab(tab); }));
    },
    getActiveTab: function(callback)
    {
      callback(new Tab(this._win.activeTab));
    },
    openTab: function(url, callback)
    {
      var tab = this._win.openTab();
      tab.url = url;

      if (callback)
        callback(new Tab(tab));
    }
  };


  /* Frames */

  Frame = function(url, isTopLevel, tab)
  {
    this.url = url;

    // there is no way to discover frames with Safari's API.
    // so if this isn't the top level frame, assume that the parent is.
    // this is the best we can do for Safari. :(
    if (!isTopLevel)
      this.parent = new Frame(tab.url, true);
    else
      this.parent = null;
  };


  /* Background page proxy */

  var proxy = {
    tabs: [],
    objects: [],

    registerObject: function(obj, objects)
    {
      var objectId = objects.indexOf(obj);

      if (objectId == -1)
        objectId = objects.push(obj) - 1;

      return objectId;
    },
    serializeSequence: function(sequence, objects, memo)
    {
      if (!memo)
        memo = {specs: [], arrays: []};

      var items = [];
      for (var i = 0; i < sequence.length; i++)
        items.push(this.serialize(sequence[i], objects, memo));

      return items;
    },
    serialize: function(obj, objects, memo)
    {
      if (typeof obj == "object" && obj != null || typeof obj == "function")
      {
        if (obj.constructor == Array)
        {
          if (!memo)
            memo = {specs: [], arrays: []};

          var idx = memo.arrays.indexOf(obj);
          if (idx != -1)
            return memo.specs[idx];

          var spec = {type: "array"};
          memo.specs.push(spec);
          memo.arrays.push(obj);

          spec.items = this.serializeSequence(obj, objects, memo);
          return spec;
        }

        if (obj.constructor != Date && obj.constructor != RegExp)
          return {type: "object", objectId: this.registerObject(obj, objects)};
      }

      return {type: "value", value: obj};
    },
    createCallback: function(callbackId, tab)
    {
      var proxy = this;

      return function()
      {
        var idx = proxy.tabs.indexOf(tab);

        if (idx != -1) {
          var objects = proxy.objects[idx];

          tab.page.dispatchMessage("proxyCallback",
          {
            callbackId: callbackId,
            contextId: proxy.registerObject(this, objects),
            args: proxy.serializeSequence(arguments, objects)
          });
        }
      };
    },
    deserialize: function(spec, objects, tab, memo)
    {
      switch (spec.type)
      {
        case "value":
          return spec.value;
        case "hosted":
          return objects[spec.objectId];
        case "callback":
          return this.createCallback(spec.callbackId, tab);
        case "object":
        case "array":
          if (!memo)
            memo = {specs: [], objects: []};

          var idx = memo.specs.indexOf(spec);
          if (idx != -1)
            return memo.objects[idx];

          var obj;
          if (spec.type == "array")
            obj = [];
          else
            obj = {};

          memo.specs.push(spec);
          memo.objects.push(obj);

          if (spec.type == "array")
            for (var i = 0; i < spec.items.length; i++)
              obj.push(this.deserialize(spec.items[i], objects, tab, memo));
          else
            for (var k in spec.properties)
              obj[k] = this.deserialize(spec.properties[k], objects, tab, memo);

          return obj;
      }
    },
    createObjectCache: function(tab)
    {
      var objects = [window];

      this.tabs.push(tab);
      this.objects.push(objects);

      tab.addEventListener("close", function()
      {
        var idx = this.tabs.indexOf(tab);

        if (idx != -1)
        {
          this.tabs.splice(idx, 1);
          this.objects.splice(idx, 1);
        }
      }.bind(this));

      return objects;
    },
    getObjectCache: function(tab)
    {
      var idx = this.tabs.indexOf(tab);
      var objects;

      if (idx != -1)
        objects = this.objects[idx];
      else
        objects = this.objects[idx] = this.createObjectCache(tab);

      return objects;
    },
    fail: function(error)
    {
      if (error instanceof Error)
        error = error.message;
      return {succeed: false, error: error};
    },
    _handleMessage: function(message, tab)
    {
      var objects = this.getObjectCache(tab);

      switch (message.type)
      {
        case "getProperty":
          var obj = objects[message.objectId];

          try
          {
            var value = obj[message.property];
          }
          catch (e)
          {
            return this.fail(e);
          }

          return {succeed: true, result: this.serialize(value, objects)};
        case "setProperty":
          var obj = objects[message.objectId];
          var value = this.deserialize(message.value, objects, tab);

          try
          {
            obj[message.property] = value;
          }
          catch (e)
          {
            return this.fail(e);
          }

          return {succeed: true};
        case "callFunction":
          var func = objects[message.functionId];
          var context = objects[message.contextId];

          var args = [];
          for (var i = 0; i < message.args.length; i++)
            args.push(this.deserialize(message.args[i], objects, tab));

          try
          {
            var result = func.apply(context, args);
          }
          catch (e)
          {
            return this.fail(e);
          }

          return {succeed: true, result: this.serialize(result, objects)};
        case "inspectObject":
          var obj = objects[message.objectId];
          var objectInfo = {properties: {}, isFunction: typeof obj == "function"};

          Object.getOwnPropertyNames(obj).forEach(function(prop)
          {
            objectInfo.properties[prop] = {
              enumerable: Object.prototype.propertyIsEnumerable.call(obj, prop)
            };
          });

          if (obj.__proto__)
            objectInfo.prototypeId = this.registerObject(obj.__proto__, objects);

          if (obj == Object.prototype)
            objectInfo.prototypeOf = "Object";
          if (obj == Function.prototype)
            objectInfo.prototypeOf = "Function";

          return objectInfo;
      }
    }
  };


  /* Web request blocking */

  ext.webRequest = {
    onBeforeRequest: {
      _listeners: [],

      _handleMessage: function(message, rawTab)
      {
        var tab = new Tab(rawTab);
        var frame = new Frame(message.documentUrl, message.isTopLevel, rawTab);

        for (var i = 0; i < this._listeners.length; i++)
        {
          if (this._listeners[i](message.url, message.type, tab, frame) === false)
            return false;
        }

        return true;
      },
      addListener: function(listener)
      {
        this._listeners.push(listener);
      },
      removeListener: function(listener)
      {
        var idx = this._listeners.indexOf(listener);
        if (idx != -1)
          this._listeners.splice(idx, 1);
      }
    },
    handlerBehaviorChanged: function() {}
  };


  /* Synchronous messaging */

  safari.application.addEventListener("message", function(event)
  {
    if (event.name == "canLoad")
    {
      var handler;

      switch (event.message.type)
      {
        case "proxy":
          handler = proxy;
          break;
        case "webRequest":
          handler = ext.webRequest.onBeforeRequest;
          break;
      }

      event.message = handler._handleMessage(event.message.payload, event.target);
    }
  }, true);


  /* API */

  ext.windows = {
    getAll: function(callback)
    {
      callback(safari.application.browserWindows.map(function(win)
      {
        return new Window(win);
      }));
    },
    getLastFocused: function(callback)
    {
      callback(new Window(safari.application.activeBrowserWindow));
    }
  };

  ext.backgroundPage = {
    getWindow: function()
    {
      return safari.extension.globalPage.contentWindow;
    }
  };

  ext.onMessage = new BackgroundMessageEventTarget();

  var contextMenuItems = [];
  var isContextMenuHidden = true;
  ext.contextMenus = {
    addMenuItem: function(title, contexts, onclick)
    {
      contextMenuItems.push({
        id: String(contextMenuItems.length), 
        title: title,
        item: null,
        contexts: contexts,
        onclick: onclick
      });
      this.showMenuItems();
    },
    removeMenuItems: function()
    {
      contextMenuItems = [];
      this.hideMenuItems();
    },
    showMenuItems: function()
    {
      isContextMenuHidden = false;
    },
    hideMenuItems: function()
    {
      isContextMenuHidden = true;
    }
  };

  // Create context menu items
  safari.application.addEventListener("contextmenu", function(event)
  {
    if (isContextMenuHidden)
      return;

    var context = event.userInfo.tagName;
    if (context == "img")
      context = "image";
    if (!event.userInfo.srcUrl)
      context = null;

    for (var i = 0; i < contextMenuItems.length; i++)
    {
      // Supported contexts are: all, audio, image, video
      var menuItem = contextMenuItems[i];
      if (menuItem.contexts.indexOf("all") == -1 && menuItem.contexts.indexOf(context) == -1)
        continue;
      
      event.contextMenu.appendContextMenuItem(menuItem.id, menuItem.title);
    }
  }, false);

  // Handle context menu item clicks
  safari.application.addEventListener("command", function(event)
  {
    for (var i = 0; i < contextMenuItems.length; i++)
    {
      if (contextMenuItems[i].id == event.command)
      {
        contextMenuItems[i].onclick(event.userInfo.srcUrl, new Tab(safari.application.activeBrowserWindow.activeTab));
        break;
      }
    }
  }, false);
})();
