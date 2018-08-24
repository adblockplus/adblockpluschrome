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

const FIREFOX_VERSION = "57.0";

const path = require("path");
const webdriver = require("selenium-webdriver");
const {By, until} = webdriver;
const firefox = require("selenium-webdriver/firefox");
const {Command} = require("selenium-webdriver/lib/command");
const {ensureFirefox} = require("../adblockpluscore/test/runners/" +
                                "firefox_download");

function reportElements(test, driver, success)
{
  return driver.findElements(
    By.css(`#qunit-tests ${success ? ".pass" : ".fail"} .test-name`)
  ).then(elements => Promise.all(elements.map(elem =>
    elem.getAttribute("innerHTML").then(data => test.ok(success, data))
  )));
}

exports.runFirefox = function(test)
{
  // https://stackoverflow.com/a/45045036
  function installWebExt(driver, extension)
  {
    let cmd = new Command("moz-install-web-ext")
      .setParameter("path", path.resolve(extension))
      .setParameter("temporary", true);

    driver.getExecutor()
      .defineCommand(cmd.getName(), "POST",
                     "/session/:sessionId/moz/addon/install");

    return driver.schedule(cmd, `installWebExt(${extension})`);
  }

  ensureFirefox(FIREFOX_VERSION).then(firefoxPath =>
  {
    let binary = new firefox.Binary(firefoxPath);

    binary.addArguments("-headless");

    let options = new firefox.Options()
      .setBinary(binary);

    let driver = new webdriver.Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(options)
      .build();

    installWebExt(driver, "./devenv.gecko");

    driver.wait(() =>
      // Wait for the firstrun-page to be loaded
      driver.getAllWindowHandles().then(handles =>
      {
        if (handles.length > 1)
        {
          driver.switchTo().window(handles[1]);
          return true;
        }
        return false;
      })
    ).then(() =>
      // Navigate to the qunit index
      driver.executeScript("location.href = \"qunit/index.html\";")
    ).then(() =>
      // Wait for qunit-results to be present
      driver.wait(until.elementLocated(By.id("qunit-testresult")))
    ).then(() =>
      // Wait for tests to finish
      driver.wait(() =>
        driver.findElement(By.id("qunit-testresult"))
          .getAttribute("innerHTML").then(data =>
             data.includes("Tests completed")))
    ).then(() => Promise.all([
      reportElements(test, driver, true),
      reportElements(test, driver, false)
    ])).then(() =>
    {
      driver.quit();
      test.done();
    }, err =>
      driver.quit().then(() =>
      {
        throw err;
      })
    );
  });
};
