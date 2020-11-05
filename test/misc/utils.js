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

import assert from "assert";
import fs from "fs";
import path from "path";
import url from "url";
import {writeScreenshotAndThrow} from "./screenshots.js";

/*
 * Standard-compliant polyfill for WebDriver#executeScript,
 * working around limitations of ChromeDriver <77,
 * enabling scripts to return a promise.
 */
export async function executeScriptCompliant(driver, script, ...args)
{
  let [isError, value] = await driver.executeAsyncScript(`
    let promise = (async function() { ${script} }).apply(null, arguments[0]);
    let callback = arguments[arguments.length - 1];
    promise.then(
      res => callback([false, res]),
      err => callback([true, err instanceof Error ? err.message : err])
    );`, args);

  if (isError)
    throw new Error(value);
  return value;
}

export async function checkLastError(driver, handle)
{
  await driver.switchTo().window(handle);

  let error = await executeScriptCompliant(
    driver,
    "return browser.runtime.sendMessage({type: \"debug.getLastError\"});"
  );
  if (error != null)
    assert.fail("Unhandled error in background page: " + error);
}

export async function getBrowserInfo(driver)
{
  let caps = await driver.getCapabilities();
  return [caps.getBrowserName(),
          caps.getBrowserVersion() || caps.get("version")];
}

export async function runWithHandle(driver, handle, test, callback)
{
  let currentHandle = await driver.getWindowHandle();
  await driver.switchTo().window(handle);
  try
  {
    return await callback();
  }
  catch (err)
  {
    let [browserName, browserVersion] = await getBrowserInfo(driver);
    await writeScreenshotAndThrow(
      {driver, browserName, browserVersion, test},
      err
    );
  }
  finally
  {
    await driver.switchTo().window(currentHandle);
  }
}

export async function loadModules(dirname)
{
  let modules = [];
  for (let dirent of await fs.promises.readdir(dirname, {withFileTypes: true}))
  {
    let filename = path.resolve(dirname, dirent.name);
    let basename = path.parse(dirent.name).name;
    if (dirent.isDirectory())
      filename = path.join(filename, "index.js");
    modules.push([await import(url.pathToFileURL(filename)), basename]);
  }
  return modules;
}
