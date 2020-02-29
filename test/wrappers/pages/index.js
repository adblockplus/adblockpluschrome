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
const fs = require("fs");
const path = require("path");
const {promisify} = require("util");
const Jimp = require("jimp");
const {By, until, error: {TimeoutError}} = require("selenium-webdriver");
const {closeWindow} = require("./utils");

const readdirAsync = promisify(fs.readdir);
const unlinkAsync = promisify(fs.unlink);

const SCREENSHOT_DIR = path.join(__dirname, "../..", "screenshots");

function normalize(input)
{
  return input.replace(/[\W]+/g, "_").toLowerCase();
}

async function removeOutdatedScreenshots(browser)
{
  let files;
  try
  {
    files = await readdirAsync(SCREENSHOT_DIR);
  }
  catch (e)
  {
    return;
  }

  for (let filename of files)
  {
    if (filename.startsWith(browser))
    {
      try
      {
        await unlinkAsync(path.join(SCREENSHOT_DIR, filename));
      }
      catch (e) {}
    }
  }
}

async function takeScreenshot(element)
{
  // It would be preferable if we could use WebElement.takeScreenshot(),
  // but it's not supported on Chrome, and produces incorrect output when
  // called repeatedly, on Firefox >=58 or when using geckodriver >=1.13.
  // So as a workaround, we scroll to the position of the element, take a
  // screenshot of the viewport and crop it to the element's size and position.
  let rect = await element.getRect();
  let result = await element.getDriver().executeScript(`
    window.scrollTo(${rect.x}, ${rect.y});
    return [window.scrollX, window.scrollY];
  `);
  let x = rect.x - result[0];
  let y = rect.y - result[1];

  let s = await element.getDriver().takeScreenshot();
  let img = await Jimp.read(Buffer.from(s, "base64"));
  return img.crop(x, y, rect.width, rect.height);
}

async function* getSections(driver)
{
  for (let element of await driver.findElements(By.css("section")))
  {
    try
    {
      yield await Promise.all([
        element.findElement(By.css("h2")),
        element.findElement(By.className("testcase-container")),
        element.findElements(By.css("pre"))
      ]);
    }
    catch (e) {}
  }
}

async function getSection(driver, index)
{
  for await (let section of getSections(driver))
  {
    if (index-- == 0)
      return section[1];
  }
}

function isExcluded(elemClass, pageTitle, testTitle, specializedTest)
{
  if (process.env.TEST_PAGES_URL && elemClass &&
      elemClass.split(/\s+/).includes("online"))
    return true;

  let browser = testTitle.replace(/\s.*$/, "");
  if (specializedTest)
    return typeof specializedTest.isExcluded == "function" &&
           specializedTest.isExcluded(browser);

  return (
    // https://issues.adblockplus.org/ticket/6917
    pageTitle == "$subdocument" && browser == "Firefox" ||
    // Chromium doesn't support Flash
    pageTitle.startsWith("$object") && browser == "Chromium" ||
    // Chromium 63 doesn't have user stylesheets (required to
    // overrule inline styles) and doesn't run content scripts
    // in dynamically written documents.
    testTitle == "Chromium (oldest)" &&
    (pageTitle == "Inline style !important" ||
     pageTitle == "Anonymous iframe document.write()")
  );
}

async function getTestCases(driver, url)
{
  await driver.navigate().to(url);
  await driver.executeScript(`
    let documents = [document];
    while (documents.length > 0)
    {
      let doc = documents.shift();
      doc.body.classList.add('expected');
      for (let i = 0; i < doc.defaultView.frames.length; i++)
      {
        try
        {
          documents.push(doc.defaultView.frames[i].document);
        }
        catch (e) {}
      }
    }
  `);

  let tests = [];
  for await (let [title, demo, filters] of getSections(driver))
  {
    tests.push(await Promise.all([
      title.getText(),
      takeScreenshot(demo),
      Promise.all(filters.map(elem => elem.getText()))
    ]));
  }

  return tests;
}

async function updateFilters(driver, origin, filters)
{
  await driver.navigate().to(origin + "/options.html");
  let error = await driver.executeAsyncScript(`
    let filters = arguments[0];
    let callback = arguments[arguments.length - 1];
    browser.runtime.sendMessage({type: "subscriptions.get",
                                 downloadable: true,
                                 special: true}).then(subs =>
      Promise.all(subs.map(subscription =>
        browser.runtime.sendMessage({type: "subscriptions.remove",
                                     url: subscription.url})
      ))
    ).then(() =>
      browser.runtime.sendMessage({type: "filters.importRaw",
                                   text: filters})
    ).then(errors => callback(errors[0]), callback);
  `, filters.join("\n"));
  if (error)
    throw error;
}

