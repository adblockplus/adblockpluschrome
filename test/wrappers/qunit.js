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

const {By, until} = require("selenium-webdriver");
const assert = require("assert");

it("qunit", function()
{
  return this.driver.navigate().to(this.origin + "/qunit/index.html").then(() =>
    this.driver.wait(until.elementLocated(By.id("qunit-testresult")))
  ).then(elem =>
    this.driver.wait(until.elementTextContains(elem, "Tests completed"))
  ).then(() =>
    this.driver.findElements(
      By.css("#qunit-tests > .fail")
    )
  ).then(failures =>
    Promise.all(
      failures.map(failure =>
        failure.findElements(
          By.css(".module-name, .test-name, .fail > .test-message")
        ).then(messages =>
          Promise.all(messages.map(e => e.getText()))
        ).then(messages => messages.join(", "))
      )
    ).then(failureDescriptions =>
    {
      if (failureDescriptions.length > 0)
      {
        failureDescriptions.unshift("");
        assert.fail(failureDescriptions.join("\n      - "));
      }
    })
  );
});
