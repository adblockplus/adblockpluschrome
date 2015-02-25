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

const keyPrefix = "file:";

function fileToKey(file)
{
  return keyPrefix + (file instanceof FakeFile ? file.path : file.spec);
}

function loadFile(file, successCallback, errorCallback)
{
  let key = fileToKey(file);

  ext.storage.get([key], function(items)
  {
    let entry = items[key];

    if (entry)
      successCallback(entry);
    else
      errorCallback(new Error("File doesn't exist"));
  });
}

function saveFile(file, data, callback)
{
  ext.storage.set(
    fileToKey(file),
    {
      content: data,
      lastModified: Date.now()
    },
    callback
  );
}

exports.IO =
{
  resolveFilePath: function(path)
  {
    return new FakeFile(path);
  },

  readFromFile: function(file, listener, callback)
  {
    runWhenMigrated(function()
    {
      function onLoaded(entry)
      {
        for (let line of entry.content)
          listener.process(line);

        listener.process(null);
        callback(null);
      }

      loadFile(file, onLoaded, callback);
    });
  },

  writeToFile: function(file, data, callback)
  {
    runWhenMigrated(function()
    {
      saveFile(file, data, callback);
    });
  },

  copyFile: function(fromFile, toFile, callback)
  {
    runWhenMigrated(function()
    {
      function onLoaded(entry)
      {
        saveFile(toFile, entry.content, callback);
      }

      loadFile(fromFile, onLoaded, callback);
    });
  },

  renameFile: function(fromFile, newName, callback)
  {
    runWhenMigrated(function()
    {
      function onLoaded()
      {
        ext.storage.remove(fileToKey(fromFile), function()
        {
          ext.storage.set(keyPrefix + newName, entry, callback);
        });
      }

      loadFile(fromFile, onLoaded, callback);
    });
  },

  removeFile: function(file, callback)
  {
    runWhenMigrated(function()
    {
      ext.storage.remove(fileToKey(file), callback);
    });
  },

  statFile: function(file, callback)
  {
    runWhenMigrated(function()
    {
      function onLoaded(entry)
      {
        callback(null, {
          exists: true,
          lastModified: entry.lastModified
        });
      }

      loadFile(file, onLoaded, callback);
    });
  }
};

// Migrate files for users updating from old versions.
// Defer IO operations until migration is complete.
// TODO: Remove the migration code after a few releases.
let migrated = false;
let deferred = [];

function runWhenMigrated(callback)
{
  if (migrated)
    callback();
  else
    deferred.push(callback);
}

ext.storage.migrateFiles(function()
{
  migrated = true;

  while (deferred.length > 0)
    deferred.shift()();
});
