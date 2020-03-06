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

const {By} = require("selenium-webdriver");

function clickButtonOrLink(element)
{
  return element.findElement(By.css("a[href],button")).click();
}

exports["filters/ping"] = {
  // ping test needs access to browser logs
  // https://github.com/mozilla/geckodriver/issues/284
  excludedBrowsers: ["Firefox"],

  async run(driver, testCase)
  {
    await clickButtonOrLink(testCase.element);
    await driver.wait(async() =>
    {
      let logs = await driver.manage().logs().get("browser");
      let expected = "filters/ping - Failed to load resource";
      return logs.some(entry => entry.message.includes(expected));
    }, 2000, "request wasn't blocked");
  }
};

async function getNumberOfHandles(driver)
{
  return (await driver.getAllWindowHandles()).length;
}

async function testPopup(driver, element, expected, message)
{
  let nHandles = await getNumberOfHandles(driver);
  await clickButtonOrLink(element);
  await driver.sleep(500);
  await driver.wait(
    async() => ((await getNumberOfHandles(driver)) > nHandles) == expected,
    2000, message
  );
}

exports["filters/popup"] = {
  run(driver, testCase)
  {
    return testPopup(driver, testCase.element, false, "popup wasn't closed");
  }
};

exports["exceptions/popup"] = {
  run(driver, testCase)
  {
    return testPopup(driver, testCase.element, true, "no popup found");
  }
};
