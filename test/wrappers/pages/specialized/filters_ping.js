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
const {closeWindow} = require("../utils");

exports.isExcluded = function(browser)
{
  // ping test needs access to browser logs
  // https://github.com/mozilla/geckodriver/issues/284
  return browser == "Firefox";
};

exports.run = async function(driver, section, description)
{
  await section.findElement(By.css("a[href],button")).click();

  try
  {
    await driver.wait(async() =>
    {
      let logs = await driver.manage().logs().get("browser");
      let expected = "filters/ping - Failed to load resource";
      return logs.some(entry => entry.message.includes(expected));
    }, 2000, description);
  }
  finally
  {
    let handles = await driver.getAllWindowHandles();
    if (handles.length > 2)
      await closeWindow(driver, handles[2], handles[1]);
  }
};
