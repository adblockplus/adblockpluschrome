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

const fs = require("fs");
const path = require("path");

const {ArgumentParser} = require("argparse");
const got = require("got");

const CWS_URL = "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=32&acceptformat=crx3&x=id%3D";

let parser = new ArgumentParser({
  description: "Download an Adblock Plus build from the Chrome Web Store."
});

parser.addArgument(
  "extension-id",
  {help: "The id of the extension."}
);

let args = parser.parseArgs();
let stream = got.stream(`${CWS_URL}${args["extension-id"]}%26uc`);

stream.on("response", response =>
{
  let remoteFilename = path.basename(response.req.path);
  let filename = remoteFilename.replace("extension_", "adblockpluschrome-")
                               .replace(/_/g, ".");

  stream.pipe(fs.createWriteStream(filename));
});

stream.on("error", error =>
{
  console.error(error);
  process.exit(1);
});
