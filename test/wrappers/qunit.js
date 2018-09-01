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
    // Wait for qunit-results to be present
    this.driver.wait(until.elementLocated(By.id("qunit-testresult")))
  ).then(() =>
    // Wait for tests to finish
    this.driver.wait(() =>
      this.driver.findElement(By.id("qunit-testresult"))
        .getAttribute("innerHTML").then(data =>
           data.includes("Tests completed")))
  ).then(() => Promise.all([[true, ".pass"], [false, ".fail"]].map(
    ([success, sel]) => this.driver.findElements(
      By.css(`#qunit-tests ${sel} .test-name`)
    ).then(elements => Promise.all(elements.map(elem =>
      elem.getAttribute("textContent").then(data => assert.ok(success, data))
    )))
  )));
});
