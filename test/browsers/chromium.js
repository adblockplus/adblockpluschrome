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
const got = require("got");
const {ensureChromium} = require("../../adblockpluscore/test/runners/" +
                                 "chromium_download");

// We need to require the chromedriver,
// otherwise on Windows the chromedriver path is not added to process.env.PATH.
require("chromedriver");

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
    .addArguments("--no-sandbox")
    .addArguments(`load-extension=${devenvPath}`);

  if (browserBinary != null)
    options.setChromeBinaryPath(browserBinary);

  return new webdriver.Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();
};

exports.getLatestVersion = async function()
{
  let os = process.platform;
  if (os == "win32")
    os = process.arch == "x64" ? "win64" : "win";
  else if (os == "darwin")
    os = "mac";

  let data = await got(`https://omahaproxy.appspot.com/all.json?os=${os}`).json();
  let version = data[0].versions.find(ver => ver.channel == "stable");
  let base = version.branch_base_position;

  if (version.true_branch.includes("_"))
  {
    // A wrong base may be caused by a mini-branch (patched) release
    // In that case, the base is taken from the unpatched version
    let cv = version.current_version.split(".");
    let unpatched = `${cv[0]}.${cv[1]}.${cv[2]}.0`;
    let unpatchedVersion = await got(`https://omahaproxy.appspot.com/deps.json?version=${unpatched}`).json();
    base = unpatchedVersion.chromium_base_position;
  }

  return base;
};
