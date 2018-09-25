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
const chrome = require("selenium-webdriver/chrome");
const {ensureChromium} = require("../../adblockpluscore/test/runners/" +
                                "chromium_download");

exports.platform = "chrome";
exports.ensureBrowser = ensureChromium;

// The Chromium version is a build number, quite obscure.
// Chromium 63.0.3239.x is 508578
// Chromium 65.0.3325.0 is 530368
// We currently want Chromiun 63, as we still support it and that's the
// loweset version that supports WebDriver.
exports.oldestCompatibleVersion = 508578;

exports.getDriver = function(browserBinary, devenvPath)
{
  let options = new chrome.Options()
    .setChromeBinaryPath(browserBinary)
    .addArguments("--no-sandbox")
    .addArguments(`load-extension=${devenvPath}`);

  return new webdriver.Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
};
