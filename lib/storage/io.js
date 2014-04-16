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

//
// No direct file system access, using LocalStorage API
//

var IO = exports.IO =
{
  _getFilePath: function(file)
  {
    if (file instanceof FakeFile)
      return file.path;
    else if ("spec" in file)
      return file.spec;

    throw new Error("Unexpected file type");
  },

  _setFileContents: function(path, contents, lastModified)
  {
    ext.storage[path] = contents;
    ext.storage[path + "/lastModified"] = lastModified || 0;
  },

  lineBreak: "\n",

  resolveFilePath: function(path)
  {
    return new FakeFile(path);
  },

  readFromFile: function(file, listener, callback, timeLineID)
  {
    var Utils = require("utils").Utils;
    Utils.runAsync(function()
    {
      var path = this._getFilePath(file);
      if (!(path in ext.storage))
      {
        callback(new Error("File doesn't exist"))
        return;
      }

      var lines = ext.storage[path].split(/[\r\n]+/);
      for (var i = 0; i < lines.length; i++)
        listener.process(lines[i]);
      listener.process(null);
      callback(null);
    }.bind(this));
  },

  writeToFile: function(file, data, callback, timeLineID)
  {
    var path = this._getFilePath(file);
    this._setFileContents(path, data.join(this.lineBreak) + this.lineBreak, Date.now());

    var Utils = require("utils").Utils;
    Utils.runAsync(callback, null, null);
  },

  copyFile: function(fromFile, toFile, callback)
  {
    // Simply combine read and write operations
    var data = [];
    this.readFromFile(fromFile, {
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
        this.writeToFile(toFile, data, callback);
    }.bind(this));
  },

  renameFile: function(fromFile, newName, callback)
  {
    var path = this._getFilePath(fromFile);
    if (!(path in ext.storage))
    {
      callback(new Error("File doesn't exist"))
      return;
    }

    this._setFileContents(newName, ext.storage[path], ext.storage[path + "/lastModified"]);
    this.removeFile(fromFile, callback);
  },

  removeFile: function(file, callback)
  {
    var path = this._getFilePath(file);
    delete ext.storage[path];
    delete ext.storage[path + "/lastModified"];
    callback(null);
  },

  statFile: function(file, callback)
  {
    var path = this._getFilePath(file);

    // This needs to use Utils.runAsync(), otherwise FilterStorage might
    // initialize too early - see #337.
    require("utils").Utils.runAsync(callback.bind(null, null, {
      exists: path in ext.storage,
      isDirectory: false,
      isFile: true,
      lastModified: parseInt(ext.storage[path + "/lastModified"], 10) || 0
    }));
  }
};