async function checkTestCase(driver, vBrowser, fileNamePrefix, section,
                             expectedScreenshot, description)
{
  let actualScreenshot = null;
  try
  {
    await driver.wait(async() =>
    {
      actualScreenshot = await takeScreenshot(section);
      let actualBitmap = actualScreenshot.bitmap;
      let expectedBitmap = expectedScreenshot.bitmap;
      return (actualBitmap.width == expectedBitmap.width &&
              actualBitmap.height == expectedBitmap.height &&
              actualBitmap.data.compare(expectedBitmap.data) == 0);
    }, 1000);
  }
  catch (e)
  {
    if (e instanceof TimeoutError)
    {
      await removeOutdatedScreenshots(vBrowser);
      for (let [postfix, data] of [["actual", actualScreenshot],
                                   ["expected", expectedScreenshot]])
      {
        await data.write(path.join(SCREENSHOT_DIR,
                                   `${fileNamePrefix}_${postfix}.png`));
      }
      throw new Error("Screenshots don't match" + description +
        "\n       " +
        "(See " + fileNamePrefix + "_*.png in test/screenshots.)"
      );
    }
    throw e;
  }
}

async function genericTest(driver, parentTitle, title, sectionIndex,
                           expectedScreenshot, description)
{
  let vBrowser = normalize(parentTitle);
  let fileNamePrefix = `${vBrowser}_${normalize(title)}`;
  let section = await getSection(driver, sectionIndex);

  // Sometimes on Firefox there is a delay until the added
  // filters become effective. So if the test case fails once,
  // we reload the page and try once again.
  try
  {
    await checkTestCase(driver, vBrowser, fileNamePrefix, section,
                        expectedScreenshot, description);
  }
  catch (e)
  {
    await driver.navigate().refresh();
    section = await getSection(driver, sectionIndex);
    await checkTestCase(driver, vBrowser, fileNamePrefix, section,
                        expectedScreenshot, description);
  }
}

async function clickSubscribeLink(driver, url)
{
  await driver.navigate().to(url);
  await driver.findElement(By.id("subscribe-button")).click();
}

function getSubscribeHandles(driver)
{
  return driver.wait(() => driver.getAllWindowHandles()
    .then(allHandles => allHandles.length > 2 ? allHandles : null), 3000);
}

async function confirmSubscribeDialog(driver)
{
  await driver.wait(until.ableToSwitchToFrame(0), 1000);
  let dialog = await driver.wait(
    until.elementLocated(By.id("dialog-content-predefined")), 1000);
  await driver.wait(async() =>
  {
    let [displayed, title] = await Promise.all([
      dialog.isDisplayed(),
      dialog.findElement(By.css("h3")).getText()
    ]);
    return displayed && title == "ABP Testcase Subscription";
  }, 1000, "dialog shown");
  await dialog.findElement(By.css("button")).click();
}

async function checkSubscriptionAdded(driver, url)
{
  let [added, err] = await driver.executeAsyncScript(`
     let callback = arguments[arguments.length - 1];
     browser.runtime.sendMessage({type: "subscriptions.get",
                                  ignoreDisabled: true,
                                  downloadable: true}).then(subs =>
       subs.some(s =>
         s.url == "${url}abp-testcase-subscription.txt"
       )
     ).then(
       res => callback([res, null]),
       err => callback([null, err])
     );
   `);
  if (err)
    throw err;
  assert.ok(added, "subscription added");
}

function loadSpecializedTest(url)
{
  try
  {
    return require("./specialized/" + url.split("/").slice(-2).join("_"));
  }
  catch (e)
  {
    if (e.code != "MODULE_NOT_FOUND")
      throw e;
  }
  return null;
}

describe("Test pages", async() =>
{
  it("discovered filter test cases", function()
  {
    assert.ok(this.test.parent.parent.pageTests.length > 0);
  });

  it("subscribe link", async function()
  {
    clickSubscribeLink(this.driver, this.test.parent.parent.testPagesURL);
    let handles = await getSubscribeHandles(this.driver);
    await closeWindow(this.driver, handles[2], handles[1], async() =>
    {
      await confirmSubscribeDialog(this.driver);
      await checkSubscriptionAdded(this.driver,
                                   this.test.parent.parent.testPagesURL);
    });
  });

  describe("Filter test cases", async function()
  {
    for (let [elemClass, url, pageTitle] of this.parent.parent.pageTests)
    {
      let specializedTest = loadSpecializedTest(url);

      if (isExcluded(elemClass, pageTitle, this.parent.parent.title,
                     specializedTest))
        continue;

      it(pageTitle, async function()
      {
        let testsExecuted = 0;
        let testKind = "Tests";
        let testCases = await getTestCases(this.driver, url);
        for (let i = 0; i < testCases.length; i++)
        {
          let [title, expectedScreenshot, filters] = testCases[i];
          let description = ["", "Test case: " + title, url].join("\n       ");

          await updateFilters(this.driver, this.origin, filters);

          await this.driver.navigate().to(url);
          if (specializedTest)
          {
            testKind = "Specialized tests";
            let section = await getSection(this.driver, i);
            await specializedTest.run(this.driver, section, description);
          }
          else
            await genericTest(this.driver, this.test.parent.parent.parent.title,
                              title, i, expectedScreenshot, description);
          testsExecuted += 1;
        }

        this.test.title += ` (${testKind}: ${testsExecuted})`;
      });
    }
  });
});
