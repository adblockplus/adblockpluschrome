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

/* eslint-env mocha */

"use strict";

const FIREFOX_VERSION = "57.0";

const path = require("path");
const assert = require("assert");
const webdriver = require("selenium-webdriver");
const {By, until} = webdriver;
const firefox = require("selenium-webdriver/firefox");
const {Command} = require("selenium-webdriver/lib/command");
const {ensureFirefox} = require("../adblockpluscore/test/runners/" +
                                "firefox_download");

describe("Firefox", function()
{
  this.timeout(0);

  let driver;
  let origin;

  before(() =>
    ensureFirefox(FIREFOX_VERSION).then(firefoxPath =>
    {
      let binary = new firefox.Binary(firefoxPath);
      binary.addArguments("-headless");

      driver = new webdriver.Builder()
        .forBrowser("firefox")
        .setFirefoxOptions(new firefox.Options().setBinary(binary))
        .build();

      let devenv = "./devenv.gecko";
      let cmd = new Command("moz-install-web-ext")
        .setParameter("path", path.resolve(devenv))
        .setParameter("temporary", true);

      driver.getExecutor().defineCommand(
        cmd.getName(), "POST",
        "/session/:sessionId/moz/addon/install"
      );
      driver.schedule(cmd, `installWebExt(${devenv})`);

      return driver.wait(() =>
        driver.getAllWindowHandles().then(handles => handles[1])
      ).then(handle =>
        driver.switchTo().window(handle)
      ).then(() =>
        driver.executeScript("return location.origin;")
      ).then(result => { origin = result; });
    })
  );

  it("qunit", () =>
    driver.navigate().to(origin + "/qunit/index.html").then(() =>
      // Wait for qunit-results to be present
      driver.wait(until.elementLocated(By.id("qunit-testresult")))
    ).then(() =>
      // Wait for tests to finish
      driver.wait(() =>
        driver.findElement(By.id("qunit-testresult"))
          .getAttribute("innerHTML").then(data =>
             data.includes("Tests completed")))
    ).then(() => Promise.all([[true, ".pass"], [false, ".fail"]].map(
      ([success, sel]) => driver.findElements(
        By.css(`#qunit-tests ${sel} .test-name`)
      ).then(elements => Promise.all(elements.map(elem =>
        elem.getAttribute("textContent").then(data => assert.ok(success, data))
      )))
    )))
  );

  after(() => driver.quit());
});
