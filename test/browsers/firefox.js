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

const webdriver = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const {Command} = require("selenium-webdriver/lib/command");
const {ensureFirefox} = require("../../adblockpluscore/test/runners/" +
                                "firefox_download");
const {downloadJSON} = require("../misc/utils.js");

// We need to require the geckodriver,
// otherwise on Windows the geckodriver path is not added to process.env.PATH.
require("geckodriver");

exports.platform = "gecko";
exports.oldestCompatibleVersion = "57.0";
exports.ensureBrowser = ensureFirefox;

exports.getDriver = function(browserBinary, devenvPath, insecure)
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

  driver.execute(new Command("install addon")
    .setParameter("path", devenvPath)
    .setParameter("temporary", true));

  return driver;
};

exports.getLatestVersion = async function()
{
  let data = await downloadJSON("https://product-details.mozilla.org/1.0/firefox_versions.json");
  return data.LATEST_FIREFOX_VERSION;
};
