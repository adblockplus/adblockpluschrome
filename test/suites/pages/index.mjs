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

import assert from "assert";
import webdriver from "selenium-webdriver";
import {checkLastError, runWithHandle} from "../../misc/utils.mjs";
import specializedTests from "./specialized.mjs";
import defineSubscribeTest from "./subscribe.mjs";
import defineUninstallTest from "./uninstall.mjs";
import {getExpectedScreenshot, runFirstTest,
        getPage, isExcluded, runGenericTests} from "./utils.mjs";

const {By} = webdriver;

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

export default () =>
{
  describe("Test pages", () =>
  {
    it("discovered filter test cases", function()
    {
      assert.ok(this.test.parent.parent.pageTests.length > 0);
    });

    defineSubscribeTest();

    describe("Filters", function()
    {
      for (let [url, pageTitle] of this.parent.parent.pageTests)
      {
        it(pageTitle, async function()
        {
          let page = getPage(url);
          if (isExcluded(page, this.browserName, this.browserVersion))
            this.skip();

          if (page in specializedTests)
          {
            await updateFilters(this.driver, this.extensionHandle, url);
            let locator = By.className("testcase-area");
            for (let element of await this.driver.findElements(locator))
              await specializedTests[page].run(element, this.extensionHandle);
          }
          else
          {
            let expectedScreenshot = await getExpectedScreenshot(this.driver,
                                                                 url);
            await updateFilters(this.driver, this.extensionHandle, url);
            await runGenericTests(this.driver, expectedScreenshot,
                                  this.browserName, this.browserVersion,
                                  pageTitle, url);
          }

          await checkLastError(this.driver, this.extensionHandle);
        });
      }
    });

    describe("Final checks", () =>
    {
      it("does not block unfiltered content", async function()
      {
        await assert.rejects(
          runFirstTest(this.driver, this.browserName, this.browserVersion,
                       this.test.parent.parent.parent.pageTests,
                       this.test.title, false),
          /Screenshots don't match/
        );
      });

      defineUninstallTest();
    });
  });
};
