/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
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
  var lastContextMenuTab;

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
    lastContextMenuTab = event.target;

    if (!event.userInfo)
      return;

    var documentId = event.userInfo.documentId;
    if (!documentId)
      return;

    var page = pages[event.target._documentLookup[documentId].pageId];
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
    var documentId = event.userInfo.documentId;
    var page = pages[lastContextMenuTab._documentLookup[documentId].pageId];
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
      var documentIds = [];
      for (var documentId in this._tab._documentLookup)
        if (this._tab._documentLookup[documentId].pageId == this.id)
          documentIds.push(documentId);

      this._messageProxy.sendMessage(message, responseCallback,
                                     {targetDocuments: documentIds});
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

    var tab = pages[id]._tab;

    for (var documentId in tab._documentLookup)
    {
      if (tab._documentLookup[documentId].pageId == id)
        delete tab._documentLookup[documentId];
    }

    delete tab._pages[id];
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

    if (!('_documentLookup' in tab))
      tab._documentLookup = Object.create(null);

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
      {
        var pageId = addPage(tab, url, false);
        tab.page.dispatchMessage("requestDocumentId", {pageId: pageId});
      }
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

  /* Message processing */

  var dispatchedLegacyAPISupportMessage = false;
  safari.application.addEventListener("message", function(event)
  {
    var tab = event.target;
    var message = event.message;
    var sender;
    if ("documentId" in message && "_documentLookup" in tab)
    {
      sender = tab._documentLookup[message.documentId];
      if (sender)
      {
        sender.page = pages[sender.pageId];
        sender.frame = sender.page._frames[sender.frameId];
      }
    }

    switch (event.name)
    {
      case "canLoad":
        switch (message.category)
        {
          case "webRequest":
            var results = ext.webRequest.onBeforeRequest._dispatch(
              new URL(message.url, sender.frame.url),
              message.type, sender.page, sender.frame
            );

            event.message = (results.indexOf(false) == -1);
            break;
          case "request":
            var response = null;
            var sendResponse = function(message) { response = message; };

            ext.onMessage._dispatch(message.payload, sender, sendResponse);

            event.message = response;
            break;
        }
        break;
      case "request":
        sender.page._messageProxy.handleRequest(message, sender);
        break;
      case "response":
        // All documents within a page have the same pageId and that's all we
        // care about here.
        var pageId = tab._documentLookup[message.targetDocuments[0]].pageId;
        pages[pageId]._messageProxy.handleResponse(message);
        break;
      case "replaced":
        // when a prerendered page is shown, forget the previous page
        // associated with its tab, and reset the toolbar item if necessary.
        // Note that it wouldn't be sufficient to do that when the old
        // page is unloading, because Safari dispatches window.onunload
        // only when reloading the page or following links, but not when
        // the current page is replaced with a prerendered page.
        replacePage(sender.page);
        break;
      case "loading":
        var pageId;
        var frameId;
        var documentId = message.documentId;

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

        tab._documentLookup[documentId] = {pageId: pageId, frameId: frameId};

        if (!dispatchedLegacyAPISupportMessage)
        {
          ext.onMessage._dispatch({
            type: "safari.legacyAPISupported",
            legacyAPISupported: message.legacyAPISupported
          });
          dispatchedLegacyAPISupportMessage = true;
        }
        break;
      case "documentId":
        tab._documentLookup[message.documentId] = {
          pageId: message.pageId, frameId: 0
        };
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
