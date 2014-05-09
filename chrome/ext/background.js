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
  /* Pages */

  var Page = ext.Page = function(tab)
  {
    this._id = tab.id;
    this._url = tab.url;

    this.browserAction = new BrowserAction(tab.id);
    this.contextMenus = new ContextMenus(this);
  };
  Page.prototype = {
    get url()
    {
      // usually our Page objects are created from Chrome's Tab objects, which
      // provide the url. So we can return the url given in the constructor.
      if (this._url != null)
        return this._url;

      // but sometimes we only have the tab id when we create a Page object.
      // In that case we get the url from top frame of the tab, recorded by
      // the onBeforeRequest handler.
      var frames = framesOfTabs[this._id];
      if (frames)
      {
        var frame = frames[0];
        if (frame)
          return frame.url;
      }
    },
    activate: function()
    {
      chrome.tabs.update(this._id, {selected: true});
    },
    sendMessage: function(message, responseCallback)
    {
      chrome.tabs.sendMessage(this._id, message, responseCallback);
    }
  };

  ext.pages = {
    open: function(url, callback)
    {
      if (callback)
      {
        chrome.tabs.create({url: url}, function(openedTab)
        {
          var onUpdated = function(tabId, changeInfo, tab)
          {
            if (tabId == openedTab.id && changeInfo.status == "complete")
            {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              callback(new Page(tab));
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      }
      else
        chrome.tabs.create({url: url});
    },
    query: function(info, callback)
    {
      var rawInfo = {};
      for (var property in info)
      {
        switch (property)
        {
          case "active":
          case "lastFocusedWindow":
            rawInfo[property] = info[property];
        }
      }

      chrome.tabs.query(rawInfo, function(tabs)
      {
        callback(tabs.map(function(tab)
        {
          return new Page(tab);
        }));
      });
    },
    onLoading: new ext._EventTarget()
  };

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab)
  {
    if (changeInfo.status == "loading")
      ext.pages.onLoading._dispatch(new Page(tab));
  });

  chrome.webNavigation.onBeforeNavigate.addListener(function(details)
  {
    if (details.frameId == 0)
      ext._removeFromAllPageMaps(details.tabId);
  });

  chrome.tabs.onRemoved.addListener(function(tabId)
  {
    ext._removeFromAllPageMaps(tabId);
    delete framesOfTabs[tabId];
  });


  /* Browser actions */

  var BrowserAction = function(tabId)
  {
    this._tabId = tabId;
  };
  BrowserAction.prototype = {
    setIcon: function(path)
    {
      var paths = {};
      for (var i = 1; i <= 2; i++)
      {
        var size = i * 19;
        paths[size] = path.replace("$size", size);
      }

      chrome.browserAction.setIcon({tabId: this._tabId, path: paths});
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


  /* Context menus */

  var contextMenuItems = new ext.PageMap();
  var contextMenuUpdating = false;

  var updateContextMenu = function()
  {
    if (contextMenuUpdating)
      return;

    contextMenuUpdating = true;

    chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs)
    {
      chrome.contextMenus.removeAll(function()
      {
        contextMenuUpdating = false;

        if (tabs.length == 0)
          return;

        var items = contextMenuItems.get({_id: tabs[0].id});

        if (!items)
          return;

        items.forEach(function(item)
        {
          chrome.contextMenus.create({
            title: item.title,
            contexts: item.contexts,
            onclick: function(info, tab)
            {
              item.onclick(info.srcUrl, new Page(tab));
            }
          });
        });
      });
    });
  };

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
      updateContextMenu();
    },
    removeAll: function()
    {
      contextMenuItems.delete(this._page);
      updateContextMenu();
    }
  };

  chrome.tabs.onActivated.addListener(updateContextMenu);

  chrome.windows.onFocusChanged.addListener(function(windowId)
  {
    if (windowId != chrome.windows.WINDOW_ID_NONE)
      updateContextMenu();
  });


  /* Web requests */

  var framesOfTabs = {__proto__: null};

  ext.getFrame = function(tabId, frameId)
  {
    return (framesOfTabs[tabId] || {})[frameId];
  };

  ext.webRequest = {
    onBeforeRequest: new ext._EventTarget(true),
    handlerBehaviorChanged: chrome.webRequest.handlerBehaviorChanged
  };

  chrome.tabs.query({}, function(tabs)
  {
    tabs.forEach(function(tab)
    {
      chrome.webNavigation.getAllFrames({tabId: tab.id}, function(details)
      {
        if (details && details.length > 0)
        {
          var frames = framesOfTabs[tab.id] = {__proto__: null};

          for (var i = 0; i < details.length; i++)
            frames[details[i].frameId] = {url: details[i].url, parent: null};

          for (var i = 0; i < details.length; i++)
          {
            var parentFrameId = details[i].parentFrameId;

            if (parentFrameId != -1)
              frames[details[i].frameId].parent = frames[parentFrameId];
          }
        }
      });
    });
  });

  chrome.webRequest.onBeforeRequest.addListener(function(details)
  {
    try
    {
      // the high-level code isn't interested in requests that aren't related
      // to a tab and since those can only be handled in Chrome, we ignore
      // them here instead of in the browser independent high-level code.
      if (details.tabId == -1)
        return;

      var isMainFrame = details.type == "main_frame" || (
        // assume that the first request belongs to the top frame. Chrome
        // may give the top frame the type "object" instead of "main_frame".
        // https://code.google.com/p/chromium/issues/detail?id=281711
        details.frameId == 0 && !(details.tabId in framesOfTabs)
      );

      var frames = null;
      if (!isMainFrame)
        frames = framesOfTabs[details.tabId];
      if (!frames)
        frames = framesOfTabs[details.tabId] = {__proto__: null};

      var frame = null;
      if (!isMainFrame)
      {
        // we are looking for the frame that contains the element that
        // is about to load, however if a frame is loading the surrounding
        // frame is indicated by parentFrameId instead of frameId
        var frameId;
        if (details.type == "sub_frame")
          frameId = details.parentFrameId;
        else
          frameId = details.frameId;

        frame = frames[frameId] || frames[Object.keys(frames)[0]];

        if (frame && !ext.webRequest.onBeforeRequest._dispatch(details.url, details.type, new Page({id: details.tabId}), frame))
          return {cancel: true};
      }

      if (isMainFrame || details.type == "sub_frame")
        frames[details.frameId] = {url: details.url, parent: frame};
    }
    catch (e)
    {
      // recent versions of Chrome cancel the request when an error occurs in
      // the onBeforeRequest listener. However in our case it is preferred, to
      // let potentially some ads through, rather than blocking legit requests.
      console.error(e);
    }
  }, {urls: ["<all_urls>"]}, ["blocking"]);


  /* Message passing */

  chrome.runtime.onMessage.addListener(function(message, rawSender, sendResponse)
  {
    var sender = {
      page: new Page(rawSender.tab),
      frame: {
        url: rawSender.url,
        get parent()
        {
          var frames = framesOfTabs[rawSender.tab.id];

          if (!frames)
            return null;

          for (var frameId in frames)
          {
            if (frames[frameId].url == rawSender.url)
              return frames[frameId].parent;
          }

          return frames[0];
        }
      }
    };

    return ext.onMessage._dispatch(message, sender, sendResponse);
  });


  /* Storage */

  ext.storage = localStorage;
})();
