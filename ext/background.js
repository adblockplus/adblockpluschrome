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

"use strict";

{
  let nonEmptyPageMaps = new Set();

  let PageMap = ext.PageMap = function()
  {
    this._map = new Map();
  };
  PageMap.prototype = {
    _delete(id)
    {
      this._map.delete(id);

      if (this._map.size == 0)
        nonEmptyPageMaps.delete(this);
    },
    keys()
    {
      return Array.from(this._map.keys()).map(ext.getPage);
    },
    get(page)
    {
      return this._map.get(page.id);
    },
    set(page, value)
    {
      this._map.set(page.id, value);
      nonEmptyPageMaps.add(this);
    },
    has(page)
    {
      return this._map.has(page.id);
    },
    clear()
    {
      this._map.clear();
      nonEmptyPageMaps.delete(this);
    },
    delete(page)
    {
      this._delete(page.id);
    }
  };

  function removeFromAllPageMaps(pageId)
  {
    for (let pageMap of nonEmptyPageMaps)
      pageMap._delete(pageId);
  }


  /* Pages */

  let Page = ext.Page = function(tab)
  {
    this.id = tab.id;
    this._url = tab.url && new URL(tab.url);

    this.browserAction = new BrowserAction(tab.id);
    this.contextMenus = new ContextMenus(this);
  };
  Page.prototype = {
    get url()
    {
      // usually our Page objects are created from Chrome's Tab objects, which
      // provide the url. So we can return the url given in the constructor.
      if (this._url)
        return this._url;

      // but sometimes we only have the tab id when we create a Page object.
      // In that case we get the url from top frame of the tab, recorded by
      // the onBeforeRequest handler.
      let frames = framesOfTabs.get(this.id);
      if (frames)
      {
        let frame = frames.get(0);
        if (frame)
          return frame.url;
      }
    },
    sendMessage(message, responseCallback)
    {
      browser.tabs.sendMessage(this.id, message, responseCallback);
    }
  };

  ext.getPage = id => new Page({id: parseInt(id, 10)});

  function afterTabLoaded(callback)
  {
    return openedTab =>
    {
      let onUpdated = (tabId, changeInfo, tab) =>
      {
        if (tabId == openedTab.id && changeInfo.status == "complete")
        {
          browser.tabs.onUpdated.removeListener(onUpdated);
          callback(new Page(openedTab));
        }
      };
      browser.tabs.onUpdated.addListener(onUpdated);
    };
  }

  ext.pages = {
    onLoading: new ext._EventTarget(),
    onActivated: new ext._EventTarget(),
    onRemoved: new ext._EventTarget()
  };

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
  {
    if (changeInfo.status == "loading")
      ext.pages.onLoading._dispatch(new Page(tab));
  });

  function createFrame(tabId, frameId)
  {
    let frames = framesOfTabs.get(tabId);
    if (!frames)
    {
      frames = new Map();
      framesOfTabs.set(tabId, frames);
    }

    let frame = frames.get(frameId);
    if (!frame)
    {
      frame = {};
      frames.set(frameId, frame);
    }

    return frame;
  }

  function updatePageFrameStructure(frameId, tabId, url, parentFrameId)
  {
    if (frameId == 0)
    {
      let page = new Page({id: tabId, url});

      removeFromAllPageMaps(tabId);

      browser.tabs.get(tabId, () =>
      {
        // If the tab is prerendered, browser.tabs.get() sets
        // browser.runtime.lastError and we have to dispatch the onLoading
        // event, since the onUpdated event isn't dispatched for prerendered
        // tabs. However, we have to keep relying on the onUpdated event for
        // tabs that are already visible. Otherwise browser action changes get
        // overridden when Chrome automatically resets them on navigation.
        if (browser.runtime.lastError)
          ext.pages.onLoading._dispatch(page);
      });
    }

    // Update frame URL and parent in frame structure
    let frame = createFrame(tabId, frameId);
    frame.url = new URL(url);

    let parentFrame = framesOfTabs.get(tabId).get(parentFrameId);
    if (parentFrame)
      frame.parent = parentFrame;
  }

  browser.webRequest.onHeadersReceived.addListener(details =>
  {
    // We have to update the frame structure when switching to a new
    // document, so that we process any further requests made by that
    // document in the right context. Unfortunately, we cannot rely
    // on webNavigation.onCommitted since it isn't guaranteed to fire
    // before any subresources start downloading[1]. As an
    // alternative we use webRequest.onHeadersReceived for HTTP(S)
    // URLs, being careful to ignore any responses that won't cause
    // the document to be replaced.
    // [1] - https://bugs.chromium.org/p/chromium/issues/detail?id=665843

    // The request has been processed without replacing the document.
    // https://chromium.googlesource.com/chromium/src/+/02d3f50b/content/browser/frame_host/navigation_request.cc#473
    if (details.statusCode == 204 || details.statusCode == 205)
      return;

    for (let header of details.responseHeaders)
    {
      let headerName = header.name.toLowerCase();

      // For redirects we must wait for the next response in order
      // to know if the document will be replaced. Note: Chrome
      // performs a redirect only if there is a "Location" header with
      // a non-empty value and a known redirect status code.
      // https://chromium.googlesource.com/chromium/src/+/39a7d96/net/http/http_response_headers.cc#929
      if (headerName == "location" && header.value &&
          (details.statusCode == 301 || details.statusCode == 302 ||
           details.statusCode == 303 || details.statusCode == 307 ||
           details.statusCode == 308))
        return;

      // If the response initiates a download the document won't be
      // replaced. Chrome initiates a download if there is a
      // "Content-Disposition" with a valid and non-empty value other
      // than "inline".
      // https://chromium.googlesource.com/chromium/src/+/02d3f50b/content/browser/loader/mime_sniffing_resource_handler.cc#534
      // https://chromium.googlesource.com/chromium/src/+/02d3f50b/net/http/http_content_disposition.cc#374
      // https://chromium.googlesource.com/chromium/src/+/16e2688e/net/http/http_util.cc#431
      if (headerName == "content-disposition")
      {
        let disposition = header.value.split(";")[0].replace(/[ \t]+$/, "");
        if (disposition.toLowerCase() != "inline" &&
            /^[\x21-\x7E]+$/.test(disposition) &&
            !/[()<>@,;:\\"/[\]?={}]/.test(disposition))
          return;
      }

      // The value of the "Content-Type" header also determines if Chrome will
      // initiate a download, or otherwise how the response will be rendered.
      // We only need to consider responses which will result in a navigation
      // and be rendered as HTML or similar.
      // Note: Chrome might render the response as HTML if the "Content-Type"
      // header is missing, invalid or unknown.
      // https://chromium.googlesource.com/chromium/src/+/99f41af9/net/http/http_util.cc#66
      // https://chromium.googlesource.com/chromium/src/+/3130418a/net/base/mime_sniffer.cc#667
      if (headerName == "content-type")
      {
        let mediaType = header.value.split(/[ \t;(]/)[0].toLowerCase();
        if (mediaType.includes("/") &&
            mediaType != "*/*" &&
            mediaType != "application/unknown" &&
            mediaType != "unknown/unknown" &&
            mediaType != "text/html" &&
            mediaType != "text/xml" &&
            mediaType != "application/xml" &&
            mediaType != "application/xhtml+xml" &&
            mediaType != "image/svg+xml")
          return;
      }
    }

    updatePageFrameStructure(details.frameId, details.tabId, details.url,
                             details.parentFrameId);
  },
  {types: ["main_frame", "sub_frame"], urls: ["http://*/*", "https://*/*"]},
  ["responseHeaders"]);

  browser.webNavigation.onBeforeNavigate.addListener(details =>
  {
    // Requests can be made by about:blank frames before the frame's
    // onCommitted event has fired, so we update the frame structure
    // for those now.
    if (details.url.startsWith("about:"))
    {
      updatePageFrameStructure(details.frameId, details.tabId, details.url,
                               details.parentFrameId);
    }
  });

  browser.webNavigation.onCommitted.addListener(details =>
  {
    // We have to update the frame structure for documents that weren't
    // loaded over HTTP (including documents cached by Service Workers),
    // when the navigation occurs. However, we must be careful to not
    // update the state of the same document twice, otherewise the number
    // of any ads blocked already and any recorded sitekey could get lost.
    let frame = ext.getFrame(details.tabId, details.frameId);
    if (!frame || frame.url.href != details.url)
    {
      updatePageFrameStructure(details.frameId, details.tabId, details.url,
                               details.parentFrameId);
    }
  });

  function forgetTab(tabId)
  {
    ext.pages.onRemoved._dispatch(tabId);

    removeFromAllPageMaps(tabId);
    framesOfTabs.delete(tabId);
  }

  browser.tabs.onReplaced.addListener((addedTabId, removedTabId) =>
  {
    forgetTab(removedTabId);
  });

  browser.tabs.onRemoved.addListener(forgetTab);

  browser.tabs.onActivated.addListener(details =>
  {
    ext.pages.onActivated._dispatch(new Page({id: details.tabId}));
  });


  /* Browser actions */

  let BrowserAction = function(tabId)
  {
    this._tabId = tabId;
    this._changes = null;
  };
  BrowserAction.prototype = {
    _applyChanges()
    {
      if ("iconPath" in this._changes)
      {
        // Firefox for Android displays the browser action not as an icon but
        // as a menu item. There is no icon, but such an option may be added in
        // the future.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1331746
        if ("setIcon" in browser.browserAction)
        {
          let path = {
            16: this._changes.iconPath.replace("$size", "16"),
            19: this._changes.iconPath.replace("$size", "19"),
            20: this._changes.iconPath.replace("$size", "20"),
            32: this._changes.iconPath.replace("$size", "32"),
            38: this._changes.iconPath.replace("$size", "38"),
            40: this._changes.iconPath.replace("$size", "40")
          };
          try
          {
            browser.browserAction.setIcon({tabId: this._tabId, path});
          }
          catch (e)
          {
            // Edge throws if passed icon sizes different than 19,20,38,40px.
            delete path[16];
            delete path[32];
            browser.browserAction.setIcon({tabId: this._tabId, path});
          }
        }
      }

      if ("badgeText" in this._changes)
      {
        // There is no badge on Firefox for Android; the browser action is
        // simply a menu item.
        if ("setBadgeText" in browser.browserAction)
        {
          browser.browserAction.setBadgeText({
            tabId: this._tabId,
            text: this._changes.badgeText
          });
        }
      }

      if ("badgeColor" in this._changes)
      {
        // There is no badge on Firefox for Android; the browser action is
        // simply a menu item.
        if ("setBadgeBackgroundColor" in browser.browserAction)
        {
          browser.browserAction.setBadgeBackgroundColor({
            tabId: this._tabId,
            color: this._changes.badgeColor
          });
        }
      }

      this._changes = null;
    },
    _queueChanges()
    {
      browser.tabs.get(this._tabId, () =>
      {
        // If the tab is prerendered, browser.tabs.get() sets
        // browser.runtime.lastError and we have to delay our changes
        // until the currently visible tab is replaced with the
        // prerendered tab. Otherwise browser.browserAction.set* fails.
        if (browser.runtime.lastError)
        {
          let onReplaced = (addedTabId, removedTabId) =>
          {
            if (addedTabId == this._tabId)
            {
              browser.tabs.onReplaced.removeListener(onReplaced);
              this._applyChanges();
            }
          };
          browser.tabs.onReplaced.addListener(onReplaced);
        }
        else
        {
          this._applyChanges();
        }
      });
    },
    _addChange(name, value)
    {
      if (!this._changes)
      {
        this._changes = {};
        this._queueChanges();
      }

      this._changes[name] = value;
    },
    setIcon(path)
    {
      this._addChange("iconPath", path);
    },
    setBadge(badge)
    {
      if (!badge)
      {
        this._addChange("badgeText", "");
      }
      else
      {
        if ("number" in badge)
          this._addChange("badgeText", badge.number.toString());

        if ("color" in badge)
          this._addChange("badgeColor", badge.color);
      }
    }
  };


  /* Context menus */

  let contextMenuItems = new ext.PageMap();
  let contextMenuUpdating = false;

  let updateContextMenu = () =>
  {
    // Firefox for Android does not support context menus.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1269062
    if (!("contextMenus" in browser) || contextMenuUpdating)
      return;

    contextMenuUpdating = true;

    browser.tabs.query({active: true, lastFocusedWindow: true}, tabs =>
    {
      browser.contextMenus.removeAll(() =>
      {
        contextMenuUpdating = false;

        if (tabs.length == 0)
          return;

        let items = contextMenuItems.get({id: tabs[0].id});

        if (!items)
          return;

        items.forEach(item =>
        {
          browser.contextMenus.create({
            title: item.title,
            contexts: item.contexts,
            onclick(info, tab)
            {
              item.onclick(new Page(tab));
            }
          });
        });
      });
    });
  };

  let ContextMenus = function(page)
  {
    this._page = page;
  };
  ContextMenus.prototype = {
    create(item)
    {
      let items = contextMenuItems.get(this._page);
      if (!items)
        contextMenuItems.set(this._page, items = []);

      items.push(item);
      updateContextMenu();
    },
    remove(item)
    {
      let items = contextMenuItems.get(this._page);
      if (items)
      {
        let index = items.indexOf(item);
        if (index != -1)
        {
          items.splice(index, 1);
          updateContextMenu();
        }
      }
    }
  };

  browser.tabs.onActivated.addListener(updateContextMenu);

  if ("windows" in browser)
  {
    browser.windows.onFocusChanged.addListener(windowId =>
    {
      if (windowId != browser.windows.WINDOW_ID_NONE)
        updateContextMenu();
    });
  }


  /* Web requests */

  let framesOfTabs = new Map();

  ext.getFrame = (tabId, frameId) =>
  {
    let frames = framesOfTabs.get(tabId);
    return frames && frames.get(frameId);
  };

  browser.tabs.query({}, tabs =>
  {
    tabs.forEach(tab =>
    {
      browser.webNavigation.getAllFrames({tabId: tab.id}, details =>
      {
        if (details && details.length > 0)
        {
          let frames = new Map();
          framesOfTabs.set(tab.id, frames);

          for (let detail of details)
          {
            let frame = {url: new URL(detail.url)};
            frames.set(detail.frameId, frame);

            if (detail.parentFrameId != -1)
              frame.parent = frames.get(detail.parentFrameId);
          }
        }
      });
    });
  });


  /* Message passing */

  browser.runtime.onMessage.addListener((message, rawSender, sendResponse) =>
  {
    let sender = {};

    // Add "page" and "frame" if the message was sent by a content script.
    // If sent by popup or the background page itself, there is no "tab".
    if ("tab" in rawSender)
    {
      sender.page = new Page(rawSender.tab);
      sender.frame = {
        id: rawSender.frameId,
        // In Edge requests from internal extension pages
        // (protocol ms-browser-extension://) do no have a sender URL.
        url: rawSender.url ? new URL(rawSender.url) : null,
        get parent()
        {
          let frames = framesOfTabs.get(rawSender.tab.id);

          if (!frames)
            return null;

          let frame = frames.get(rawSender.frameId);
          if (frame)
            return frame.parent || null;

          return frames.get(0) || null;
        }
      };
    }

    return ext.onMessage._dispatch(
      message, sender, sendResponse
    ).includes(true);
  });
}
