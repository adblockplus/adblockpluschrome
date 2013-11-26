/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2013 Eyeo GmbH
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
// No direct file system access, using WebSQL API
//

var IO = exports.IO =
{
  _db: null,
  lineBreak: "\n",

  _transaction: function(callback)
  {
    var dbCreated = false;
    if (!this._db)
      this._db = openDatabase("adblockplus", "1.0", "", 102400, function() { dbCreated = true; });

    this._db.transaction(function(tx)
    {
      if (dbCreated)
        tx.executeSql("CREATE TABLE files (path unique, last_modified, content)");

      callback(tx);
    });
  },
  _getFilePath: function(file)
  {
    if (file instanceof FakeFile)
      return file.path;
    if ("spec" in file)
      return file.spec;

    throw new Error("Unexpected file type");
  },
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
      var Utils = require("utils").Utils;
      Utils.runAsync(function()
      {
        if (localStorage.currentVersion)
          seenDataCorruption = true;
        callback(null)
      });
      return;
    }

    var path = this._getFilePath(file);
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "SELECT content FROM files WHERE path = ?",
        [path],
        function(tx, results)
        {
          if (results.rows.length == 0)
          {
            runAsync(callback, null, new Error("File doesn't exist"));
            return;
          }

          var lines = results.rows.item(0).content.split(/[\r\n]+/);
          runAsync(function()
          {
            for (var i = 0; i < lines.length; i++)
              listener.process(lines[i]);
            listener.process(null);
            callback(null);
          });
        }
      );
    });
  },
  writeToFile: function(file, encode, data, callback, timeLineID)
  {
    var path = this._getFilePath(file);
    var lnbr = this.lineBreak;
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "INSERT OR REPLACE INTO files VALUES (?, ?, ?)",
        [path, Date.now(), data.join(lnbr) + lnbr],
        function() { runAsync(callback, null, null); }
      );
    });
  },
  copyFile: function(fromFile, toFile, callback)
  {
    var fromPath = this._getFilePath(fromFile);
    var toPath = this._getFilePath(toFile);
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "INSERT OR REPLACE INTO files SELECT ?, ?, content FROM files WHERE path = ?",
        [toPath, Date.now(), fromPath],
        function(tx, results)
        {
          if (results.rowsAffected == 0)
            runAsync(callback, null, new Error("File doesn't exist"));
          else
            runAsync(callback, null, null);
        }
      );
    });
  },
  renameFile: function(fromFile, newName, callback)
  {
    var path = this._getFilePath(fromFile);
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "UPDATE files SET path = ? WHERE path = ?",
        [newName, path],
        function(tx, results)
        {
          if (results.rowsAffected == 0)
            runAsync(callback, null, new Error("File doesn't exist"));
          else
            runAsync(callback, null, null);
        }
      );
    });
  },
  removeFile: function(file, callback)
  {
    var path = this._getFilePath(file);
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "DELETE FROM files WHERE path = ?",
        [path],
        function() { runAsync(callback, null, null); }
      );
    });
  },
  statFile: function(file, callback)
  {
    var path = this._getFilePath(file);
    var runAsync = require("utils").Utils.runAsync;

    this._transaction(function(tx)
    {
      tx.executeSql(
        "SELECT last_modified FROM files WHERE path = ?",
        [path],
        function(tx, results)
        {
          if (results.rows.length == 0)
            runAsync(callback, null, null, {
              exists: false,
              isDirectory: false,
              isFile: false,
              lastModified: 0
            });
          else
            runAsync(callback, null, null, {
              exists: true,
              isDirectory: false,
              isFile: true,
              lastModified: results.rows.item(0).last_modified
            });
        }
      );
    });
  }
};
