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

const TEST_PAGES_URL = "https://testpages.adblockplus.org/en/";
const SKIP_ONLINE_TESTS = false;

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {promisify} = require("util");
const Jimp = require("jimp");
const {By, until, error: {TimeoutError}} = require("selenium-webdriver");

const readdirAsync = promisify(fs.readdir);
const unlinkAsync = promisify(fs.unlink);

const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots");

async function closeWindow(driver, goTo, returnTo, callback)
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
}

function normalize(input)
{
  return input.replace(/[\W]+/g, "_").toLowerCase();
}

async function removeOutdatedScreenshots(browser)
{
  let files = await readdirAsync(SCREENSHOT_DIR);
  for (let filename of files)
  {
    if (filename.startsWith(browser))
    {
      try
      {
        await unlinkAsync(path.join(SCREENSHOT_DIR, filename));
      }
      catch (e)
      {
      }
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

async function getSections(driver)
{
  let elements = await driver.findElements(By.css("section"));
  let sections = await Promise.all(elements.map(e =>
      Promise.all([
        e.findElement(By.css("h2")).catch(() => null),
        e.findElement(By.className("testcase-container")).catch(() => null),
        e.findElements(By.css("pre"))
      ])
    ));
  return sections.filter(([title, demo, filters]) =>
    title && demo && filters.length > 0
  );
}

async function getUrls(driver)
{
  await driver.navigate().to(TEST_PAGES_URL);
  let elements = await driver.findElements(By.css(".site-pagelist a"));
  return await Promise.all(elements.map(elem =>
    Promise.all([
      elem.getAttribute("class"),
      elem.getAttribute("href"),
      elem.getText()
    ])
  ));
}

function isExcluded(elemClass, pageTitle, testTitle)
{
  let onlineTestCase = elemClass && elemClass.split(/\s+/).includes("online");
  if (SKIP_ONLINE_TESTS && onlineTestCase)
    return true;

  let browser = testTitle.replace(/\s.*$/, "");
  if (// https://issues.adblockplus.org/ticket/6917
      pageTitle == "$subdocument" && browser == "Firefox" ||
      // Chromium doesn't support Flash
      pageTitle.startsWith("$object") && browser == "Chromium" ||
      // Chromium 63 doesn't have user stylesheets (required to
      // overrule inline styles) and doesn't run content scripts
      // in dynamically written documents.
      testTitle == "Chromium (oldest)" &&
      (pageTitle == "Inline style !important" ||
       pageTitle == "Anonymous iframe document.write()"))
    return true;

  return false;
}

async function getTestCases(driver, url, pageTitle)
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
  for (let [title, demo, filters] of await getSections(driver))
  {
    tests.push(await Promise.all([
      title.getText().then(s => `${pageTitle.trim()} - ${s.trim()}`),
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

async function popupTest(driver, sectionIndex, pageTitle, description)
{
  let sections = await getSections(driver);
  await sections[sectionIndex][1].findElement(By.css("a[href],button")).click();
  await driver.sleep(500);
  let handles = await driver.getAllWindowHandles();
  if (pageTitle == "$popup - Exception")
  {
    assert.equal(handles.length, 3, "Popup is whitelisted" + description);
    await closeWindow(driver, handles[2], handles[1]);
  }
  else
    assert.equal(handles.length, 2, "Popup is blocked" + description);
}

async function genericTest(driver, parentTitle, title, sectionIndex,
  expectedScreenshot, description, url)
{
  let vBrowser = normalize(parentTitle);
  let fileNamePrefix = `${vBrowser}_${normalize(title)}`;

  let checkTestCase = async() =>
  {
    let tSections = await getSections(driver);
    let bitmap = null;
    let expectedBitmap = null;
    let actualScreenshot = null;

    try
    {
      await driver.wait(async() =>
      {
        actualScreenshot = await takeScreenshot(tSections[sectionIndex][1]);
        ({bitmap} = actualScreenshot);
        ({bitmap: expectedBitmap} = expectedScreenshot);
        return (bitmap.width == expectedBitmap.width &&
                bitmap.height == expectedBitmap.height &&
                bitmap.data.compare(expectedBitmap.data) == 0);
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
  };

  // Sometimes on Firefox there is a delay until the added
  // filters become effective. So if the test case fails once,
  // we reload the page and try once again.
  try
  {
    await checkTestCase(expectedScreenshot, title, sectionIndex, url);
  }
  catch (e)
  {
    await driver.navigate().refresh();
    await checkTestCase(expectedScreenshot, title, sectionIndex, url);
  }
}

async function clickSubscribeLink(driver)
{
  await driver.navigate().to(TEST_PAGES_URL);
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

async function checkSubscriptionAdded(driver)
{
  let [added, err] = await driver.executeAsyncScript(`
     let callback = arguments[arguments.length - 1];
     browser.runtime.sendMessage({type: "subscriptions.get",
                                  ignoreDisabled: true,
                                  downloadable: true}).then(subs =>
       subs.some(s =>
         s.url == "${TEST_PAGES_URL}abp-testcase-subscription.txt"
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

it("Test pages", async function()
{
  let testsExecuted = 0;
  let urls = await getUrls(this.driver);
  for (let [elemClass, url, pageTitle] of urls)
  {
    if (isExcluded(elemClass, pageTitle, this.test.parent.title))
      continue;

    let testCases = await getTestCases(this.driver, url, pageTitle);
    for (let i = 0; i < testCases.length; i++)
    {
      let [title, expectedScreenshot, filters] = testCases[i];
      let description = ["", "Test case: " + title, url].join("\n       ");

      await updateFilters(this.driver, this.origin, filters);

      await this.driver.navigate().to(url);
      if (pageTitle.startsWith("$popup"))
        await popupTest(this.driver, i, pageTitle, description);
      else
        await genericTest(this.driver, this.test.parent.title, title, i,
                          expectedScreenshot, description, url);
      testsExecuted += 1;
    }
  }
  if (testsExecuted == 0)
    throw new Error("No tests executed. Check that test pages can be parsed");
  this.test.title =
    `${this.test.title} (Tests executed: ${testsExecuted})`;
});

it("subscribe link", async function()
{
  clickSubscribeLink(this.driver);
  let handles = await getSubscribeHandles(this.driver);
  await closeWindow(this.driver, handles[2], handles[1], async() =>
  {
    await confirmSubscribeDialog(this.driver);
    await checkSubscriptionAdded(this.driver);
  });
});
