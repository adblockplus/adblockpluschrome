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

const assert = require("assert");
const Jimp = require("jimp");
const {By, until} = require("selenium-webdriver");

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

function testSubscribeLink(driver)
{
  return driver.findElement(By.id("subscribe-button")).click().then(() =>
    driver.wait(() =>
      driver.getAllWindowHandles().then(handles =>
        handles.length > 2 ? handles : null
      ), 3000
    )
  ).then(handles =>
    closeWindow(driver, handles[2], handles[1], () =>
      driver.wait(until.ableToSwitchToFrame(0), 1000).then(() =>
        driver.wait(until.elementLocated(By.id("dialog-content-predefined")),
                    1000)
      ).then(dialog =>
        Promise.all([
          dialog.isDisplayed(),
          dialog.findElement(By.css("h3")).getText()
        ]).then(([displayed, title]) =>
        {
          assert.ok(displayed, "subscribe link: dialog shown");
          assert.equal(title, "ABP Testcase Subscription",
                       "subscribe link: title shown in dialog");

          return dialog.findElement(By.css("button")).click();
        })
      ).then(() =>
        driver.executeAsyncScript(`
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
        `)
      ).then(([added, err]) =>
      {
        if (err)
          throw err;
        assert.ok(added, "subscribe link: subscription added");
      })
    )
  );
}

function imageFromBase64(s)
{
  return Jimp.read(Buffer.from(s, "base64"));
}

function takeScreenshot(element)
{
  return element.takeScreenshot().then(
    imageFromBase64,

    // Chrome doesn't support taking screenshots of individual elements. So as
    // a workaround, we scroll to the position of the element, take a screenshot
    // of the viewport and crop it to the size and position of our element.
    // This is not guaranteed to work on other browsers (mostly because
    // the behavior of Driver.takeScreenshot() may vary across browsers).
    () => element.getLocation().then(loc =>
      element.getDriver().executeScript(`
        window.scrollTo(${loc.x}, ${loc.y});
        return [window.scrollX, window.scrollY];
      `).then(result =>
      {
        let x = loc.x - result[0];
        let y = loc.y - result[1];

        return Promise.all([
          element.getDriver().takeScreenshot().then(imageFromBase64),
          element.getSize()
        ]).then(([img, size]) =>
          img.crop(x, y, size.width, size.height)
        );
      })
    )
  ).then(img => img.bitmap);
}

function getSections(driver)
{
  return driver.findElements(By.css("section")).then(elements =>
    Promise.all(elements.map(e =>
      Promise.all([
        e.findElement(By.css("h2")).catch(() => null),
        e.findElement(By.className("testcase-container")).catch(() => null),
        e.findElements(By.css("pre"))
      ])
    ))
  ).then(sections => sections.filter(
    ([title, demo, filters]) => title && demo && filters.length > 0
  ));
}

it("test pages", function()
{
  return this.driver.navigate().to(TEST_PAGES_URL).then(() =>
    this.driver.findElements(By.css(".site-pagelist a"))
  ).then(elements =>
    Promise.all(elements.map(elem => elem.getAttribute("href")))
  ).then(urls =>
  {
    let p1 = testSubscribeLink(this.driver);
    for (let url of urls)
      p1 = p1.then(() =>
        this.driver.navigate().to(url)
      ).then(() =>
        Promise.all([
          getSections(this.driver),
          this.driver.findElement(By.css("h2")).getAttribute("textContent"),
          this.driver.executeScript("document.body.classList.add('expected');")
        ])
      ).then(([sections, pageTitle]) =>
        Promise.all(sections.map(([title, demo, filters]) =>
          Promise.all([
            title.getAttribute("textContent").then(testTitle =>
              `${pageTitle.trim()} - ${testTitle.trim()}`
            ),
            takeScreenshot(demo),
            Promise.all(filters.map(elem => elem.getAttribute("textContent")))
          ])
        ))
      ).then(testCases =>
      {
        let p2 = Promise.resolve();
        for (let i = 0; i < testCases.length; i++)
        {
          let [title, expectedScreenshot, filters] = testCases[i];
          let platform = this.test.parent.title;

          if (// https://issues.adblockplus.org/ticket/6917
              title == "$subdocument - Test case" && platform == "gecko" ||
              // Chromium doesn't support Flash
              /^\$object(-subrequest)? /.test(title) && platform == "chrome")
            continue;

          p2 = p2.then(() =>
            this.driver.navigate().to(this.origin + "/options.html")
          ).then(() =>
            this.driver.executeAsyncScript(`
              let filters = arguments[0];
              let callback = arguments[arguments.length - 1];
              browser.runtime.sendMessage({type: "subscriptions.get",
                                           downloadable: true,
                                           special: true}).then(subs =>
              {
                for (let subscription of subs)
                  browser.runtime.sendMessage({type: "subscriptions.remove",
                                               url: subscription.url});
                return browser.runtime.sendMessage({type: "filters.importRaw",
                                                    text: filters});
              }).then(() => callback(), callback);
            `, filters.join("\n"))
          ).then(error =>
          {
            if (error)
              throw error;
            return this.driver.navigate().to(url);
          }).then(() =>
            getSections(this.driver)
          ).then(sections =>
          {
            let element = sections[i][1];

            if (title.startsWith("$popup "))
            {
              return element.findElement(
                By.css("a[href],button")
              ).click().then(() =>
                this.driver.sleep(100)
              ).then(() =>
                this.driver.getAllWindowHandles()
              ).then(handles =>
              {
                if (title.startsWith("$popup Exception -"))
                {
                  assert.equal(handles.length, 3, title);
                  return closeWindow(this.driver, handles[2], handles[1]);
                }

                assert.equal(handles.length, 2, title);
              });
            }

            return takeScreenshot(element).then(screenshot =>
              assert.ok(
                screenshot.width == expectedScreenshot.width &&
                screenshot.height == expectedScreenshot.height &&
                screenshot.data.compare(expectedScreenshot.data) == 0,
                title
              )
            );
          });
        }
        return p2;
      });
    return p1;
  });
});
