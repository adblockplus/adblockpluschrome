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
import {checkLastError, executeScriptCompliant} from "../../misc/utils.js";
import {writeScreenshotAndThrow} from "../../misc/screenshots.js";
import {runFirstTest} from "./utils.js";

const {By} = webdriver;

async function addSubscription(driver, extensionHandle, currentHandle)
{
  await driver.switchTo().window(currentHandle);
  await driver.findElement(By.id("subscribe-button")).click();
  await driver.switchTo().window(extensionHandle);

  let dialog;
  await driver.wait(async() =>
  {
    await driver.switchTo().defaultContent();
    await driver.switchTo().frame(0);
    dialog = driver.findElement(By.id("dialog-content-predefined"));
    let [displayed, title] = await Promise.all([
      dialog.isDisplayed(),
      dialog.findElement(By.css(".title span")).getText()
    ]);
    return displayed && title == "ABP Testcase Subscription";
  }, 4000, "subscribe dialog not shown");
  await dialog.findElement(By.css(".default-focus")).click();
}

async function checkSubscriptionAdded(driver, url)
{
  let added = await executeScriptCompliant(driver, `
    let subs = await browser.runtime.sendMessage({type: "subscriptions.get",
                                                  ignoreDisabled: true,
                                                  downloadable: true});
    return subs.some(s => s.url == arguments[0]);`, url);
  assert.ok(added, "subscription added");
}

async function removeSubscription(driver, extensionHandle, url)
{
  await driver.switchTo().window(extensionHandle);
  await executeScriptCompliant(driver, `
    await browser.runtime.sendMessage({type: "subscriptions.remove",
                                       url: arguments[0]});`, url);
}

export default () =>
{
  it("subscribes to a link", async function()
  {
    let {testPagesURL, pageTests} = this.test.parent.parent.parent;
    let subscription = `${testPagesURL}abp-testcase-subscription.txt`;
    let currentHandle = await this.driver.getWindowHandle();
    try
    {
      await this.driver.navigate().to(testPagesURL);
      await addSubscription(this.driver, this.extensionHandle, currentHandle);
      await checkSubscriptionAdded(this.driver, subscription);
    }
    catch (e)
    {
      await writeScreenshotAndThrow(this, e);
    }
    await this.driver.switchTo().window(currentHandle);
    await runFirstTest(this.driver, this.browserName, this.browserVersion,
                       pageTests, this.test.title);
    await removeSubscription(this.driver, this.extensionHandle, subscription);
    await checkLastError(this.driver, this.extensionHandle);
  });
};
