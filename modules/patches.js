/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

function reportError(e)
{
  if (e == "Cache writing not supported")
    return;

  console.error(e);
  console.trace();
}

function ElemHidePatch()
{
  /**
   * Returns a list of selectors to be applied on a particular domain. With
   * specificOnly parameter set to true only the rules listing specific domains
   * will be considered.
   */
  ElemHide.getSelectorsForDomain = function(/**String*/ domain, /**Boolean*/ specificOnly)
  {
    var result = [];
    for (var key in filterByKey)
    {
      var filter = Filter.knownFilters[filterByKey[key]];
      if (specificOnly && (!filter.domains || filter.domains[""]))
        continue;

      if (filter.isActiveOnDomain(domain))
        result.push(filter.selector);
    }
    return result;
  };

  ElemHide.init = function() {};
}

function MatcherPatch()
{
  // Very ugly - we need to rewrite _checkEntryMatch() function to make sure
  // it calls Filter.fromText() instead of assuming that the filter exists.
  var origFunction = Matcher.prototype._checkEntryMatch.toString();
  var newFunction = origFunction.replace(/\bFilter\.knownFilters\[(.*?)\];/g, "Filter.fromText($1);");
  eval("Matcher.prototype._checkEntryMatch = " + newFunction);
}


// Replace FilterStorage.loadFromDisk, it assumes synchronous file reads - we
// need to read data first and run the original function then.
var files = {};
function FilterStoragePatch()
{
  var origLoadFromDisk = FilterStorage.loadFromDisk;
  FilterStorage.loadFromDisk = function(silent)
  {
    function callback(e)
    {
      if (e)
        reportError("File system error " + e.code);
      if (!(Prefs.patternsfile in files) || !files[Prefs.patternsfile].data)
      {
        // Data got lost, make sure to add default file subscription
        delete localStorage["currentVersion"];
      }
      origLoadFromDisk(silent);
    }

    // We request a gigabyte of space, just in case
    (window.requestFileSystem || window.webkitRequestFileSystem)(window.PERSISTENT, 1024*1024*1024, function(fs)
    {
      var part1 = Prefs.patternsfile;
      var part2 = "";
      if (/^(.*)(\.\w+)$/.test(part1)) {
        part1 = RegExp["$1"];
        part2 = RegExp["$2"];
      }

      var fileList = [];
      for (var i = 0; i <= Prefs.patternsbackups; i++)
        fileList.push(part1 + (i > 0 ? "-backup" + i : "") + part2);

      var currentIndex = 0;
      readNextFile();

      function readNextFile()
      {
        if (currentIndex >= fileList.length)
        {
          // We are done checking all files, now we can call the original function
          callback(null);
          return;
        }

        var filePath = fileList[currentIndex++];
        fs.root.getFile(filePath, {}, function(fileEntry)
        {
          files[filePath] = {exists: fileEntry.isFile, data: "", lastModified: 0};
          if (files[filePath].exists)
          {
            fileEntry.getMetadata(function(metadata)
            {
              files[filePath].lastModified = metadata.modificationTime.getTime();

              if (filePath == fileList[0])
              {
                // We don't read the backup files but we have to read the main file
                fileEntry.file(function(file)
                {
                  var reader = new FileReader();
                  reader.onloadend = function()
                  {
                    if (reader.error)
                      callback(reader.error);
                    else
                    {
                      files[filePath].data = reader.result;
                      readNextFile();
                    }
                  };
                  reader.readAsText(file);
                }, callback);
              }
              else
                readNextFile();
            }, callback);
          }
          else
            readNextFile();
        }, callback);
      }
    }, callback);
  };
}

var Components =
{
  interfaces:
  {
    nsIFile: {DIRECTORY_TYPE: 0},
    nsIFileURL: function() {},
    nsIFileInputStream: null,
    nsIFileOutputStream: null,
    nsIHttpChannel: function() {},
    nsIConverterInputStream: {DEFAULT_REPLACEMENT_CHARACTER: null},
    nsIConverterOutputStream: null,
    nsIUnicharLineInputStream: null,
    nsISafeOutputStream: null,
    nsITimer: {TYPE_REPEATING_SLACK: 0},
    nsIInterfaceRequestor: null,
    nsIChannelEventSink: null
  },
  classes:
  {
    "@mozilla.org/network/file-input-stream;1":
    {
      createInstance: function()
      {
        return new FakeInputStream();
      }
    },
    "@mozilla.org/network/file-output-stream;1":
    {
      createInstance: function()
      {
        return new FakeOutputStream();
      }
    },
    "@mozilla.org/timer;1":
    {
      createInstance: function()
      {
        return new FakeTimer();
      }
    }
  },
  results: {},
  utils: {
    reportError: reportError
  },
  manager: null,
  ID: function()
  {
    return null;
  },
  Constructor: function()
  {
    // This method is only used to get XMLHttpRequest constructor
    return XMLHttpRequest;
  }
};
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cc["@mozilla.org/intl/converter-input-stream;1"] = Cc["@mozilla.org/network/file-input-stream;1"];
Cc["@mozilla.org/network/safe-file-output-stream;1"] = Cc["@mozilla.org/intl/converter-output-stream;1"] = Cc["@mozilla.org/network/file-output-stream;1"];

var Prefs =
{
  patternsfile: "patterns.ini",
  patternsbackups: 5,
  patternsbackupinterval: 24,
  data_directory: "",
  savestats: false,
  privateBrowsing: false,
  subscriptions_fallbackerrors: 5,
  subscriptions_fallbackurl: "https://adblockplus.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&channelStatus=%CHANNELSTATUS%&responseStatus=%RESPONSESTATUS%",
  addListener: function() {}
};

