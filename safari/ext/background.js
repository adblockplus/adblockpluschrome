/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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
  /* Context menus */

  var contextMenuItems = new ext.PageMap();

  var ContextMenus = function(page)
  {
    this._page = page;
  };
  ContextMenus.prototype = {
    create: function(item)
    {
      var items = contextMenuItems.get(this._page);
      if (!items)
        contextMenuItems.set(this._page, items = []);

      items.push(item);
    },
    remove: function(item)
    {
      let items = contextMenuItems.get(this._page);
      if (items)
      {
        let index = items.indexOf(item);
        if (index != -1)
          items.splice(index, 1);
      }
    }
  };

  safari.application.addEventListener("contextmenu", function(event)
  {
    if (!event.userInfo)
      return;

    var pageId = event.userInfo.pageId;
    if (!pageId)
      return;

    var page = pages[event.userInfo.pageId];
    var items = contextMenuItems.get(page);
    if (!items)
      return;

    var context = event.userInfo.tagName;
    if (context == "img")
      context = "image";

    for (var i = 0; i < items.length; i++)
    {
      // Supported contexts are: all, audio, image, video
      var menuItem = items[i];
      if (menuItem.contexts.indexOf("all") == -1 && menuItem.contexts.indexOf(context) == -1)
        continue;

      event.contextMenu.appendContextMenuItem(i, menuItem.title);
    }
  });

  safari.application.addEventListener("command", function(event)
  {
    var page = pages[event.userInfo.pageId];
    var items = contextMenuItems.get(page);

    items[event.command].onclick(page);
  });


  /* Browser actions */

  var toolbarItemProperties = {};

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

  var updateToolbarItemForPage = function(page, win) {
    var toolbarItem = getToolbarItemForWindow(win);
    if (!toolbarItem)
      return;

    for (var name in toolbarItemProperties)
    {
      var property = toolbarItemProperties[name];

      if (page && property.pages.has(page))
        toolbarItem[name] = property.pages.get(page);
      else
        toolbarItem[name] = property.global;
    }
  };

  var BrowserAction = function(page)
  {
    this._page = page;
  };
  BrowserAction.prototype = {
    _set: function(name, value)
    {
      var toolbarItem = getToolbarItemForWindow(this._page._tab.browserWindow);
      if (!toolbarItem)
        return;

      var property = toolbarItemProperties[name];
      if (!property)
        property = toolbarItemProperties[name] = {
          pages: new ext.PageMap(),
          global: toolbarItem[name]
        };

      property.pages.set(this._page, value);

      if (isPageActive(this._page))
        toolbarItem[name] = value;
    },
    setIcon: function(path)
    {
      this._set("image", safari.extension.baseURI + path.replace("$size", "16"));
    },
    setBadge: function(badge)
    {
      if (!badge)
        this._set("badge", 0);
      else if ("number" in badge)
        this._set("badge", badge.number);
    }
  };

  safari.application.addEventListener("activate", function(event)
  {
    // this event is also dispatched on windows that got focused. But we
    // are only interested in tabs, which became active in their window.
    if (!(event.target instanceof SafariBrowserTab))
      return;

    let visiblePage = event.target._visiblePage;
    if (visiblePage)
      ext.pages.onActivated._dispatch(visiblePage);

    // update the toolbar item for the page visible in the tab that just
    // became active. If we can't find that page (e.g. when a page was
    // opened in a new tab, and our content script didn't run yet), the
    // toolbar item of the window, is reset to its intial configuration.
    updateToolbarItemForPage(visiblePage, event.target.browserWindow);
  }, true);


  /* Pages */

  var pages = Object.create(null);
  var pageCounter = 0;

  var Page = function(id, tab, url)
  {
    this.id = id;
    this._tab = tab;
    this._frames = [{url: new URL(url), parent: null}];

    if (tab.page)
      this._messageProxy = new ext._MessageProxy(tab.page);
    else
      // while the new tab page is shown on Safari 7, the 'page' property
      // of the tab is undefined, and we can't send messages to that page
      this._messageProxy = {
        handleRequest: function() {},
        handleResponse: function() {},
        sendMessage: function() {}
      };

    this.browserAction = new BrowserAction(this);
    this.contextMenus = new ContextMenus(this);
  };
  Page.prototype = {
    get url()
    {
      return this._frames[0].url;
    },
    sendMessage: function(message, responseCallback)
    {
      this._messageProxy.sendMessage(message, responseCallback, {pageId: this.id});
    }
  };

  ext.getPage = function(id)
  {
    return pages[id];
  };

  var isPageActive = function(page)
  {
    var tab = page._tab;
    var win = tab.browserWindow;
    return win && tab == win.activeTab && page == tab._visiblePage;
  };

  var forgetPage = function(id)
  {
    ext.pages.onRemoved._dispatch(id);

    ext._removeFromAllPageMaps(id);

    delete pages[id]._tab._pages[id];
    delete pages[id];
  };

  var replacePage = function(page)
  {
    var tab = page._tab;
    tab._visiblePage = page;

    for (var id in tab._pages)
    {
      if (id != page.id)
        forgetPage(id);
    }

    if (isPageActive(page))
      updateToolbarItemForPage(page, tab.browserWindow);
  };

  var addPage = function(tab, url, prerendered)
  {
    var pageId = ++pageCounter;

    if (!('_pages' in tab))
      tab._pages = Object.create(null);

    var page = new Page(pageId, tab, url);
    pages[pageId] = tab._pages[pageId] = page;

    // When a new page is shown, forget the previous page associated
    // with its tab, and reset the toolbar item if necessary.
    // Note that it wouldn't be sufficient to do that when the old
    // page is unloading, because Safari dispatches window.onunload
    // only when reloading the page or following links, but not when
    // you enter a new URL in the address bar.
    if (!prerendered)
      replacePage(page);

    return pageId;
  };

  ext.pages = {
    open: function(url, callback)
    {
      var tab = safari.application.activeBrowserWindow.openTab();
      tab.url = url;

      if (callback)
      {
        var onNavigate = function(event)
        {
          if (event.target == tab)
          {
            safari.application.removeEventListener(onNavigate);
            callback(tab._visiblePage);
          }
        };

        safari.application.addEventListener("navigate", onNavigate);
      }
    },
    query: function(info, callback)
    {
      var matchedPages = [];

      for (var id in pages)
      {
        var page = pages[id];
        var win = page._tab.browserWindow;

        if ("active" in info && info.active != isPageActive(page))
          continue;
        if ("lastFocusedWindow" in info && info.lastFocusedWindow != (win == safari.application.activeBrowserWindow))
          continue;

        matchedPages.push(page);
      };

      callback(matchedPages);
    },
    onLoading: new ext._EventTarget(),
    onActivated: new ext._EventTarget(),
    onRemoved: new ext._EventTarget()
  };

  safari.application.addEventListener("close", function(event)
  {
    // this event is dispatched on closing windows and tabs. However when a
    // window is closed, it is first dispatched on each tab in the window and
    // then on the window itself. But we are only interested in closed tabs.
    if (!(event.target instanceof SafariBrowserTab))
      return;

    // when a tab is closed, forget the previous page associated with that
    // tab. Note that it wouldn't be sufficient do that when the old page
    // is unloading, because Safari dispatches window.onunload only when
    // reloading the page or following links, but not when closing the tab.
    for (var id in event.target._pages)
      forgetPage(id);
  }, true);

  // We generally rely on content scripts to report new pages,
  // since Safari's extension API doesn't consider pre-rendered
  // pages. However, when the extension initializes we have to
  // use  Safari's extension API to detect existing tabs.
  safari.application.browserWindows.forEach(function(win)
  {
    for (var i = 0; i < win.tabs.length; i++)
    {
      var tab = win.tabs[i];
      var url = tab.url;

      // For the new tab page the url property is undefined.
      if (url)
        addPage(tab, url, false);
    }
  });


  /* Web requests */

  ext.webRequest = {
    onBeforeRequest: new ext._EventTarget(),
    handlerBehaviorChanged: function()
    {
    },
    getIndistinguishableTypes: function()
    {
      return [];
    }
  };


  /* Background page proxy (for access from content scripts) */

  var backgroundPageProxy = {
    cache: new ext.PageMap(),

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
    createCallback: function(callbackId, pageId, frameId)
    {
      var proxy = this;

      return function()
      {
        var page = pages[pageId];
        if (!page)
          return;

        var objects = proxy.cache.get(page);
        if (!objects)
          return;

        page._tab.page.dispatchMessage("proxyCallback",
        {
          pageId: pageId,
          frameId: frameId,
          callbackId: callbackId,
          contextId: proxy.registerObject(this, objects),
          args: proxy.serializeSequence(arguments, objects)
        });
      };
    },
    deserialize: function(spec, objects, pageId, memo)
    {
      switch (spec.type)
      {
        case "value":
          return spec.value;
        case "hosted":
          return objects[spec.objectId];
        case "callback":
          return this.createCallback(spec.callbackId, pageId, spec.frameId);
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
              obj.push(this.deserialize(spec.items[i], objects, pageId, memo));
          else
            for (var k in spec.properties)
              obj[k] = this.deserialize(spec.properties[k], objects, pageId, memo);

          return obj;
      }
    },
    getObjectCache: function(page)
    {
      var objects = this.cache.get(page);
      if (!objects)
      {
        objects = [window];
        this.cache.set(page, objects);
      }
      return objects;
    },
    fail: function(error)
    {
      if (error instanceof Error)
        error = error.message;
      return {succeed: false, error: error};
    },
    handleMessage: function(message)
    {
      var objects = this.getObjectCache(pages[message.pageId]);

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
          var value = this.deserialize(message.value, objects, message.pageId);

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
            args.push(this.deserialize(message.args[i], objects, message.pageId));

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

          var proto = Object.getPrototypeOf(obj);
          if (proto)
            objectInfo.prototypeId = this.registerObject(proto, objects);

          if (obj == Object.prototype)
            objectInfo.prototypeOf = "Object";
          if (obj == Function.prototype)
            objectInfo.prototypeOf = "Function";

          return objectInfo;
      }
    }
  };


  /* Message processing */

  safari.application.addEventListener("message", function(event)
  {
    switch (event.name)
    {
      case "canLoad":
        switch (event.message.category)
        {
          case "loading":
            var tab = event.target;
            var message = event.message;

            var pageId;
            var frameId;

            if (message.isTopLevel)
            {
              pageId = addPage(tab, message.url, message.isPrerendered);
              frameId = 0;

              ext.pages.onLoading._dispatch(pages[pageId]);
            }
            else
            {
              var page;
              var parentFrame;

              var lastPageId;
              var lastPage;
              var lastPageTopLevelFrame;

              // find the parent frame and its page for this sub frame,
              // by matching its referrer with the URL of frames previously
              // loaded in the same tab. If there is more than one match,
              // the most recent loaded page and frame is preferred.
              for (var curPageId in tab._pages)
              {
                var curPage = pages[curPageId];

                for (var i = 0; i < curPage._frames.length; i++)
                {
                  var curFrame = curPage._frames[i];

                  if (curFrame.url.href == message.referrer)
                  {
                    pageId = curPageId;
                    page = curPage;
                    parentFrame = curFrame;
                  }

                  if (i == 0)
                  {
                    lastPageId = curPageId;
                    lastPage = curPage;
                    lastPageTopLevelFrame = curFrame;
                  }
                }
              }

              // if we can't find the parent frame and its page, fall back to
              // the page most recently loaded in the tab and its top level frame
              if (!page)
              {
                pageId = lastPageId;
                page = lastPage;
                parentFrame = lastPageTopLevelFrame;
              }

              frameId = page._frames.length;
              page._frames.push({url: new URL(message.url), parent: parentFrame});
            }
            event.message = {pageId: pageId, frameId: frameId};
            break;
          case "webRequest":
            var page = pages[event.message.pageId];
            var frame = page._frames[event.message.frameId];

            var results = ext.webRequest.onBeforeRequest._dispatch(
              new URL(event.message.url, frame.url),
              event.message.type, page, frame
            );

            event.message = (results.indexOf(false) == -1);
            break;
          case "proxy":
            event.message = backgroundPageProxy.handleMessage(event.message);
            break;
          case "request":
            var page = pages[event.message.pageId];
            var sender = {page: page, frame: page._frames[event.message.frameId]};

            var response = null;
            var sendResponse = function(message) { response = message; };

            ext.onMessage._dispatch(event.message.payload, sender, sendResponse);

            event.message = response;
            break;
        }
        break;
      case "request":
        var page = pages[event.message.pageId];
        var sender = {page: page, frame: page._frames[event.message.frameId]};
        page._messageProxy.handleRequest(event.message, sender);
        break;
      case "response":
        pages[event.message.pageId]._messageProxy.handleResponse(event.message);
        break;
      case "replaced":
        // when a prerendered page is shown, forget the previous page
        // associated with its tab, and reset the toolbar item if necessary.
        // Note that it wouldn't be sufficient to do that when the old
        // page is unloading, because Safari dispatches window.onunload
        // only when reloading the page or following links, but not when
        // the current page is replaced with a prerendered page.
        replacePage(pages[event.message.pageId]);
        break;
    }
  });


  /* Storage */

  ext.storage = {
    get: function(keys, callback)
    {
      var items = {};
      var settings = safari.extension.settings;

      for (var i = 0; i < keys.length; i++)
      {
        var key = keys[i];
        if (key in settings)
          items[key] = settings[key];
      }

      setTimeout(callback, 0, items);
    },
    set: function(key, value, callback)
    {
      safari.extension.settings[key] = value;

      if (callback)
        setTimeout(callback, 0);
    },
    remove: function(key, callback)
    {
      delete safari.extension.settings[key];

      if (callback)
        setTimeout(callback, 0);
    },
    onChanged: new ext._EventTarget()
  };

  safari.extension.settings.addEventListener("change", function(event)
  {
    var changes = {};
    var change = changes[event.key] = {};

    if (event.oldValue != null)
      change.oldValue = event.oldValue;
    if (event.newValue != null)
      change.newValue = event.newValue;

    ext.storage.onChanged._dispatch(changes);
  });


  /* Options */

  ext.showOptions = function(callback)
  {
    var optionsUrl = safari.extension.baseURI + "options.html";

    for (var id in pages)
    {
      var page = pages[id];
      var tab = page._tab;

      if (page.url.href == optionsUrl && tab.browserWindow == safari.application.activeBrowserWindow)
      {
        tab.activate();
        if (callback)
          callback(page);
        return;
      }
    }

    ext.pages.open(optionsUrl, callback);
  };

  /* Windows */
  ext.windows = {
    // Safari doesn't provide as rich a windows API as Chrome does, so instead
    // of chrome.windows.create we have to fall back to just opening a new tab.
    create: function(createData, callback)
    {
      ext.pages.open(createData.url, callback);
    }
  };
})();
