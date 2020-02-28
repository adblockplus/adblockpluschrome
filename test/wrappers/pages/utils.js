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

let closeWindow = exports.closeWindow = async function(driver, goTo, returnTo,
                                                       callback)
{
  try
  {
    await driver.switchTo().window(goTo);
    try
    {
      if (callback)
        await callback();
    }
    finally
    {
      await driver.close();
    }
  }
  finally
  {
    await driver.switchTo().window(returnTo);
  }
};

exports.checkPopup = async function(driver, section, expected, description)
{
  await section.findElement(By.css("a[href],button")).click();
  await driver.sleep(500);

  let handles = [];
  try
  {
    await driver.wait(async() =>
    {
      handles = await driver.getAllWindowHandles();
      return (handles.length > 2) == expected;
    }, 2000, description);
  }
  finally
  {
    if (handles.length > 2)
      await closeWindow(driver, handles[2], handles[1]);
  }
};