var Utils =
{
  systemPrincipal: null,
  getString: function(id)
  {
    return id;
  },
  getLineBreak: function()
  {
    return "\n";
  },
  resolveFilePath: function(path)
  {
    return new FakeFile(path);
  },
  ioService:
  {
    newURI: function(uri)
    {
      if (!uri.length || uri[0] == "~")
        throw new Error("Invalid URI");

      /^([^:\/]*)/.test(uri);
      var scheme = RegExp.$1.toLowerCase();

      return {scheme: scheme, spec: uri};
    }
  },
  observerService:
  {
    addObserver: function() {},
    removeObserver: function() {}
  },
  chromeRegistry:
  {
    convertChromeURL: function() {}
  },
  runAsync: function(callback, thisPtr)
  {
    var params = Array.prototype.slice.call(arguments, 2);
    window.setTimeout(function()
    {
      callback.apply(thisPtr, params);
    }, 0);
  },
  addonVersion: "2.0.3", // Hardcoded for now
  get appLocale()
  {
    var locale = chrome.i18n.getMessage("@@ui_locale").replace(/_/g, "-");
    Utils.__defineGetter__("appLocale", function() {return locale});
    return Utils.appLocale;
  },
  generateChecksum: function(lines)
  {
    // We cannot calculate MD5 checksums yet :-(
    return null;
  },
  makeURI: function(url)
  {
    return Utils.ioService.newURI(url);
  },
  checkLocalePrefixMatch: function(prefixes)
  {
    if (!prefixes)
      return null;

    var list = prefixes.split(",");
    for (var i = 0; i < list.length; i++)
      if (new RegExp("^" + list[i] + "\\b").test(Utils.appLocale))
        return list[i];

    return null;
  },
  versionComparator:
  {
    compare: function(v1, v2)
    {
      function compareParts(p1, p2)
      {
        if (p1 < p2)
          return -1;
        if (p1 < p2)
          return 1;
        return 0;
      }

      var parts1 = v1.split(".");
      var parts2 = v2.split(".");
      for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        var result = compareParts(parts1[i], parts2[i]);
        if (result !== 0)
          return result;
      }
      return 0;
    }
  }
};

var XPCOMUtils =
{
  generateQI: function() {}
};

var fileActions = null;
function pushFileAction(action)
{
  var fs = null;
  if (fileActions == null)
  {
    fileActions = [];
    // We request a gigabyte of space, just in case
    (window.requestFileSystem || window.webkitRequestFileSystem)(window.PERSISTENT, 1024*1024*1024, function(aFs)
    {
      fs = aFs;
      processNextAction();
    }, function(e)
    {
      reportError("File system error " + e.code);
      fileActions = null;
    });
  }
  fileActions.push(action);

  function processNextAction()
  {
    if (fileActions.length == 0)
    {
      fileActions = null;
      return;
    }

    var action = fileActions.shift();
    var path = action[1];
    fs.root.getFile(path, {create: true}, function(fileEntry)
    {
      switch (action[0])
      {
        case "write":
          var blob = action[2];
          fileEntry.createWriter(function(writer)
          {
            writer.onwriteend = function()
            {
              if (writer.error)
                reportError("File system error " + writer.error.code);
              processNextAction();
            };
            writer.write(blob);
          }, errorCallback);
          break;
        case "remove":
          fileEntry.remove(function()
          {
            if (path in files)
              delete files[path];
            processNextAction();
          }, errorCallback);
          break;
        case "rename":
          var newPath = action[2];
          fileEntry.moveTo(fs.root, newPath, function()
          {
            if (path in files)
            {
              files[newPath] = files[path];
              delete files[path];
            }
            processNextAction();
          }, errorCallback);
          break;
        default:
          errorCallback({code: "unknown action"});
          break;
      }
    }, errorCallback)
  }

  function errorCallback(e)
  {
    reportError("File system error: " + e.code);
    processNextAction();
  }
}

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
  exists: function()
  {
    return this.path in files && files[this.path].exists;
  },
  remove: function()
  {
    pushFileAction(["remove", this.path]);
  },
  moveTo: function(parent, newPath)
  {
    pushFileAction(["rename", this.path, newPath]);
  },
  get lastModifiedTime()
  {
    return this.path in files ? files[this.path].lastModified : 0;
  },
  get parent()
  {
    return {create: function() {}};
  },
  normalize: function() {}
};

function FakeInputStream()
{
}
FakeInputStream.prototype =
{
  lines: null,
  currentIndex: 0,

  init: function(file)
  {
    if (file instanceof FakeInputStream)
      this.lines = file.lines;
    else
      this.lines = (file.path in files && files[file.path].data ? files[file.path].data.split(/\n/) : []);
  },
  readLine: function(line)
  {
    if (this.currentIndex < this.lines.length)
      line.value = this.lines[this.currentIndex];
    this.currentIndex++;
    return (this.currentIndex < this.lines.length);
  },
  close: function() {},
  QueryInterface: function()
  {
    return this;
  }
};

function FakeOutputStream()
{
}
FakeOutputStream.prototype =
{
  file: null,
  buffer: null,

  init: function(file)
  {
    if (file instanceof FakeOutputStream)
    {
      this.file = file.file;
      this.buffer = file.buffer;
    }
    else
    {
      this.file = file;
      this.buffer = new (window.BlobBuilder || window.WebKitBlobBuilder);
    }

    if (this.file.path == "cache.js")
      throw "Cache writing not supported";
  },
  writeString: function(string)
  {
    this.buffer.append(string);
  },
  finish: function()
  {
    pushFileAction(["write", this.file.path, this.buffer.getBlob("text/plain")]);
  },
  flush: function() {},
  QueryInterface: function()
  {
    return this;
  }
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
        reportError(e);
      }
      me.scheduleTimeout();
    }, this.delay);
  }
};

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
