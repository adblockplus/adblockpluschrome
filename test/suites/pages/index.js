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
const path = require("path");
const Jimp = require("jimp");
const {By, until} = require("selenium-webdriver");
const {checkLastError} = require("../../misc/utils");

const SCREENSHOT_DIR = path.join(__dirname, "../..", "screenshots");

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

async function getTestCases(driver)
{
  let elements = await driver.findElements(By.css("section"));
  let sections = await Promise.all(elements.map(element =>
    Promise.all([element.findElement(By.className("testcase-container")),
                 element.findElement(By.css("h2")).getText()]).catch(() => null)
  ));
  return sections.filter(x => x).map(([element, title]) => ({element, title}));
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

async function getExpectedScreenshots(driver)
{
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

  let screenshots = [];
  for (let {element} of await getTestCases(driver))
    screenshots.push(await takeScreenshot(element));
  return screenshots;
}

async function getFilters(driver)
{
  let filters = new Set();
  for (let element of await driver.findElements(By.css("pre")))
  {
    for (let line of (await element.getText()).split("\n"))
      filters.add(line);
  }
  return Array.from(filters).join("\n");
}

async function updateFilters(driver, extensionHandle)
{
  let [filters, currentHandle] = await Promise.all([getFilters(driver),
                                                    driver.getWindowHandle()]);

  await driver.switchTo().window(extensionHandle);

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
  `, filters);

  if (error)
    throw error;

  await driver.switchTo().window(currentHandle);
  await driver.navigate().refresh();
}

async function runGenericTests(driver, testCases, expectedScreenshots,
                               browser, pageTitle, url)
{
  let actualScreenshot;
  let i = 0;

  async function compareScreenshots()
  {
    for (; i < testCases.length; i++)
    {
      await driver.wait(async() =>
      {
        actualScreenshot = await takeScreenshot(testCases[i].element);
        let actualBitmap = actualScreenshot.bitmap;
        let expectedBitmap = expectedScreenshots[i].bitmap;
        return (actualBitmap.width == expectedBitmap.width &&
                actualBitmap.height == expectedBitmap.height &&
                actualBitmap.data.compare(expectedBitmap.data) == 0);
      }, 1000);
    }
  }

  try
  {
    try
    {
      await compareScreenshots();
    }
    catch (e)
    {
      // Sometimes on Firefox there is a delay until the added
      // filters become effective. So if a test case fails,
      // we reload the page and try once again.
      await driver.navigate().refresh();
      testCases = await getTestCases(driver);
      await compareScreenshots();
    }
  }
  catch (e)
  {
    let token = `${browser}_${pageTitle}_${testCases[i].title}`;
    let prefix = token.toLowerCase().replace(/[^a-z0-9]+/g, "_");

    for (let [suffix, image] of [["actual", actualScreenshot],
                                 ["expected", expectedScreenshots[i]]])
      await image.write(path.join(SCREENSHOT_DIR, `${prefix}_${suffix}.png`));

    throw new Error(`Screenshots don't match
       Test case: ${testCases[i].title}
       ${url}
       (see ${prefix}_*.png in test/screenshots)`);
  }
}

async function clickSubscribeLink(driver, url)
{
  await driver.navigate().to(url);
  await driver.findElement(By.id("subscribe-button")).click();
}

async function waitForSubscriptionHandle(driver)
{
  await driver.switchTo().window(
    await driver.wait(async() => (await driver.getAllWindowHandles())[2],
                      3000, "extension page didn't open")
  );
}

async function confirmSubscribeDialog(driver)
{
  await driver.wait(until.ableToSwitchToFrame(0), 3000);
  let dialog = await driver.wait(
    until.elementLocated(By.id("dialog-content-predefined")), 3000);
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
    await clickSubscribeLink(this.driver, this.test.parent.parent.testPagesURL);
    await waitForSubscriptionHandle(this.driver);
    await confirmSubscribeDialog(this.driver);
    await checkSubscriptionAdded(this.driver,
                                 this.test.parent.parent.testPagesURL);
    await checkLastError(this.driver, this.extensionHandle);
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
        let testKind = "Tests";
        let testCases;

        await this.driver.navigate().to(url);

        if (specializedTest)
        {
          testKind = "Specialized tests";
          await updateFilters(this.driver, this.extensionHandle);
          testCases = await getTestCases(this.driver);

          for (let testCase of testCases)
            await specializedTest.run(this.driver, testCase);
        }
        else
        {
          let expetedScreenshots = await getExpectedScreenshots(this.driver);
          await updateFilters(this.driver, this.extensionHandle);
          testCases = await getTestCases(this.driver);
          await runGenericTests(this.driver, testCases, expetedScreenshots,
                                this.test.parent.parent.parent.title,
                                pageTitle, url);
        }

        await checkLastError(this.driver, this.extensionHandle);
        this.test.title += ` (${testKind}: ${testCases.length})`;
      });
    }
  });
});
