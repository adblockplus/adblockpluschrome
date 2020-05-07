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

const assert = require("assert");
const request = require("request");

let download = exports.download = function(url)
{
  return new Promise((resolve, reject) =>
  {
    request(url, (err, res, body) =>
    {
      if (err)
        reject(err);
      else if (res.statusCode != 200)
        reject(new Error("Request failed with status code " + res.statusCode));
      else
        resolve(body);
    });
  });
};

exports.downloadJSON = async function(url)
{
  return JSON.parse(await download(url));
};

exports.checkLastError = async function(driver, handle)
{
  await driver.switchTo().window(handle);

  let error = await driver.executeAsyncScript(`
    let callback = arguments[arguments.length - 1];
    browser.runtime.sendMessage({type: "debug.getLastError"}).then(callback);`);

  if (error != null)
    assert.fail("Unhandled error in background page: " + error);
};

exports.runWithHandle = async function(driver, handle, callback)
{
  let currentHandle = await driver.getWindowHandle();
  await driver.switchTo().window(handle);
  try
  {
    return await callback();
  }
  finally
  {
    await driver.switchTo().window(currentHandle);
  }
};

exports.reloadModule = function(path)
{
  delete require.cache[path];
  require(path);
};
