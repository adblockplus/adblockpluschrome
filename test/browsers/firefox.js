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

// We need to require the geckodriver,
// otherwise on Windows the geckodriver path is not added to process.env.PATH.
require("geckodriver");

exports.platform = "gecko";
exports.oldestCompatibleVersion = "57.0";
exports.ensureBrowser = ensureFirefox;

exports.getDriver = function(browserBinary, devenvPath)
{
  let options = new firefox.Options();
  options.setBinary(browserBinary);
  options.headless();

  let driver = new webdriver.Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .build();

  let cmd = new Command("moz-install-web-ext")
    .setParameter("path", devenvPath)
    .setParameter("temporary", true);

  driver.getExecutor().defineCommand(
    cmd.getName(), "POST",
    "/session/:sessionId/moz/addon/install"
  );
  driver.schedule(cmd, `installWebExt(${devenvPath})`);

  return driver;
};
