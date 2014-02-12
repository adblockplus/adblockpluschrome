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

  var sendMessage = chrome.tabs.sendMessage || chrome.tabs.sendRequest;

  var Page = ext.Page = function(tab)
  {
    this._id = tab.id;
    this._url = tab.url;

    this.browserAction = new BrowserAction(tab.id);
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
      sendMessage(this._id, message, responseCallback);
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


  /* Frames */

  var framesOfTabs = {__proto__: null};

  var Frame = ext.Frame = function(params)
  {
    this._frameId = params.frameId;
    this._tabId = params.tabId;
    this._url = params.url;
  };
  Frame.prototype = {
    get url()
    {
      if (this._url != null)
        return this._url;

      var frames = framesOfTabs[this._tabId];
      if (frames)
      {
        var frame = frames[this._frameId];
        if (frame)
          return frame.url;
      }
    },
    get parent()
    {
      var frames = framesOfTabs[this._tabId];
      if (frames)
      {
        var frame;
        if (this._frameId != null)
          frame = frames[this._frameId];
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

        return new Frame({frameId: frame.parent, tabId: this._tabId});
      }
    }
  };


  /* Web requests */

  ext.webRequest = {
    onBeforeRequest: new ext._EventTarget(true),
    handlerBehaviorChanged: chrome.webRequest.handlerBehaviorChanged
  };

  chrome.webRequest.onBeforeRequest.addListener(function(details)
  {
    try
    {
      // the high-level code isn't interested in requests that aren't related
      // to a tab and since those can only be handled in Chrome, we ignore
      // them here instead of in the browser independent high-level code.
      if (details.tabId == -1)
        return;

      var page = new Tab({id: details.tabId});
      var frames = framesOfTabs[details.tabId];

      if (!frames)
      {
        frames = framesOfTabs[details.tabId] = [];

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

      var frame = new Frame({id: frameId, tabId: details.tabId});

      if (!ext.webRequest.onBeforeRequest._dispatch(details.url, details.type, page, frame))
        return {cancel: true};
    }
    catch (e)
    {
      // recent versions of Chrome cancel the request when an error occurs in
      // the onBeforeRequest listener. However in our case it is preferred, to
      // let potentially some ads through, rather than blocking legit requests.
      console.error(e);
    }
  }, {urls: ["<all_urls>"]}, ["blocking"]);


  /* Context menus */

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
          onclick(info.srcUrl, new Page(tab));
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


  /* Message passing */

  ext._setupMessageListener(function(sender)
  {
    return {
      page: new Page(sender.tab),
      frame: new Frame({url: sender.url, tabId: sender.tab.id})
    };
  });


  /* Storage */

  ext.storage = localStorage;
})();
