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


const dbName = "adblockplus";
const storeName = "file";
const keyPath = "fileName";
const version = 1;
const keyPrefix = "file:";

let db = openDB();

function openDB()
{
  return new Promise((resolve, reject) =>
  {
    let req = indexedDB.open(dbName, version);

    req.onsuccess = event =>
    {
      return resolve(event.currentTarget.result);
    };

    req.onerror = event => reject(event.currentTarget.error);

    req.onupgradeneeded = event =>
    {
      let indxDB = event.currentTarget.result;

      if (!indxDB.objectStoreNames.contains(storeName))
        indxDB.createObjectStore(
          storeName,
          {
            keyPath,
            autoIncrement: true
          }
        );
    };
  });
}

function fileToKey(fileName)
{
  return keyPrefix + fileName;
}

function formatFile(name, data)
{
  return {
    fileName: fileToKey(name),
    content: Array.from(data),
    lastModified: Date.now()
  };
}

function getObjectStore(dbInstance)
{
  return dbInstance
    .transaction([storeName], "readwrite")
    .objectStore(storeName);
}

function reestablishConnection(dbInstance, retries = 10)
{
  dbInstance.close();
  db = openDB();

  return db.catch(err =>
  {
    if (!retries)
      throw err;

    return reestablishConnection(dbInstance, --retries);
  });
}

function getFile(fileName, dbInstance)
{
  return getFromIndexedDB(fileToKey(fileName), dbInstance)
    .then(indexedDBResult =>
    {
      if (!indexedDBResult)
      {
        // If we failed to read the main patterns.ini file, it could be that the
        // IndexedDB database got trashed by Edge. Lets restore our backup from
        // local storage. ("readBackup" is used by the unit tests.)
        if (fileName == "patterns.ini" || fileName == "readBackup")
        {
          const {IndexedDBBackup} = require("./indexedDBBackup");

          return IndexedDBBackup.getBackupData()
            .then(backupData =>
              saveFile(
                {
                  fileName: fileToKey(fileName),
                  content: backupData.content,
                  lastModified: backupData.lastModified
                },
                dbInstance
              ).then(() => backupData)
            );
        }
        return Promise.reject({type: "NoSuchFile"});
      }
      return indexedDBResult;
    });
}

function getFromIndexedDB(fileName, dbInstance)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance);
    let req = store.get(fileName);

    req.onsuccess = event => resolve(event.currentTarget.result);
    req.onerror = event => reject(event.target.error);
  })
  .catch(error =>
  {
    if (error.name == "UnknownError")
      return reestablishConnection(dbInstance).then(() => undefined);
  });
}

function saveFile(data, dbInstance)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance);
    let req = store.put(data);

    req.onsuccess = resolve;
    req.onerror = event => reject(event.target.error);
  })
  .catch(error =>
  {
    if (error.name == "UnknownError")
    {
      return reestablishConnection(dbInstance).then(newDbInstance =>
        saveFile(data, newDbInstance)
      );
    }
  });
}

function deleteFile(fileName, dbInstance)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance);
    let req = store.delete(fileToKey(fileName));

    req.onsuccess = resolve;
    req.onerror = event => reject(event.target.error);
  })
  .catch(error =>
  {
    if (error.name == "UnknownError")
      return reestablishConnection(dbInstance);
  });
}

// In some cases Microsoft Edge has issues with IndexedDB and any operation,
// returns "UnknownError".
// We perform this check only on startup as the backup mechanism
// can handle the writes.
function handleIndexedDBError(error)
{
  if (error.type != "NoSuchFile")
  {
    const {IndexedDBBackup} = require("./indexedDBBackup");

    // If the devtools are not open when logging an object,
    // the printed message is just the string [object Object],
    // so we workaround it by using error.toString.
    console.error("IndexedDB error:", error.toString());

    return IndexedDBBackup.getBackupData();
  }
  throw error;
}


exports.IO =
{
  /**
   * Writes text lines to a file.
   * @param {string} fileName
   *    Name of the file to be written
   * @param {Iterable.<string>} data
   *    An array-like or iterable object containing the lines (without line
   *    endings)
   * @return {Promise}
   *    Promise to be resolved or rejected once the operation is completed
   */
  writeToFile(fileName, data)
  {
    return db.then(dbInstance =>
        saveFile(formatFile(fileName, data), dbInstance));
  },

  /**
   * Reads text lines from a file.
   * @param {string} fileName
   *    Name of the file to be read
   * @param {TextSink} listener
   *    Function that will be called for each line in the file
   * @return {Promise}
   *    Promise to be resolved or rejected once the operation is completed
   */
  readFromFile(fileName, listener)
  {
    return db.then(dbInstance => getFile(fileName, dbInstance))
      .catch(handleIndexedDBError)
      .then(entry =>
      {
        for (let line of entry.content)
          listener(line);
      });
  },

  /**
   * Retrieves file metadata.
   * @param {string} fileName
   *    Name of the file to be looked up
   * @return {Promise.<StatData>}
   *    Promise to be resolved with file metadata once the operation is
   *    completed
   */
  statFile(fileName)
  {
    return db.then(dbInstance => getFile(fileName, dbInstance))
      .catch(handleIndexedDBError)
      .then(entry =>
      {
        return {
          exists: true,
          lastModified: entry.lastModified
        };
      })
      .catch(error =>
      {
        if (error.type == "NoSuchFile")
          return {exists: false};
        throw error;
      });
  },

  /**
   * Renames a file.
   * @param {string} fromFile
   *    Name of the file to be renamed
   * @param {string} newName
   *    New file name, will be overwritten if exists
   * @return {Promise}
   *    Promise to be resolved or rejected once the operation is completed
   */
  renameFile(fromFile, newName)
  {
    return db
      .then(dbInstance => getFile(fromFile, dbInstance)
        .then(fileData => saveFile(
          {
            fileName: fileToKey(newName),
            content: fileData.content,
            lastModified: fileData.lastModified
          },
          dbInstance
        ))
        .then(() => deleteFile(fromFile, dbInstance))
      );
  }
};
