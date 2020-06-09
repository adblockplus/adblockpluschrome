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
import msedgedriver from "msedgedriver";
import fs from "fs";

export let platform = "chrome";

export function isBrowserInstalled()
{
  if (process.platform == "win32")
    return true;
  else if (process.platform == "darwin")
    return fs.existsSync("/Applications/Microsoft Edge.app/");

  return false;
}

export function getDriver(browserBinary, devenvPath)
{
  msedgedriver.start(["--silent"]); // Starts on localhost:9515

  return new webdriver.Builder()
    .forBrowser("MicrosoftEdge")
    .withCapabilities(
      {
        "browserName": "MicrosoftEdge",
        "ms:edgeChromium": true,
        "ms:edgeOptions":
        {
          args: ["--no-sandbox", `load-extension=${devenvPath}`]
        }
      })
    .usingServer("http://localhost:9515")
    .build();
}

export function shutdown()
{
  msedgedriver.stop();
}
