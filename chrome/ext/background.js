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
  /* Events */

  var TabEventTarget = function()
  {
    WrappedEventTarget.apply(this, arguments);

    this._tabs = {};

    this._sharedListener = this._sharedListener.bind(this);
    this._removeTab = this._removeTab.bind(this);
  };
  TabEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _bindToTab: function(tab)
    {
      return {
        addListener: function(listener)
        {
          var listeners = this._tabs[tab._id];

          if (!listeners)
          {
            this._tabs[tab._id] = listeners = [];

            if (Object.keys(this._tabs).length == 1)
              this.addListener(this._sharedListener);

            tab.onRemoved.addListener(this._removeTab);
          }

          listeners.push(listener);
        }.bind(this),
        removeListener: function(listener)
        {
          var listeners = this._tabs[tab._id];
          if (!listeners)
            return;

          var idx = listeners.indexOf(listener);
          if (idx == -1)
            return;

          listeners.splice(idx, 1);

          if (listeners.length == 0)
            tab.onRemoved.removeListener(this._removeTab);
          else
          {
            if (listeners.length > 1)
              return;
            if (listeners[0] != this._removeTab)
              return;
          }

          this._removeTab(tab);
        }.bind(this)
      };
    },
    _sharedListener: function(tab)
    {
      var listeners = this._tabs[tab._id];

      if (!listeners)
        return;

      // copy listeners before calling them, because they might
      // add or remove other listeners, which must not be taken
      // into account before the next occurrence of the event
      listeners = listeners.slice(0);

      for (var i = 0; i < listeners.length; i++)
        listeners[i](tab);
    },
    _removeTab: function(tab)
    {
      delete this._tabs[tab._id];

      if (Object.keys(this._tabs).length == 0)
        this.removeListener(this._sharedListener);
    }
  };

  var BeforeNavigateTabEventTarget = function()
  {
    TabEventTarget.call(this, chrome.webNavigation.onBeforeNavigate);
  };
  BeforeNavigateTabEventTarget.prototype = {
    __proto__: TabEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(details)
      {
        if (details.frameId == 0)
          listener(new Tab({id: details.tabId, url: details.url}));
      };
    }
  };

  var LoadingTabEventTarget = function()
  {
    TabEventTarget.call(this, chrome.tabs.onUpdated);
  };
  LoadingTabEventTarget.prototype = {
    __proto__: TabEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(id, info, tab)
      {
        if (info.status == "loading")
          listener(new Tab(tab));
      };
    }
  };

  var CompletedTabEventTarget = function()
  {
    TabEventTarget.call(this, chrome.tabs.onUpdated);
  };
  CompletedTabEventTarget.prototype = {
    __proto__: TabEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(id, info, tab)
      {
        if (info.status == "complete")
          listener(new Tab(tab));
      };
    }
  };

  var ActivatedTabEventTarget = function()
  {
    TabEventTarget.call(this, chrome.tabs.onActivated);
  };
  ActivatedTabEventTarget.prototype = {
    __proto__: TabEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(info)
      {
        chrome.tabs.get(info.tabId, function(tab)
        {
          listener(new Tab(tab));
        });
      };
    }
  }

  var RemovedTabEventTarget = function()
  {
    TabEventTarget.call(this, chrome.tabs.onRemoved);
  };
  RemovedTabEventTarget.prototype = {
    __proto__: TabEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(id) { listener(new Tab({id: id})); };
    }
  };

  var BackgroundMessageEventTarget = function()
  {
    MessageEventTarget.call(this);
  }
  BackgroundMessageEventTarget.prototype = {
    __proto__: MessageEventTarget.prototype,
    _wrapSender: function(sender)
    {
      var tab = new Tab(sender.tab);
      
      //url parameter is missing in sender object (Chrome v28 and below)
      if (!("url" in sender))
        sender.url = tab.url;
      return {tab: tab, frame: new Frame({url: sender.url, tab: tab})};
    }
  };


  /* Tabs */

  var sendMessage = chrome.tabs.sendMessage || chrome.tabs.sendRequest;

  var BrowserAction = function(tabId)
  {
    this._tabId = tabId;
  };
  BrowserAction.prototype = {
    setIcon: function(path)
    {
      chrome.browserAction.setIcon({tabId: this._tabId, path: path});
    },
    setBadge: function(badge)
    {
      if (!badge)
      {
        chrome.browserAction.setBadgeText({
          tabId: this._tabId,
          text: ""
        });
        return;
      }

      if ("color" in badge)
      {
        chrome.browserAction.setBadgeBackgroundColor({
          tabId: this._tabId,
          color: badge.color
        });
      }

      if ("number" in badge)
      {
        chrome.browserAction.setBadgeText({
          tabId: this._tabId,
          text: badge.number.toString()
        });
      }
    }
  };

  Tab = function(tab)
  {
    this._id = tab.id;
    this._url = tab.url;

    this.browserAction = new BrowserAction(tab.id);

    this.onLoading = ext.tabs.onLoading._bindToTab(this);
    this.onCompleted = ext.tabs.onCompleted._bindToTab(this);
    this.onActivated = ext.tabs.onActivated._bindToTab(this);
    this.onRemoved = ext.tabs.onRemoved._bindToTab(this);

    // the "beforeNavigate" event in Safari isn't dispatched when a new URL
    // was entered into the address bar. So we can only use it only on Chrome,
    // but we have to hide it from the browser-independent high level code.
    this._onBeforeNavigate = ext.tabs._onBeforeNavigate._bindToTab(this);
  };
  Tab.prototype = {
    get url()
    {
      // usually our Tab objects are created from chrome Tab objects, which
      // provide the url. So we can return the url given in the constructor.
      if (this._url != null)
        return this._url;

      // but sometimes we only have the id when we create a Tab object.
      // In that case we get the url from top frame of the tab, recorded by
      // the onBeforeRequest handler.
      var frames = framesOfTabs.get(this);
      if (frames)
      {
        var frame = frames[0];
        if (frame)
          return frame.url;
      }
    },
    close: function()
    {
      chrome.tabs.remove(this._id);
    },
    activate: function()
    {
      chrome.tabs.update(this._id, {selected: true});
    },
    sendMessage: function(message, responseCallback)
    {
      sendMessage(this._id, message, responseCallback);
    }
  };

  TabMap = function(deleteOnPageUnload)
  {
    this._map = {};

    this._delete = this._delete.bind(this);
    this._deleteOnPageUnload = deleteOnPageUnload;
  };
  TabMap.prototype = {
    get: function(tab)
    {
      return (this._map[tab._id] || {}).value;
    },
    set: function(tab, value)
    {
      if (!(tab._id in this._map))
      {
        tab.onRemoved.addListener(this._delete);
        if (this._deleteOnPageUnload)
          tab._onBeforeNavigate.addListener(this._delete);
      }

      this._map[tab._id] = {tab: tab, value: value};
    },
    has: function(tab)
    {
      return tab._id in this._map;
    },
    clear: function()
    {
      for (var id in this._map)
        this.delete(this._map[id].tab);
    },
    _delete: function(tab)
    {
      // delay so that other event handlers can still lookup this tab
      setTimeout(this.delete.bind(this, tab), 0);
    },
    delete: function(tab)
    {
      delete this._map[tab._id];

      tab.onRemoved.removeListener(this._delete);
      tab._onBeforeNavigate.removeListener(this._delete);
    }
  };


  /* Windows */

  Window = function(win)
  {
    this._id = win.id;
    this.visible = win.status != "minimized";
  };
  Window.prototype = {
    getAllTabs: function(callback)
    {
      chrome.tabs.query({windowId: this._id}, function(tabs)
      {
        callback(tabs.map(function(tab) { return new Tab(tab); }));
      });
    },
    getActiveTab: function(callback)
    {
      chrome.tabs.query({windowId: this._id, active: true}, function(tabs)
      {
        callback(new Tab(tabs[0]));
      });
    },
    openTab: function(url, callback)
    {
      var props = {windowId: this._id, url: url};

      if (!callback)
        chrome.tabs.create(props);
      else
        chrome.tabs.create(props, function(tab)
        {
          callback(new Tab(tab));
        });
    }
  };


  /* Frames */

  var framesOfTabs = new TabMap();

  Frame = function(params)
  {
    this._tab = params.tab;
    this._id = params.id;
    this._url = params.url;
  };
  Frame.prototype = {
    get url()
    {
      if (this._url != null)
        return this._url;

      var frames = framesOfTabs.get(this._tab);
      if (frames)
      {
        var frame = frames[this._id];
        if (frame)
          return frame.url;
      }
    },
    get parent()
    {
      var frames = framesOfTabs.get(this._tab);
      if (frames)
      {
        var frame;
        if (this._id != null)
          frame = frames[this._id];
        else
        {
          // the frame ID wasn't available when we created
          // the Frame object (e.g. for the onMessage event),
          // so we have to find the frame details by their URL.
          for (var frameId in frames)
          {
            if (frames[frameId].url == this._url)
            {
              frame = frames[frameId];
              break;
            }
          }
        }

        if (!frame || frame.parent == -1)
          return null;

        return new Frame({id: frame.parent, tab: this._tab});
      }
    }
  };


  /* Web request blocking */

  chrome.webRequest.onBeforeRequest.addListener(function(details)
  {
    try
    {
      // the high-level code isn't interested in requests that aren't related
      // to a tab and since those can only be handled in Chrome, we ignore
      // them here instead of in the browser independent high-level code.
      if (details.tabId == -1)
        return;

      var tab = new Tab({id: details.tabId});
      var frames = framesOfTabs.get(tab);

      if (!frames)
      {
        frames = [];
        framesOfTabs.set(tab, frames);

        // assume that the first request belongs to the top frame. Chrome
        // may give the top frame the type "object" instead of "main_frame".
        // https://code.google.com/p/chromium/issues/detail?id=281711
        if (frameId == 0)
          details.type = "main_frame";
      }

      var frameId;
      if (details.type == "main_frame" || details.type == "sub_frame")
      {
        frameId = details.parentFrameId;
        frames[details.frameId] = {url: details.url, parent: frameId};

        // the high-level code isn't interested in top frame requests and
        // since those can only be handled in Chrome, we ignore them here
        // instead of in the browser independent high-level code.
        if (details.type == "main_frame")
          return;
      }
      else
        frameId = details.frameId;

      if (!(frameId in frames))
      {
        // the high-level code relies on the frame. So ignore the request if we
        // don't even know the top-level frame. That can happen for example when
        // the extension was just (re)loaded.
        if (!(0 in frames))
          return;

        // however when the src of the frame is a javascript: or data: URL, we
        // don't know the frame either. But since we know the top-level frame we
        // can just pretend that we are in the top-level frame, in order to have
        // at least most domain-based filter rules working.
        frameId = 0;
        if (details.type == "sub_frame")
          frames[details.frameId].parent = frameId;
      }

      var frame = new Frame({id: frameId, tab: tab});

      for (var i = 0; i < ext.webRequest.onBeforeRequest._listeners.length; i++)
      {
        if (ext.webRequest.onBeforeRequest._listeners[i](details.url, details.type, tab, frame) === false)
          return {cancel: true};
      }
    }
    catch (e)
    {
      // recent versions of Chrome cancel the request when an error occurs in
      // the onBeforeRequest listener. However in our case it is preferred, to
      // let potentially some ads through, rather than blocking legit requests.
      console.error(e);
    }
  }, {urls: ["<all_urls>"]}, ["blocking"]);


  /* API */

  ext.windows = {
    getAll: function(callback)
    {
      chrome.windows.getAll(function(windows)
      {
        callback(windows.map(function(win)
        {
          return new Window(win);
        }));
      });
    },
    getLastFocused: function(callback)
    {
      chrome.windows.getLastFocused(function(win)
      {
        callback(new Window(win));
      });
    }
  };

  ext.tabs = {
    onLoading: new LoadingTabEventTarget(),
    onCompleted: new CompletedTabEventTarget(),
    onActivated: new ActivatedTabEventTarget(),
    onRemoved: new RemovedTabEventTarget(),

    // the "beforeNavigate" event in Safari isn't dispatched when a new URL
    // was entered into the address bar. So we can only use it only on Chrome,
    // but we have to hide it from the browser-independent high level code.
    _onBeforeNavigate: new BeforeNavigateTabEventTarget()
  };

  ext.webRequest = {
    onBeforeRequest: new SimpleEventTarget(),
    handlerBehaviorChanged: chrome.webRequest.handlerBehaviorChanged
  };

  ext.storage = localStorage;

  var contextMenuItems = [];
  var isContextMenuHidden = true;
  ext.contextMenus = {
    addMenuItem: function(title, contexts, onclick)
    {
      contextMenuItems.push({
        title: title,
        contexts: contexts,
        onclick: function(info, tab)
        {
          onclick(info.srcUrl, new Tab(tab));
        }
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
      if (!isContextMenuHidden)
        return;

      chrome.contextMenus.removeAll(function()
      {
        for (var i = 0; i < contextMenuItems.length; i++)
        {
          var item = contextMenuItems[i];
          chrome.contextMenus.create({
            title: item.title,
            contexts: item.contexts,
            onclick: item.onclick
          });
        }
      });
      isContextMenuHidden = false;
    },
    hideMenuItems: function()
    {
      if (isContextMenuHidden)
        return;

      chrome.contextMenus.removeAll();
      isContextMenuHidden = true;
    }
  };

  ext.onMessage = new BackgroundMessageEventTarget();
})();
