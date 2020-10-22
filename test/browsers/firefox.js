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

import webdriver from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import command from "selenium-webdriver/lib/command.js";
import got from "got";

export {ensureFirefox as ensureBrowser}
  from "../../adblockpluscore/test/runners/firefox_download.mjs";

// We need to require the geckodriver,
// otherwise on Windows the geckodriver path is not added to process.env.PATH.
import "geckodriver";

export let target = "firefox";
export let oldestCompatibleVersion = "57.0";

export async function getDriver(browserBinary, extensionPaths, insecure)
{
  let options = new firefox.Options().headless();
  if (browserBinary != null)
    options.setBinary(browserBinary);
  if (insecure)
    options.set("acceptInsecureCerts", true);

  let driver = new webdriver.Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .build();

  for (let extensionPath of extensionPaths)
  {
    await driver.execute(
      new command.Command("install addon")
        .setParameter("path", extensionPath)
        .setParameter("temporary", true)
    );
  }

  return driver;
}

export async function getLatestVersion()
{
  let data = await got("https://product-details.mozilla.org/1.0/firefox_versions.json").json();
  return data.LATEST_FIREFOX_VERSION;
}
