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


// values from the DefaultConfig
// https://github.com/localForage/localForage/blob/2cdbd74/src/localforage.js#L42-L51
const localForageDbConfig = {
  dbName: "localforage",
  storeName: "keyvaluepairs",
  version: 2
};

const dbConfig = {
  dbName: "adblockplus",
  storeName: "file",
  keyPath: "fileName",
  version: 1
};

let db = openDB(dbConfig);
let migrationDone = migrateFiles();

const keyPrefix = "file:";

function openDB({dbName, storeName, version, keyPath})
{
  return new Promise((resolve, reject) =>
  {
    let req = indexedDB.open(dbName, version);

    req.onsuccess = event =>
    {
      return resolve(event.currentTarget.result);
    };

    req.onerror = reject;

    req.onupgradeneeded = event =>
    {
      event
      .currentTarget
      .result
      .createObjectStore(storeName,
        {
          keyPath,
          autoIncrement: true
        });
    };
  });
}

/**
 * Handles migrating all files from localforage db
 * used in the previous implementation by the localForage library
 * to the new adblockplus db that we use as a replacement
 * @return {Promise}
 *    Promise to be resolved or rejected once the operation is completed
 */
function migrateFiles()
{
  return openDB(localForageDbConfig)
    .then(localForageDb =>
      getAllFiles(localForageDb, localForageDbConfig.storeName)
        .then(files =>
          db.then(dbInstance =>
            Promise.all(files.map(file =>
              saveFile(file, dbInstance, dbConfig.storeName)))))
        .then(() =>
          clearObjectStore(localForageDb, localForageDbConfig.storeName))
    );
}

function getAllFiles(dbInstance, storeName)
{
  return new Promise((resolve, reject) =>
  {
    // edge doesn't currently support getAll method on IDBObjectStore interface
    // so a cursor is used to iterate over all objects from the store
    let transaction = dbInstance
      .transaction([storeName], IDBTransaction.READ_ONLY);

    let store = transaction.objectStore(storeName);
    let cursorReq = store.openCursor();
    let filesData = [];

    transaction.oncomplete = event =>
    {
      resolve(filesData);
    };

    cursorReq.onsuccess = event =>
    {
      let cursor = event.currentTarget.result;
      if (cursor)
      {
        let {value} = cursor;

        filesData.push({
          fileName: cursor.key,
          content: value.content,
          lastModified: value.lastModified
        });
        cursor.continue();
      }
    };

    cursorReq.onerror = reject;
  });
}

function clearObjectStore(dbInstance, storeName)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance, storeName);
    let req = store.clear();

    req.onsuccess = resolve;
    req.onerror = reject;
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

function getObjectStore(dbInstance, storeName)
{
  return dbInstance
    .transaction([storeName], IDBTransaction.READ_WRITE)
    .objectStore(storeName);
}

function reestablishConnection(dbInstance, retries = 10)
{
  dbInstance.close();
  db = openDB(dbConfig);

  return db.catch(err =>
  {
    if (!retries)
      throw err;

    return reestablishConnection(dbInstance, --retries);
  });
}

function getFile(fileName, dbInstance, storeName)
{
  return getFromIndexedDB(fileToKey(fileName), dbInstance, storeName)
    .then(indexedDBResult =>
    {
      if (!indexedDBResult)
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
              dbInstance,
              storeName).then(() => backupData)
          );
      }
      return indexedDBResult;
    });
}

function getFromIndexedDB(fileName, dbInstance, storeName)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance, storeName);
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

function saveFile(data, dbInstance, storeName)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance, storeName);
    let req = store.put(data);

    req.onsuccess = resolve;
    req.onerror = event => reject(event.target.error);
  })
  .catch(error =>
  {
    if (error.name == "UnknownError")
    {
      return reestablishConnection(dbInstance).then(newDbInstance =>
        saveFile(data, newDbInstance, storeName)
      );
    }
  });
}

function deleteFile(fileName, dbInstance, storeName)
{
  return new Promise((resolve, reject) =>
  {
    let store = getObjectStore(dbInstance, storeName);
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
    return migrationDone
      .then(() =>
        db.then(dbInstance =>
          saveFile(
            formatFile(fileName, data), dbInstance, dbConfig.storeName)));
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
    return migrationDone
      .then(() =>
        db.then(dbInstance =>
          getFile(fileName, dbInstance, dbConfig.storeName))
          .then(entry =>
          {
            for (let line of entry.content)
              listener(line);
          }));
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
    return migrationDone
      .then(() =>
        db.then(dbInstance =>
          getFile(fileName, dbInstance, dbConfig.storeName))
        .then(entry =>
        {
          return {
            exists: true,
            lastModified: entry.lastModified
          };
        }))
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
    return migrationDone
      .then(() =>
        db.then(dbInstance =>
          getFile(fromFile, dbInstance, dbConfig.storeName)
          .then(fileData =>
            saveFile(
              {
                fileName: fileToKey(newName),
                content: fileData.content,
                lastModified: fileData.lastModified
              },
              dbInstance,
              dbConfig.storeName))
          .then(() => deleteFile(fromFile, dbInstance, dbConfig.storeName))));
  }
};

