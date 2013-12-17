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

  var BeforeRequestEventTarget = function()
  {
    WrappedEventTarget.call(this, chrome.webRequest.onBeforeRequest);
  };
  BeforeRequestEventTarget.prototype = {
    __proto__: WrappedEventTarget.prototype,
    _wrapListener: function(listener)
    {
      return function(details)
      {
        var tab = null;

        if (details.tabId != -1)
          tab = new Tab({id: details.tabId});

        return {cancel: listener(
          details.url,
          details.type,
          tab,
          details.frameId,
          details.parentFrameId
        ) === false};
      };
    },
    _prepareExtraArguments: function(urls)
    {
      return [urls ? {urls: urls} : {}, ["blocking"]];
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
    setTitle: function(title)
    {
      chrome.browserAction.setTitle({tabId: this._tabId, title: title});
    },
    hide: function()
    {
      chrome.browserAction.hide(this._tabId);
    },
    show: function()
    {
      chrome.browserAction.show(this._tabId);
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

    this.url = tab.url;
    this.browserAction = new BrowserAction(tab.id);

    this.onLoading = ext.tabs.onLoading._bindToTab(this);
    this.onCompleted = ext.tabs.onCompleted._bindToTab(this);
    this.onActivated = ext.tabs.onActivated._bindToTab(this);
    this.onRemoved = ext.tabs.onRemoved._bindToTab(this);
  };
  Tab.prototype = {
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

  TabMap = function()
  {
    this._map = {};
    this.delete = this.delete.bind(this);
  };
  TabMap.prototype = {
    get: function(tab)
    {
      return (this._map[tab._id] || {}).value;
    },
    set: function(tab, value)
    {
      if (!(tab._id in this._map))
        tab.onRemoved.addListener(this.delete);

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
    }
  };
  TabMap.prototype["delete"] = function(tab)
  {
    delete this._map[tab._id];
    tab.onRemoved.removeListener(this.delete);
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
    onRemoved: new RemovedTabEventTarget()
  };

  ext.webRequest = {
    onBeforeRequest: new BeforeRequestEventTarget(),
    handlerBehaviorChanged: chrome.webRequest.handlerBehaviorChanged
  };
})();
