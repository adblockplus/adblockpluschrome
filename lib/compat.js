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

"use strict";

//
// Module framework stuff
//

function require(module)
{
  if (!(module in require.scopes))
  {
    let scope = {exports: {}};
    require.scopes[module] = require.modules[module](scope, scope.exports);
  }
  return require.scopes[module];
}
require.modules = Object.create(null);
require.scopes = Object.create(null);

function importAll(module, globalObj)
{
  let exports = require(module);
  for (let key in exports)
    globalObj[key] = exports[key];
}

let onShutdown = {
  done: false,
  add() {},
  remove() {}
};

//
// XPCOM emulation
//

let Components =
{
  interfaces:
  {
    nsIFile: {DIRECTORY_TYPE: 0},
    nsIFileURL() {},
    nsIHttpChannel() {},
    nsITimer: {TYPE_REPEATING_SLACK: 0},
    nsIInterfaceRequestor: null,
    nsIChannelEventSink: null
  },
  classes:
  {
    "@mozilla.org/timer;1":
    {
      createInstance() { return new FakeTimer(); }
    },
    "@mozilla.org/xmlextras/xmlhttprequest;1":
    {
      createInstance() { return new XMLHttpRequest(); }
    }
  },
  results: {},
  utils: {
    import()
    {
    },
    reportError(e)
    {
      console.error(e);
      console.trace();
    }
  },
  manager: null,
  ID() { return null; }
};
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let XPCOMUtils =
{
  generateQI() {}
};

//
// Fake nsIFile implementation for our I/O
//

function FakeFile(path)
{
  this.path = path;
}
FakeFile.prototype =
{
  get leafName()
  {
    return this.path;
  },
  set leafName(value)
  {
    this.path = value;
  },
  append(path)
  {
    this.path += path;
  },
  clone()
  {
    return new FakeFile(this.path);
  },
  get parent()
  {
    return {create() {}};
  },
  normalize() {}
};

//
// Services.jsm module emulation
//

let Services =
{
  obs: {
    addObserver() {},
    removeObserver() {}
  },
  vc: {
    compare(v1, v2)
    {
      function parsePart(s)
      {
        if (!s)
          return parsePart("0");

        let part = {
          numA: 0,
          strB: "",
          numC: 0,
          extraD: ""
        };

        if (s === "*")
        {
          part.numA = Number.MAX_VALUE;
          return part;
        }

        let matches = s.match(/(\d*)(\D*)(\d*)(.*)/);
        part.numA = parseInt(matches[1], 10) || part.numA;
        part.strB = matches[2] || part.strB;
        part.numC = parseInt(matches[3], 10) || part.numC;
        part.extraD = matches[4] || part.extraD;

        if (part.strB == "+")
        {
          part.numA++;
          part.strB = "pre";
        }

        return part;
      }

      function comparePartElement(s1, s2)
      {
        if (s1 === "" && s2 !== "")
          return 1;
        if (s1 !== "" && s2 === "")
          return -1;
        return s1 === s2 ? 0 : (s1 > s2 ? 1 : -1);
      }

      function compareParts(p1, p2)
      {
        let result = 0;
        let elements = ["numA", "strB", "numC", "extraD"];
        elements.some(element =>
        {
          result = comparePartElement(p1[element], p2[element]);
          return result;
        });
        return result;
      }

      let parts1 = v1.split(".");
      let parts2 = v2.split(".");
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++)
      {
        let result = compareParts(parsePart(parts1[i]), parsePart(parts2[i]));
        if (result)
          return result;
      }
      return 0;
    }
  }
}

//
// FileUtils.jsm module emulation
//

let FileUtils =
{
  PERMS_DIRECTORY: 0
};

function FakeTimer()
{
}
FakeTimer.prototype =
{
  delay: 0,
  callback: null,
  initWithCallback(callback, delay)
  {
    this.callback = callback;
    this.delay = delay;
    this.scheduleTimeout();
  },
  scheduleTimeout()
  {
    window.setTimeout(() =>
    {
      try
      {
        this.callback();
      }
      catch(e)
      {
        Cu.reportError(e);
      }
      this.scheduleTimeout();
    }, this.delay);
  }
};

//
// Add a channel property to XMLHttpRequest, Synchronizer needs it
//

XMLHttpRequest.prototype.channel =
{
  status: -1,
  notificationCallbacks: {},
  loadFlags: 0,
  INHIBIT_CACHING: 0,
  VALIDATE_ALWAYS: 0,
  QueryInterface()
  {
    return this;
  }
};
