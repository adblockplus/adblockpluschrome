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

let randomEventName = "abp-request-" + Math.random().toString(36).substr(2);

// Proxy "should we block?" messages from checkRequest inside the injected
// code to the background page and back again.
document.addEventListener(randomEventName, event =>
{
  let {url} = event.detail;

  browser.runtime.sendMessage({
    type: "request.blockedByRTCWrapper",
    url
  }).then(block =>
  {
    document.dispatchEvent(new CustomEvent(
      randomEventName + "-" + url, {detail: block}
    ));
  });
});

function injected(eventName, injectedIntoContentWindow)
{
  let checkRequest;

  /*
   * Frame context wrapper
   *
   * For some edge-cases Chrome will not run content scripts inside of frames.
   * Website have started to abuse this fact to access unwrapped APIs via a
   * frame's contentWindow (#4586, 5207). Therefore until Chrome runs content
   * scripts consistently for all frames we must take care to (re)inject our
   * wrappers when the contentWindow is accessed.
   */
  let injectedToString = Function.prototype.toString.bind(injected);
  let injectedFrames = new WeakSet();
  let injectedFramesAdd = WeakSet.prototype.add.bind(injectedFrames);
  let injectedFramesHas = WeakSet.prototype.has.bind(injectedFrames);

  function injectIntoContentWindow(contentWindow)
  {
    if (contentWindow && !injectedFramesHas(contentWindow))
    {
      injectedFramesAdd(contentWindow);
      try
      {
        contentWindow[eventName] = checkRequest;
        contentWindow.eval(
          "(" + injectedToString() + ")('" + eventName + "', true);"
        );
        delete contentWindow[eventName];
      }
      catch (e) {}
    }
  }

  for (let element of [HTMLFrameElement, HTMLIFrameElement, HTMLObjectElement])
  {
    let contentDocumentDesc = Object.getOwnPropertyDescriptor(
      element.prototype, "contentDocument"
    );
    let contentWindowDesc = Object.getOwnPropertyDescriptor(
      element.prototype, "contentWindow"
    );

    // Apparently in HTMLObjectElement.prototype.contentWindow does not exist
    // in older versions of Chrome such as 51.
    if (!contentWindowDesc)
      continue;

    let getContentDocument = Function.prototype.call.bind(
      contentDocumentDesc.get
    );
    let getContentWindow = Function.prototype.call.bind(
      contentWindowDesc.get
    );

    contentWindowDesc.get = function()
    {
      let contentWindow = getContentWindow(this);
      injectIntoContentWindow(contentWindow);
      return contentWindow;
    };
    contentDocumentDesc.get = function()
    {
      injectIntoContentWindow(getContentWindow(this));
      return getContentDocument(this);
    };
    Object.defineProperty(element.prototype, "contentWindow",
                          contentWindowDesc);
    Object.defineProperty(element.prototype, "contentDocument",
                          contentDocumentDesc);
  }

  /*
   * RTCPeerConnection wrapper
   *
   * The webRequest API in Chrome does not yet allow the blocking of
   * WebRTC connections.
   * See https://bugs.chromium.org/p/chromium/issues/detail?id=707683
   */
  let RealCustomEvent = window.CustomEvent;

  // If we've been injected into a frame via contentWindow then we can simply
  // grab the copy of checkRequest left for us by the parent document. Otherwise
  // we need to set it up now, along with the event handling functions.
  if (injectedIntoContentWindow)
  {
    checkRequest = window[eventName];
  }
  else
  {
    let addEventListener = document.addEventListener.bind(document);
    let dispatchEvent = document.dispatchEvent.bind(document);
    let removeEventListener = document.removeEventListener.bind(document);
    checkRequest = (url, callback) =>
    {
      let incomingEventName = eventName + "-" + url;

      function listener(event)
      {
        callback(event.detail);
        removeEventListener(incomingEventName, listener);
      }
      addEventListener(incomingEventName, listener);

      dispatchEvent(new RealCustomEvent(eventName, {detail: {url}}));
    };
  }

  // Only to be called before the page's code, not hardened.
  function copyProperties(src, dest, properties)
  {
    for (let name of properties)
    {
      if (Object.prototype.hasOwnProperty.call(src, name))
      {
        Object.defineProperty(dest, name,
                              Object.getOwnPropertyDescriptor(src, name));
      }
    }
  }

  let RealRTCPeerConnection = window.RTCPeerConnection ||
                              window.webkitRTCPeerConnection;

  // Firefox has the option (media.peerconnection.enabled) to disable WebRTC
  // in which case RealRTCPeerConnection is undefined.
  if (typeof RealRTCPeerConnection != "undefined")
  {
    let closeRTCPeerConnection = Function.prototype.call.bind(
      RealRTCPeerConnection.prototype.close
    );
    let RealArray = Array;
    let RealString = String;
    let {create: createObject, defineProperty} = Object;

    let normalizeUrl = url =>
    {
      if (typeof url != "undefined")
        return RealString(url);
    };

    let safeCopyArray = (originalArray, transform) =>
    {
      if (originalArray == null || typeof originalArray != "object")
        return originalArray;

      let safeArray = RealArray(originalArray.length);
      for (let i = 0; i < safeArray.length; i++)
      {
        defineProperty(safeArray, i, {
          configurable: false, enumerable: false, writable: false,
          value: transform(originalArray[i])
        });
      }
      defineProperty(safeArray, "length", {
        configurable: false, enumerable: false, writable: false,
        value: safeArray.length
      });
      return safeArray;
    };

    // It would be much easier to use the .getConfiguration method to obtain
    // the normalized and safe configuration from the RTCPeerConnection
    // instance. Unfortunately its not implemented as of Chrome unstable 59.
    // See https://www.chromestatus.com/feature/5271355306016768
    let protectConfiguration = configuration =>
    {
      if (configuration == null || typeof configuration != "object")
        return configuration;

      let iceServers = safeCopyArray(
        configuration.iceServers,
        iceServer =>
        {
          let {url, urls} = iceServer;

          // RTCPeerConnection doesn't iterate through pseudo Arrays of urls.
          if (typeof urls != "undefined" && !(urls instanceof RealArray))
            urls = [urls];

          return createObject(iceServer, {
            url: {
              configurable: false, enumerable: false, writable: false,
              value: normalizeUrl(url)
            },
            urls: {
              configurable: false, enumerable: false, writable: false,
              value: safeCopyArray(urls, normalizeUrl)
            }
          });
        }
      );

      return createObject(configuration, {
        iceServers: {
          configurable: false, enumerable: false, writable: false,
          value: iceServers
        }
      });
    };

    let checkUrl = (peerconnection, url) =>
    {
      checkRequest(url, blocked =>
      {
        if (blocked)
        {
          // Calling .close() throws if already closed.
          try
          {
            closeRTCPeerConnection(peerconnection);
          }
          catch (e) {}
        }
      });
    };

    let checkConfiguration = (peerconnection, configuration) =>
    {
      if (configuration && configuration.iceServers)
      {
        for (let i = 0; i < configuration.iceServers.length; i++)
        {
          let iceServer = configuration.iceServers[i];
          if (iceServer)
          {
            if (iceServer.url)
              checkUrl(peerconnection, iceServer.url);

            if (iceServer.urls)
            {
              for (let j = 0; j < iceServer.urls.length; j++)
                checkUrl(peerconnection, iceServer.urls[j]);
            }
          }
        }
      }
    };

    // Chrome unstable (tested with 59) has already implemented
    // setConfiguration, so we need to wrap that if it exists too.
    // https://www.chromestatus.com/feature/5596193748942848
    if (RealRTCPeerConnection.prototype.setConfiguration)
    {
      let realSetConfiguration = Function.prototype.call.bind(
        RealRTCPeerConnection.prototype.setConfiguration
      );

      RealRTCPeerConnection.prototype.setConfiguration = function(configuration)
      {
        configuration = protectConfiguration(configuration);

        // Call the real method first, so that validates the configuration for
        // us. Also we might as well since checkRequest is asynchronous anyway.
        realSetConfiguration(this, configuration);
        checkConfiguration(this, configuration);
      };
    }

    let WrappedRTCPeerConnection = function(...args)
    {
      if (!(this instanceof WrappedRTCPeerConnection))
        return RealRTCPeerConnection();

      let configuration = protectConfiguration(args[0]);

      // Since the old webkitRTCPeerConnection constructor takes an optional
      // second argument we need to take care to pass that through. Necessary
      // for older versions of Chrome such as 51.
      let constraints;
      if (args.length > 1)
        constraints = args[1];

      let peerconnection = new RealRTCPeerConnection(configuration,
                                                     constraints);
      checkConfiguration(peerconnection, configuration);
      return peerconnection;
    };

    WrappedRTCPeerConnection.prototype = RealRTCPeerConnection.prototype;

    let boundWrappedRTCPeerConnection = WrappedRTCPeerConnection.bind();
    copyProperties(RealRTCPeerConnection, boundWrappedRTCPeerConnection,
                   ["generateCertificate", "name", "prototype"]);
    RealRTCPeerConnection.prototype.constructor = boundWrappedRTCPeerConnection;

    if ("RTCPeerConnection" in window)
      window.RTCPeerConnection = boundWrappedRTCPeerConnection;
    if ("webkitRTCPeerConnection" in window)
      window.webkitRTCPeerConnection = boundWrappedRTCPeerConnection;
  }
}

if (document instanceof HTMLDocument)
{
  let sandbox = window.frameElement &&
                window.frameElement.getAttribute("sandbox");

  if (typeof sandbox != "string" || /(^|\s)allow-scripts(\s|$)/i.test(sandbox))
  {
    let script = document.createElement("script");
    let code = "(" + injected + ")('" + randomEventName + "');";

    script.type = "application/javascript";
    script.async = false;

    // Firefox 58 only bypasses site CSPs when assigning to 'src',
    // while Chrome 67 only bypass site CSPs when using 'textContent'.
    if (browser.runtime.getURL("").startsWith("moz-extension://"))
    {
      let url = URL.createObjectURL(new Blob([code]));
      script.src = url;
      document.documentElement.appendChild(script);
      URL.revokeObjectURL(url);
    }
    else
    {
      script.textContent = code;
      document.documentElement.appendChild(script);
    }

    document.documentElement.removeChild(script);
  }
}
