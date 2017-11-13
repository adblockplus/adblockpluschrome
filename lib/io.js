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

const keyPrefix = "file:";

function fileToKey(fileName)
{
  return keyPrefix + fileName;
}

function loadFile(fileName)
{
  return new Promise((resolve, reject) =>
  {
    localforage.getItem(fileToKey(fileName), (err, value) =>
    {
      if (err || value == null)
        reject({type: "NoSuchFile"});
      else
        resolve(value);
    });
  });
}

function saveFile(fileName, data)
{
  let key = fileToKey(fileName);
  return localforage.setItem(key, {
    content: Array.from(data),
    lastModified: Date.now()
  });
}

function removeFile(fileName)
{
  return new Promise((resolve, reject) =>
  {
    ext.storage.remove(fileToKey(fileName), () =>
    {
      if (browser.runtime.lastError)
        reject(browser.runtime.lastError.message);
      else
        resolve();
    });
  });
}

exports.IO =
{
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
    return loadFile(fileName).then(entry =>
    {
      for (let line of entry.content)
        listener(line);
    });
  },

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
    return saveFile(fileName, data);
  },

  /**
   * Copies a file.
   * @param {string} fromFile
   *    Name of the file to be copied
   * @param {string} toFile
   *    Name of the file to be written, will be overwritten if exists
   * @return {Promise}
   *    Promise to be resolved or rejected once the operation is completed
   */
  copyFile(fromFile, toFile)
  {
    return loadFile(fromFile).then(entry => saveFile(toFile, entry.content));
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
    return loadFile(fromFile).then(entry =>
    {
      return saveFile(fileToKey(newName), entry);
    }).then(() => removeFile(fromFile));
  },

  /**
   * Removes a file.
   * @param {string} fileName
   *    Name of the file to be removed
   * @return {Promise}
   *    Promise to be resolved or rejected once the operation is completed
   */
  removeFile(fileName)
  {
    return removeFile(fileName);
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
    return loadFile(fileName).then(entry =>
    {
      return {
        exists: true,
        lastModified: entry.lastModified
      };
    }).catch(error =>
    {
      if (error.type == "NoSuchFile")
        return {exists: false};
      throw error;
    });
  }
};
