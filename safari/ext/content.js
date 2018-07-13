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
  // the safari object is missing in frames created from javascript: URLs.
  // So we have to fallback to the safari object from the parent frame.
  if (!("safari" in window))
    window.safari = window.parent.safari;


  /* Intialization */

  var majorApplicationVersion = parseInt(navigator.userAgent.match(/Version\/([\d]+)/)[1]);

  var beforeLoadEvent;
  var usingContentBlockerAPI = true;

  // Safari 12 automatically disables extensions which use the old canLoad API,
  // so avoid using the old APIs on Safari 12!
  if (majorApplicationVersion < 12)
  {
    beforeLoadEvent = document.createEvent("Event");
    beforeLoadEvent.initEvent("beforeload", false, true);

    // Decide if we should use the new content blocker API or not. (Note when the
    // API is used Safari breaks the canLoad function, making it either throw an
    // exception or return true when used.)
    try
    {
      if (safari.self.tab.canLoad(beforeLoadEvent,
                                  {category: "request",
                                   payload: {type: "prefs.get",
                                             key: "safariContentBlocker"}}) != true)
        usingContentBlockerAPI = false;
    }
    catch (e)
    {
    }
  }

  var isTopLevel;
  var isPrerendered;
  var documentId;
  function notifyFrameLoading()
  {
    isTopLevel = window == window.top;
    isPrerendered = document.visibilityState == "prerender";
    documentId = Math.random().toString().substr(2);

    // Notify the background page that this frame is loading, generating
    // ourselves a random documentId while we're at it. That way the background
    // page can communicate with us reliably, despite limitations in Safari's
    // extension API.
    safari.self.tab.dispatchMessage("loading",  {
      url: window.location.href,
      referrer: document.referrer,
      isTopLevel: isTopLevel,
      isPrerendered: isPrerendered,
      documentId: documentId,
      legacyAPISupported: majorApplicationVersion < 12 &&
                          "canLoad" in safari.self.tab &&
                          "onbeforeload" in Element.prototype
    });
  }

  // We must notify the background page when this page is first loadeding (now)
  // but also when it is re-shown (if the user uses the back button to return to
  // this page in the future).
  notifyFrameLoading();
  window.addEventListener("pageshow", function(event)
  {
    if (event.persisted)
      notifyFrameLoading();
  });

  // Notify the background page when a prerendered page is displayed. That way
  // the existing page of the tab can be replaced with this new one.
  if (isTopLevel && isPrerendered)
  {
    var onVisibilitychange = function()
    {
      safari.self.tab.dispatchMessage("replaced", {documentId: documentId});
      document.removeEventListener("visibilitychange", onVisibilitychange);
    };
    document.addEventListener("visibilitychange", onVisibilitychange);
  }

  /* Web requests */

  if (!usingContentBlockerAPI)
  {
    document.addEventListener("beforeload", function(event)
    {
      // we don't block non-HTTP requests anyway, so we can bail out
      // without asking the background page. This is even necessary
      // because passing large data (like a photo encoded as data: URL)
      // to the background page, freezes Safari.
      if (/^(?!https?:)[\w-]+:/.test(event.url))
        return;

      var type = "OTHER";
      var eventName = "error";

      switch(event.target.localName)
      {
        case "frame":
        case "iframe":
          type = "SUBDOCUMENT";
          eventName = "load";
          break;
        case "img":
        case "input":
          type = "IMAGE";
          break;
        case "video":
        case "audio":
        case "source":
          type = "MEDIA";
          break;
        case "object":
        case "embed":
          type = "OBJECT";
          break;
        case "script":
          type = "SCRIPT";
          break;
        case "link":
          if (/\bstylesheet\b/i.test(event.target.rel))
            type = "STYLESHEET";
          break;
      }

      if (!safari.self.tab.canLoad(
        event, {
          category: "webRequest",
          url: event.url,
          type: type,
          documentId: documentId}))
      {
        event.preventDefault();

        // Safari doesn't dispatch the expected events for elements that have
        // been prevented from loading by having their "beforeload" event
        // cancelled. That is a "load" event for blocked frames, and an "error"
        // event for other blocked elements. We need to dispatch those events
        // manually here to avoid breaking element collapsing and pages that
        // rely on those events.
        setTimeout(function()
        {
          var evt = document.createEvent("Event");
          evt.initEvent(eventName, false, false);
          event.target.dispatchEvent(evt);
        });
      }
    }, true);
  }


  /* Context menus */

  document.addEventListener("contextmenu", function(event)
  {
    var element = event.srcElement;
    safari.self.tab.setContextMenuEventUserInfo(event, {
      documentId: documentId,
      tagName: element.localName
    });
  });


  /* Background page */

  ext.backgroundPage = {
    sendMessage: function(message, responseCallback)
    {
      messageProxy.sendMessage(message, responseCallback,
                               {documentId: documentId});
    },
    sendMessageSync: function(message)
    {
      if (majorApplicationVersion < 12)
      {
        return safari.self.tab.canLoad(
          beforeLoadEvent,
          {
            category: "request",
            documentId: documentId,
            payload: message
          }
        );
      }
    }
  };


  /* Message processing */

  var messageProxy = new ext._MessageProxy(safari.self.tab);

  safari.self.addEventListener("message", function(event)
  {
    if (event.name == "requestDocumentId" && isTopLevel)
    {
      safari.self.tab.dispatchMessage("documentId",  {
        pageId: event.message.pageId,
        documentId: documentId
      });
    }
    else if (event.message.targetDocuments.indexOf(documentId) != -1)
    {
      switch (event.name)
      {
        case "request":
          messageProxy.handleRequest(event.message, {});
          break;
        case "response":
          messageProxy.handleResponse(event.message);
          break;
      }
    }
  });


  /* Detecting extension reload/disable/uninstall (not supported on Safari) */

  ext.onExtensionUnloaded = {
    addListener: function() {},
    removeListener: function() {}
  };
})();
