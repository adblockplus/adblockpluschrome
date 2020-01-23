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

let lastScreenshot = Promise.resolve();
let screenshotFolder = path.join(__dirname, "..", "screenshots");

// Once we require Node.js >= 10 this should be replaced with
// the built-in finally() method of the Promise object.
function promiseFinally(p, callback)
{
  return p.then(
    callback,
    err => Promise.resolve(callback()).then(() =>
      Promise.reject(err)
    )
  );
}

function closeWindow(driver, goTo, returnTo, callback)
{
  return promiseFinally(
    driver.switchTo().window(goTo).then(() =>
      promiseFinally(
        new Promise(resolve => resolve(callback && callback())),
        () => driver.close()
      )
    ),
    () => driver.switchTo().window(returnTo)
  );
}

function normalize(input)
{
  return input.replace(/[\W]+/g, "_").toLowerCase();
}

async function removeOutdatedScreenshots(browser)
{
  let files = await readdirAsync(screenshotFolder);
  for (let filename of files)
  {
    if (filename.startsWith(browser))
    {
      try
      {
        await unlinkAsync(path.join(screenshotFolder, filename));
      }
      catch (e)
      {
      }
    }
  }
}

async function lastScreenshotFunc(elem, lastScreenshotPromise)
{
  // It would be preferable if we could use WebElement.takeScreenshot(),
  // but it's not supported on Chrome, and produces incorrect output when
  // called repeatedly, on Firefox >=58 or when using geckodriver >=1.13.
  // So as a workaround, we scroll to the position of the element, take a
  // screenshot of the viewport and crop it to the element's size and position.
  let [rect] = await Promise.all([elem.getRect(), lastScreenshotPromise]);
  let result = await elem.getDriver().executeScript(`
    window.scrollTo(${rect.x}, ${rect.y});
    return [window.scrollX, window.scrollY];
  `);
  let x = rect.x - result[0];
  let y = rect.y - result[1];

  let s = await elem.getDriver().takeScreenshot();
  let img = await Jimp.read(Buffer.from(s, "base64"));
  return img.crop(x, y, rect.width, rect.height);
}

function takeScreenshot(element)
{
  lastScreenshot = lastScreenshotFunc(element, lastScreenshot);
  return lastScreenshot;
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

it("Test pages", async function()
{
  let vBrowser = normalize(this.test.parent.title);
  let screenshotsRemoved = removeOutdatedScreenshots(vBrowser);

  await this.driver.navigate().to(TEST_PAGES_URL);
  let elements = await this.driver.findElements(By.css(".site-pagelist a"));
  let urls = await Promise.all(elements.map(elem =>
    Promise.all([
      elem.getAttribute("class"),
      elem.getAttribute("href"),
      elem.getText()
    ])
  ));

  for (let [elemClass, url, pageTitle] of urls)
  {
    let onlineTestCase = elemClass && elemClass.split(/\s+/).includes("online");
    if (SKIP_ONLINE_TESTS && onlineTestCase)
      continue;

    let browser = this.test.parent.title.replace(/\s.*$/, "");
    if (// https://issues.adblockplus.org/ticket/6917
        pageTitle == "$subdocument" && browser == "Firefox" ||
        // Chromium doesn't support Flash
        pageTitle.startsWith("$object") && browser == "Chromium" ||
        // Chromium 63 doesn't have user stylesheets (required to
        // overrule inline styles) and doesn't run content scripts
        // in dynamically written documents.
        this.test.parent.title == "Chromium (oldest)" &&
        (pageTitle == "Inline style !important" ||
         pageTitle == "Anonymous iframe document.write()"))
      continue;

    await this.driver.navigate().to(url);
    let sections = await Promise.all([
      getSections(this.driver),
      this.driver.executeScript(`
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
        `)
    ]);
    let testCases = await Promise.all(
      sections[0].map(([title, demo, filters]) =>
        Promise.all([
          title.getAttribute("textContent").then(testTitle =>
            `${pageTitle.trim()} - ${testTitle.trim()}`
          ),
          takeScreenshot(demo),
          Promise.all(filters.map(elem => elem.getAttribute("textContent")))
        ])
      ));

    for (let i = 0; i < testCases.length; i++)
    {
      let [title, expectedScreenshot, filters] = testCases[i];
      let description = ["", "Test case: " + title, url].join("\n       ");

      await this.driver.navigate().to(this.origin + "/options.html");
      let error = await this.driver.executeAsyncScript(`
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

      await this.driver.navigate().to(url);
      if (pageTitle.startsWith("$popup"))
      {
        let pSections = await getSections(this.driver);
        await pSections[i][1].findElement(By.css("a[href],button"))
          .click();
        await this.driver.sleep(500);
        let handles = await this.driver.getAllWindowHandles();
        if (pageTitle == "$popup - Exception")
        {
          assert.equal(handles.length, 3, "Popup is whitelisted" + description);
          await closeWindow(this.driver, handles[2], handles[1]);
        }
        else
        {
          assert.equal(handles.length, 2, "Popup is blocked" + description);
        }
      }
      else
      {
        let fileNamePrefix = `${vBrowser}_${normalize(title)}`;

        let checkTestCase = async() =>
        {
          let tSections = await getSections(this.driver);
          let bitmap = null;
          let expectedBitmap = null;
          let actualScreenshot = null;

          try
          {
            await this.driver.wait(async() =>
            {
              actualScreenshot = await takeScreenshot(tSections[i][1]);
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
              await screenshotsRemoved;
              for (let [postfix, data] of [["actual", actualScreenshot],
                ["expected", expectedScreenshot]])
              {
                await data.write(path.join(
                  screenshotFolder, `${fileNamePrefix}_${postfix}.png`));
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
          await checkTestCase(expectedScreenshot, title, i, url);
        }
        catch (e)
        {
          await this.driver.navigate().refresh();
          await checkTestCase(expectedScreenshot, title, i, url);
        }
      }
    }
  }
});

it("subscribe link", async function()
{
  await this.driver.navigate().to(TEST_PAGES_URL);
  await this.driver.findElement(By.id("subscribe-button")).click();
  let handles = await this.driver.wait(() =>
      this.driver.getAllWindowHandles().then(allHandles =>
        allHandles.length > 2 ? allHandles : null
      ), 3000
    );
  return closeWindow(this.driver, handles[2], handles[1], async() =>
  {
    await this.driver.wait(until.ableToSwitchToFrame(0), 1000);
    let dialog = await this.driver.wait(
      until.elementLocated(By.id("dialog-content-predefined")), 1000);
    await this.driver.wait(async() =>
    {
      let [displayed, title] = await Promise.all([
        dialog.isDisplayed(),
        dialog.findElement(By.css("h3")).getText()
      ]);
      return displayed && title == "ABP Testcase Subscription";
    }, 1000, "dialog shown");
    await dialog.findElement(By.css("button")).click();
    let [added, err] = await this.driver.executeAsyncScript(`
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
  });
});
