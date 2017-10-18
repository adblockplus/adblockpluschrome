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
  const asyncAPIs = [
    "contextMenus.removeAll",
    "devtools.panels.create",
    "notifications.clear",
    "notifications.create",
    "runtime.openOptionsPage",
    "runtime.sendMessage",
    "runtime.setUninstallURL",
    "storage.local.get",
    "storage.local.remove",
    "storage.local.set",
    "storage.managed.get",
    "tabs.create",
    "tabs.get",
    "tabs.insertCSS",
    "tabs.query",
    "tabs.reload",
    "tabs.sendMessage",
    "tabs.update",
    "webNavigation.getAllFrames",
    "webRequest.handlerBehaviorChanged",
    "windows.create",
    "windows.update"
  ];

  function wrapAPI(api)
  {
    let object = browser;
    let path = api.split(".");
    let name = path.pop();

    for (let node of path)
    {
      object = object[node];

      if (!object)
        return;
    }

    let func = object[name];
    object[name] = function(...args)
    {
      if (typeof args[args.length - 1] == "function")
        return func.apply(object, args);

      // If the last argument is undefined, we drop it from the list assuming
      // it stands for the optional callback. We must do this, because we have
      // to replace it with our own callback. If we simply append our own
      // callback to the list, it won't match the signature of the function and
      // will cause an exception.
      if (typeof args[args.length - 1] == "undefined")
        args.pop();

      return new Promise((resolve, reject) =>
      {
        func.call(object, ...args, result =>
        {
          let error = browser.runtime.lastError;
          if (error)
            reject(error);
          else
            resolve(result);
        });
      });
    };
  }

  function shouldWrapAPIs()
  {
    try
    {
      return !(browser.storage.local.get([]) instanceof Promise);
    }
    catch (error)
    {
    }

    return true;
  }

  if (shouldWrapAPIs())
  {
    // Unlike Firefox and Microsoft Edge, Chrome doesn't have a "browser" object,
    // but provides the extension API through the "chrome" namespace
    // (non-standard).
    if (typeof browser == "undefined")
      window.browser = chrome;

    for (let api of asyncAPIs)
      wrapAPI(api);
  }

  // Workaround since HTMLCollection, NodeList, StyleSheetList, and CSSRuleList
  // didn't have iterator support before Chrome 51.
  // https://bugs.chromium.org/p/chromium/issues/detail?id=401699
  for (let object of [HTMLCollection, NodeList, StyleSheetList, CSSRuleList])
  {
    if (!(Symbol.iterator in object.prototype))
      object.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  }
}
