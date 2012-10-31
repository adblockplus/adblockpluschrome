/*
 * This file is part of the Adblock Plus extension,
 * Copyright (C) 2006-2012 Eyeo GmbH
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

//
// Module framework stuff
//

function require(module)
{
  return require.scopes[module];
}
require.scopes = {__proto__: null};

function importAll(module, globalObj)
{
  var exports = require(module);
  for (var key in exports)
    globalObj[key] = exports[key];
}

onShutdown = {
  done: false,
  add: function() {},
  remove: function() {}
};

//
// XPCOM emulation
//

var Components =
{
  interfaces:
  {
    nsIFile: {DIRECTORY_TYPE: 0},
    nsIFileURL: function() {},
    nsIHttpChannel: function() {},
    nsITimer: {TYPE_REPEATING_SLACK: 0},
    nsIInterfaceRequestor: null,
    nsIChannelEventSink: null
  },
  classes:
  {
    "@mozilla.org/timer;1":
    {
      createInstance: function()
      {
        return new FakeTimer();
      }
    },
    "@mozilla.org/xmlextras/xmlhttprequest;1":
    {
      createInstance: function()
      {
        return new XMLHttpRequest();
      }
    }
  },
  results: {},
  utils: {
    reportError: function(e)
    {
      console.error(e);
      console.trace();
    }
  },
  manager: null,
  ID: function()
  {
    return null;
  }
};
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var XPCOMUtils =
{
  generateQI: function() {}
};

//
// Info pseudo-module
//

require.scopes.info =
{
  get addonID()
  {
    return chrome.i18n.getMessage("@@extension_id");
  },
  addonVersion: "2.1", // Hardcoded for now
  addonRoot: "",
  get addonName()
  {
    return chrome.i18n.getMessage("name");
  },
  application: "chrome"
};

//
// IO module: no direct file system access, using FileSystem API
//

require.scopes.io =
{
  IO: {
    _getFileEntry: function(file, create, successCallback, errorCallback)
    {
      if (file instanceof FakeFile)
        file = file.path;
      else if ("spec" in file)
        file = file.spec;

      // Remove directory path - we operate on a single directory in Chrome
      file = file.replace(/^.*[\/\\]/, "");

      // We request a gigabyte of space, just in case
      (window.requestFileSystem || window.webkitRequestFileSystem)(window.PERSISTENT, 1024*1024*1024, function(fs)
      {
        fs.root.getFile(file, {create: create}, function(fileEntry)
        {
          successCallback(fs, fileEntry);
        }, errorCallback);
      }, errorCallback);
    },

    lineBreak: "\n",

    resolveFilePath: function(path)
    {
      return new FakeFile(path);
    },

    readFromFile: function(file, decode, listener, callback, timeLineID)
    {
      if ("spec" in file && /^defaults\b/.test(file.spec))
      {
        // Code attempts to read the default patterns.ini, we don't have that.
        // Make sure to execute first-run actions instead.
        callback(null);
        if (localStorage.currentVersion)
          seenDataCorruption = true;
        delete localStorage.currentVersion;
        return;
      }

      this._getFileEntry(file, false, function(fs, fileEntry)
      {
        fileEntry.file(function(file)
        {
          var reader = new FileReader();
          reader.onloadend = function()
          {
            if (reader.error)
              callback(reader.error);
            else
            {
              var lines = reader.result.split(/[\r\n]+/);
              for (var i = 0; i < lines.length; i++)
                listener.process(lines[i]);
              listener.process(null);
              callback(null);
            }
          };
          reader.readAsText(file);
        }, callback);
      }, callback);
    },

    writeToFile: function(file, encode, data, callback, timeLineID)
    {
      this._getFileEntry(file, true, function(fs, fileEntry)
      {
        fileEntry.createWriter(function(writer)
        {
          var executeWriteOperation = function(op, nextOperation)
          {
            writer.onwriteend = function()
            {
              if (writer.error)
                callback(writer.error);
              else
                nextOperation();
            }.bind(this);

            op();
          }.bind(this);

          executeWriteOperation(writer.truncate.bind(writer, 0), function()
          {
            var blob;
            try
            {
              blob = new Blob([data.join(this.lineBreak) + this.lineBreak], {type: "text/plain"});
            }
            catch (e)
            {
              if (!(e instanceof TypeError))
                throw e;

              // Blob wasn't a constructor before Chrome 20
              var builder = new (window.BlobBuilder || window.WebKitBlobBuilder);
              builder.append(data.join(this.lineBreak) + this.lineBreak);
              blob = builder.getBlob("text/plain");
            }
            executeWriteOperation(writer.write.bind(writer, blob), callback.bind(null, null));
          }.bind(this));
        }.bind(this), callback);
      }.bind(this), callback);
    },

    copyFile: function(fromFile, toFile, callback)
    {
      // Simply combine read and write operations
      var data = [];
      this.readFromFile(fromFile, false, {
        process: function(line)
        {
          if (line !== null)
            data.push(line);
        }
      }, function(e)
      {
        if (e)
          callback(e);
        else
          this.writeToFile(toFile, false, data, callback);
      }.bind(this));
    },

    renameFile: function(fromFile, newName, callback)
    {
      this._getFileEntry(fromFile, false, function(fs, fileEntry)
      {
        fileEntry.moveTo(fs.root, newName, function()
        {
          callback(null);
        }, callback);
      }, callback);
    },

    removeFile: function(file, callback)
    {
      this._getFileEntry(file, false, function(fs, fileEntry)
      {
        fileEntry.remove(function()
        {
          callback(null);
        }, callback);
      }, callback);
    },

    statFile: function(file, callback)
    {
      this._getFileEntry(file, false, function(fs, fileEntry)
      {
        fileEntry.getMetadata(function(metadata)
        {
          callback(null, {
            exists: true,
            isDirectory: fileEntry.isDirectory,
            isFile: fileEntry.isFile,
            lastModified: metadata.modificationTime.getTime()
          });
        }, callback);
      }, callback);
    }
  }
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
  append: function(path)
  {
    this.path += path;
  },
  clone: function()
  {
    return new FakeFile(this.path);
  },
  get parent()
  {
    return {create: function() {}};
  },
  normalize: function() {}
};

//
// Prefs module: the values are hardcoded for now.
//

require.scopes.prefs = {
  Prefs: {
    enabled: true,
    patternsfile: "patterns.ini",
    patternsbackups: 5,
    patternsbackupinterval: 24,
    data_directory: "",
    savestats: false,
    privateBrowsing: false,
    subscriptions_fallbackerrors: 5,
    subscriptions_fallbackurl: "https://adblockplus.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&channelStatus=%CHANNELSTATUS%&responseStatus=%RESPONSESTATUS%",
    subscriptions_autoupdate: true,
    subscriptions_exceptionsurl: "https://easylist-downloads.adblockplus.org/exceptionrules.txt",
    documentation_link: "https://adblockplus.org/redirect?link=%LINK%&lang=%LANG%",
    addListener: function() {}
  }
};

//
// Utils module
//

require.scopes.utils =
{
  Utils: {
    systemPrincipal: null,
    getString: function(id)
    {
      return id;
    },
    runAsync: function(callback, thisPtr)
    {
      var params = Array.prototype.slice.call(arguments, 2);
      window.setTimeout(function()
      {
        callback.apply(thisPtr, params);
      }, 0);
    },
    get appLocale()
    {
      var locale = chrome.i18n.getMessage("@@ui_locale").replace(/_/g, "-");
      this.__defineGetter__("appLocale", function() {return locale});
      return this.appLocale;
    },
    generateChecksum: function(lines)
    {
      // We cannot calculate MD5 checksums yet :-(
      return null;
    },
    makeURI: function(url)
    {
      return Services.io.newURI(url);
    },

    checkLocalePrefixMatch: function(prefixes)
    {
      if (!prefixes)
        return null;

      var list = prefixes.split(",");
      for (var i = 0; i < list.length; i++)
        if (new RegExp("^" + list[i] + "\\b").test(this.appLocale))
          return list[i];

      return null;
    },

    chooseFilterSubscription: function(subscriptions)
    {
      var selectedItem = null;
      var selectedPrefix = null;
      var matchCount = 0;
      for (var i = 0; i < subscriptions.length; i++)
      {
        var subscription = subscriptions[i];
        if (!selectedItem)
          selectedItem = subscription;

        var prefix = require("utils").Utils.checkLocalePrefixMatch(subscription.getAttribute("prefixes"));
        if (prefix)
        {
          if (!selectedPrefix || selectedPrefix.length < prefix.length)
          {
            selectedItem = subscription;
            selectedPrefix = prefix;
            matchCount = 1;
          }
          else if (selectedPrefix && selectedPrefix.length == prefix.length)
          {
            matchCount++;

            // If multiple items have a matching prefix of the same length:
            // Select one of the items randomly, probability should be the same
            // for all items. So we replace the previous match here with
            // probability 1/N (N being the number of matches).
            if (Math.random() * matchCount < 1)
            {
              selectedItem = subscription;
              selectedPrefix = prefix;
            }
          }
        }
      }
      return selectedItem;
    }
  }
};

//
// ElemHideHitRegistration dummy implementation
//

require.scopes.elemHideHitRegistration =
{
  AboutHandler: {}
};

//
// Services.jsm module emulation
//

var Services =
{
  io: {
    newURI: function(uri)
    {
      if (!uri.length || uri[0] == "~")
        throw new Error("Invalid URI");

      /^([^:\/]*)/.test(uri);
      var scheme = RegExp.$1.toLowerCase();

      return {
        scheme: scheme,
        spec: uri,
        QueryInterface: function()
        {
          return this;
        }
      };
    },
    newFileURI: function(file)
    {
      var result = this.newURI("file:///" + file.path);
      result.file = file;
      return result;
    }
  },
  obs: {
    addObserver: function() {},
    removeObserver: function() {}
  },
  vc: {
    compare: function(v1, v2)
    {
      function parsePart(s)
      {
        if (!s)
          return parsePart("0");

        var part = {
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

        var matches = s.match(/(\d*)(\D*)(\d*)(.*)/);
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
        var result = 0;
        var elements = ["numA", "strB", "numC", "extraD"];
        elements.some(function(element)
        {
          result = comparePartElement(p1[element], p2[element]);
          return result;
        });
        return result;
      }

      var parts1 = v1.split(".");
      var parts2 = v2.split(".");
      for (var i = 0; i < Math.max(parts1.length, parts2.length); i++)
      {
        var result = compareParts(parsePart(parts1[i]), parsePart(parts2[i]));
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

var FileUtils =
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
  initWithCallback: function(callback, delay)
  {
    this.callback = callback;
    this.delay = delay;
    this.scheduleTimeout();
  },
  scheduleTimeout: function()
  {
    var me = this;
    window.setTimeout(function()
    {
      try
      {
        me.callback();
      }
      catch(e)
      {
        Cu.reportError(e);
      }
      me.scheduleTimeout();
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
  QueryInterface: function()
  {
    return this;
  }
};
