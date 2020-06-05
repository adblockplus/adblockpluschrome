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
const {By} = require("selenium-webdriver");
const {runWithHandle} = require("../../misc/utils");

function clickButtonOrLink(element)
{
  return element.findElement(By.css("a[href],button")).click();
}

async function checkRequestBlocked(driver, resource)
{
  await driver.wait(async() =>
  {
    let logs = await driver.manage().logs().get("browser");
    let expected =
      `${resource} - Failed to load resource: net::ERR_BLOCKED_BY_CLIENT`;
    return logs.some(entry => entry.message.includes(expected));
  }, 2000, "request wasn't blocked");
}

async function checkPing(element)
{
  let driver = element.getDriver();
  await clickButtonOrLink(element);
  await checkRequestBlocked(driver, "ping");
}

exports["filters/ping"] = {
  // ping test needs access to browser logs
  // https://github.com/mozilla/geckodriver/issues/284
  excludedBrowsers: ["Firefox"],

  run: checkPing
};

exports["exceptions/ping"] = {
  excludedBrowsers: ["Firefox"],

  async run(element)
  {
    await assert.rejects(async() => checkPing(element), /request wasn't blocked/);
  }
};

async function getNumberOfHandles(driver)
{
  return (await driver.getAllWindowHandles()).length;
}

async function checkPopup(element, extensionHandle)
{
  let driver = element.getDriver();
  let nHandles = await getNumberOfHandles(driver);
  let token = Math.floor(Math.random() * 1e8);
  await runWithHandle(driver, extensionHandle, () => driver.executeScript(`
    browser.webNavigation.onCreatedNavigationTarget.addListener(() =>
    {
      self.done${token} = true;
      if (typeof callback${token} == "function")
        callback${token}();
    });`));
  await clickButtonOrLink(element);
  await runWithHandle(driver, extensionHandle, () => driver.executeAsyncScript(`
    let callback = arguments[arguments.length - 1];
    if (self.done${token})
      callback();
    else
      self.callback${token} = callback;`));
  return await getNumberOfHandles(driver) > nHandles;
}

exports["filters/popup"] = {
  async run(element, extensionHandle)
  {
    let hasPopup = await checkPopup(element, extensionHandle);
    assert.ok(!hasPopup, "popup was closed");
  }
};

exports["exceptions/popup"] = {
  async run(element, extensionHandle)
  {
    let hasPopup = await checkPopup(element, extensionHandle);
    assert.ok(hasPopup, "popup remained open");
  }
};

exports["filters/other"] = {
  // other test needs access to browser logs
  // https://github.com/mozilla/geckodriver/issues/284
  excludedBrowsers: ["Firefox"],

  async run(element)
  {
    let driver = element.getDriver();
    await checkRequestBlocked(driver, "other/image.png");
  }
};
