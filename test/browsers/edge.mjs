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
import path from "path";
import {exec, execFile} from "child_process";
import {promisify} from "util";

export let target = "chrome";

const MACOS_BINARY_PATH = "/Applications/Microsoft Edge.app" +
                          "/Contents/MacOS/Microsoft Edge";

export function isBrowserInstalled()
{
  if (process.platform == "win32")
    return true;
  if (process.platform == "darwin")
    return fs.existsSync(MACOS_BINARY_PATH);
  return false;
}

async function ensureDriver(browserBinary)
{
  let version;
  if (process.platform == "win32")
  {
    let arg = browserBinary ?
      `'${browserBinary.split("'").join("''")}'` :
      "${Env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe";
    let command = `(Get-ItemProperty ${arg}).VersionInfo.ProductVersion`;
    let {stdout} = await promisify(exec)(command, {shell: "powershell.exe"});
    version = stdout.trim();
  }
  else
  {
    let binary = browserBinary || MACOS_BINARY_PATH;
    let {stdout} = await promisify(execFile)(binary, ["--version"]);
    version = stdout.trim().replace(/.*\s/, "");
  }

  await promisify(execFile)(
    process.execPath,
    [path.join("node_modules", "msedgedriver", "install.js")],
    {env: {...process.env, EDGECHROMIUMDRIVER_VERSION: version,
           npm_config_edgechromiumdriver_skip_download: false}}
  );
}

export async function getDriver(browserBinary, extensionPaths, insecure)
{
  await ensureDriver(browserBinary);
  await msedgedriver.start(["--silent"], true); // Starts on localhost:9515

  let options = {
    args: ["--no-sandbox", "--disable-partial-raster",
           `load-extension=${extensionPaths.join(",")}`]
  };
  if (browserBinary)
    options.binary = browserBinary;

  return new webdriver.Builder()
    .forBrowser("MicrosoftEdge")
    .withCapabilities({
      "browserName": "MicrosoftEdge",
      "ms:edgeChromium": true,
      "ms:edgeOptions": options,
      "acceptInsecureCerts": insecure
    })
    .usingServer("http://localhost:9515")
    .build();
}

export function shutdown()
{
  msedgedriver.stop();
}
