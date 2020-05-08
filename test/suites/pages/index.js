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
const {By} = require("selenium-webdriver");
const {checkLastError, runWithHandle,
       reloadModule} = require("../../misc/utils");
const specializedTests = require("./specialized");

const SCREENSHOT_DIR = path.join(__dirname, "../..", "screenshots");
// diff.percent examples on screenshots:
// 0.02558039532430121 - all Blocking page tests failed
// 0.00426475605595359 - one Blocking page test failed
// 0.00000107250107250 - one pixel difference
const SCREENSHOT_DIFF = 0.00001;

async function takeScreenshot(driver)
{
  // On macOS scrollbars appear and disappear overlapping
  // the content as scrolling occurs. So we have to hide
  // the scrollbars to get reproducible screenshots.
  await driver.executeScript(`
    let style = document.createElement("style");
    style.textContent = "html { overflow-y: scroll; }"
    document.head.appendChild(style);
    if (document.documentElement.clientWidth == window.innerWidth)
      style.textContent = "html::-webkit-scrollbar { display: none; }";
    else
      document.head.removeChild(style);`);

  let fullScreenshot = new Jimp(0, 0);
  while (true)
  {
    let [width, height, offset] = await driver.executeScript(`
      window.scrollTo(0, arguments[0]);
      return [document.documentElement.clientWidth,
              document.documentElement.scrollHeight,
              window.scrollY];`, fullScreenshot.bitmap.height);
    let data = await driver.takeScreenshot();
    let partialScreenshot = await Jimp.read(Buffer.from(data, "base64"));
    let combinedScreenshot = new Jimp(width, offset +
                                             partialScreenshot.bitmap.height);
    combinedScreenshot.composite(fullScreenshot, 0, 0);
    combinedScreenshot.composite(partialScreenshot, 0, offset);
    fullScreenshot = combinedScreenshot;

    if (fullScreenshot.bitmap.height >= height)
      break;
  }
  return fullScreenshot;
}

function isExcluded(page, browser)
{
  if (process.env.TEST_PAGES_URL && page == "exceptions/sitekey")
    return true;

  let excluded;
  if (page in specializedTests)
    excluded = specializedTests[page].excludedBrowsers;
  // https://issues.adblockplus.org/ticket/6917
  else if (page == "filters/subdocument")
    excluded = ["Firefox"];
  // Chromium 63 doesn't have user stylesheets (required to
  // overrule inline styles) and doesn't run content scripts
  // in dynamically written documents.
  else if (page == "circumvention/inline-style-important" ||
           page == "circumvention/anoniframe-documentwrite")
    excluded = ["Chromium (oldest)"];
  // shadowing requires Firefox 63+ or 59+ with flag
  // dom.webcomponents.shadowdom.enabled
  else if (page == "snippets/hide-if-shadow-contains")
    excluded = ["Firefox (oldest)"];

  return !!excluded && excluded.some(s => s.includes(" ") ?
                                            browser == s :
                                            browser.startsWith(s));
}

async function getExpectedScreenshot(driver, url)
{
  await driver.navigate().to(`${url}?expected=1`);
  return await takeScreenshot(driver);
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

async function updateFilters(driver, extensionHandle, url)
{
  await driver.navigate().to(url);
  let filters = await getFilters(driver);
  let error = await runWithHandle(driver, extensionHandle,
                                  () => driver.executeAsyncScript(`
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
    ).then(errors => callback(errors[0]), callback);`, filters));

  if (error)
    throw error;

  await driver.navigate().refresh();
}

async function runGenericTests(driver, expectedScreenshot,
                               browser, pageTitle, url)
{
  let actualScreenshot;

  async function compareScreenshots()
  {
    await driver.wait(async() =>
    {
      actualScreenshot = await takeScreenshot(driver);
      let diff = Jimp.diff(actualScreenshot, expectedScreenshot, 0.001);
      return diff.percent < SCREENSHOT_DIFF;
    }, 5000, "Screenshots don't match");
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
      await compareScreenshots();
    }
  }
  catch (e)
  {
    let title = `${browser}_${pageTitle}`;
    let prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");

    for (let [suffix, image] of [["actual", actualScreenshot],
                                 ["expected", expectedScreenshot]])
      await image.write(path.join(SCREENSHOT_DIR, `${prefix}_${suffix}.png`));

    throw new Error(`${e.message}
       ${url}
       (see ${path.join(SCREENSHOT_DIR, prefix)}_*.png)`);
  }
}

describe("Test pages", async() =>
{
  it("discovered filter test cases", function()
  {
    assert.ok(this.test.parent.parent.pageTests.length > 0);
  });

  reloadModule(require.resolve("./subscribe"));

  describe("Filter test cases", async function()
  {
    for (let [url, pageTitle] of this.parent.parent.pageTests)
    {
      let page = url.substr(url.lastIndexOf("/", url.lastIndexOf("/") - 1) + 1);

      if (isExcluded(page, this.parent.parent.title))
        continue;

      it(pageTitle, async function()
      {
        if (page in specializedTests)
        {
          await updateFilters(this.driver, this.extensionHandle, url);
          let locator = By.className("testcase-container");
          for (let element of await this.driver.findElements(locator))
            await specializedTests[page].run(element, this.extensionHandle);
        }
        else
        {
          let expetedScreenshot = await getExpectedScreenshot(this.driver, url);
          await updateFilters(this.driver, this.extensionHandle, url);
          await runGenericTests(this.driver, expetedScreenshot,
                                this.test.parent.parent.parent.title,
                                pageTitle, url);
        }

        await checkLastError(this.driver, this.extensionHandle);
      });
    }
  });
});
