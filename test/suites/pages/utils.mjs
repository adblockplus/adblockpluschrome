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

import path from "path";
import Jimp from "jimp";
import specializedTests from "./specialized.mjs";

const SCREENSHOT_DIR = path.join("test", "screenshots");
// diff.percent examples on screenshots:
// 0.02558039532430121 - all Blocking page tests failed
// 0.00426475605595359 - one Blocking page test failed
// 0.00000107250107250 - one pixel difference
const SCREENSHOT_DIFF = 0.0005;

export async function takeScreenshot(driver)
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

export function isExcluded(page, browser)
{
  let excluded;
  if (page in specializedTests)
    excluded = specializedTests[page].excludedBrowsers;
  // https://issues.adblockplus.org/ticket/6917
  else if (page == "filters/subdocument")
    excluded = ["Firefox"];
  // Chromium 63 doesn't have user stylesheets (required to
  // overrule inline styles).
  else if (page == "circumvention/inline-style-important")
    excluded = ["Chromium (oldest)"];
  // Older versions of Chromium don't run content
  // scripts in dynamically written documents.
  // Firefox <67 had a bug that resets the document:
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1528146
  else if (page == "circumvention/anoniframe-documentwrite")
    excluded = ["Chromium (oldest)", "Firefox (oldest)"];
  // shadowing requires Firefox 63+ or 59+ with flag
  // dom.webcomponents.shadowdom.enabled
  else if (page == "snippets/hide-if-shadow-contains")
    excluded = ["Firefox (oldest)"];

  return !!excluded && excluded.some(s => s.includes(" ") ?
                                            browser == s :
                                            browser.startsWith(s));
}

export async function getExpectedScreenshot(driver, url)
{
  await driver.navigate().to(`${url}?expected=1`);
  return await takeScreenshot(driver);
}

export async function writeScreenshotFile(image, browser, testTitle, suffix)
{
  let title = `${browser}_${testTitle}`;
  let prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  let screenshotPath = path.join(SCREENSHOT_DIR, `${prefix}_${suffix}.png`);
  await image.write(screenshotPath);
  return screenshotPath;
}

export async function runGenericTests(driver, expectedScreenshot,
                                      browser, testTitle, url,
                                      writeScreenshots = true)
{
  let actualScreenshot;

  async function compareScreenshots()
  {
    await driver.wait(async() =>
    {
      actualScreenshot = await takeScreenshot(driver);
      let diff = Jimp.diff(actualScreenshot, expectedScreenshot, 0.001);
      return diff.percent < SCREENSHOT_DIFF;
    }, 5000, "Screenshots don't match", 500);
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
    if (!writeScreenshots)
      throw e;

    let paths = [];
    for (let [suffix, image] of [["actual", actualScreenshot],
                                 ["expected", expectedScreenshot]])
      paths.push(await writeScreenshotFile(image, browser, testTitle, suffix));

    throw new Error(`${e.message}\n${url}\n(see ${paths})`);
  }
}

export function getPage(url)
{
  return url.substr(url.lastIndexOf("/", url.lastIndexOf("/") - 1) + 1);
}

export async function runFirstTest(driver, topLevelTestSuite, testTitle,
                                   writeScreenshots = true)
{
  let {pageTests, title: browser} = topLevelTestSuite;
  for (let [url] of pageTests)
  {
    let page = getPage(url);
    if (!(isExcluded(page, browser) || page in specializedTests))
    {
      let expectedScreenshot = await getExpectedScreenshot(driver, url);
      await driver.navigate().to(url);
      await runGenericTests(driver, expectedScreenshot, browser,
                            testTitle, url, writeScreenshots);
      return;
    }
  }
  throw new Error("No generic test did run");
}
