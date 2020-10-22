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
import webdriver from "selenium-webdriver";
import {checkLastError} from "../misc/utils.js";
import {writeScreenshot} from "../misc/screenshots.js";

const {By, until} = webdriver;

export default () =>
{
  it("runs unit tests", async function()
  {
    await this.driver.navigate().to(this.extensionOrigin + "/tests/index.html");

    try
    {
      await this.driver.wait(
        until.elementLocated(By.css("[data-progress=\"done\"]")),
        20000,
        "Unit tests execution did not finish"
      );

      let stats = await this.driver.findElement(By.id("mocha-stats"));
      let failures =
        await stats.findElement(By.css(".failures > em")).getText();
      let failureElements =
        await this.driver.findElements(By.css(".fail > h2, .fail .error"));
      let descriptions =
        (await Promise.all(failureElements.map(e => e.getText()))).join(", ");
      assert.ok(failures == "0", `${failures} test(s) failed\n${descriptions}`);

      let passes = await stats.findElement(By.css(".passes > em")).getText();
      assert.ok(parseInt(passes, 10) > 0, "No tests were executed");
    }
    catch (e)
    {
      await writeScreenshot(this, e);
    }

    await checkLastError(this.driver, this.extensionHandle);
  });
};
