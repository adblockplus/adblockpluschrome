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
import {checkLastError} from "../misc/utils.mjs";

const {By, until} = webdriver;

export default () =>
{
  it("qunit", async function()
  {
    await this.driver.navigate().to(this.extensionOrigin + "/qunit/index.html");
    let elem = await this.driver.wait(
      until.elementLocated(By.id("qunit-testresult"))
    );
    await this.driver.wait(until.elementTextContains(elem, "tests completed"));

    let failures = await this.driver.findElements(
      By.css("#qunit-tests > .fail")
    );
    let failureDescriptions = await Promise.all(failures.map(async failure =>
    {
      let messages = await failure.findElements(
        By.css(".module-name, .test-name, .fail > .test-message")
      );
      return (await Promise.all(messages.map(e => e.getText()))).join(", ");
    }));

    if (failureDescriptions.length > 0)
    {
      failureDescriptions.unshift("");
      assert.fail(failureDescriptions.join("\n      - "));
    }

    await checkLastError(this.driver, this.extensionHandle);
  });
};
