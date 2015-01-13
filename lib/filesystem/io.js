/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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
// No direct file system access, using FileSystem API
//

var IO = exports.IO =
{
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

  readFromFile: function(file, listener, callback, timeLineID)
  {
    this._getFileEntry(file, false, function(fs, fileEntry)
    {
      fileEntry.file(function(file)
      {
        if (file.size == 0)
        {
          callback("File is empty");
          return;
        }

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

  writeToFile: function(file, data, callback, timeLineID)
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
        executeWriteOperation(writer.write.bind(writer, blob), function()
        {
          executeWriteOperation(writer.truncate.bind(writer, writer.position), callback.bind(null, null));
        });
      }.bind(this), callback);
    }.bind(this), callback);
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
    // This needs to use Utils.runAsync(), otherwise FilterStorage might
    // initialize too early - see #337.
    require("utils").Utils.runAsync(function() {
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
    }.bind(this));
  }
};
