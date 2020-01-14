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
const request = require("request");

const CWS_URL = "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=32&acceptformat=crx3&x=id%3D";

let parser = new ArgumentParser({
  description: "Download an Adblock Plus build from the Chrome Web Store."
});

parser.addArgument(
  "extension-id",
  {help: "The id of the extension."}
);

let args = parser.parseArgs();

let url = `${CWS_URL}${args["extension-id"]}%26uc`;

let r = request(url).on("response", response =>
{
  if (response.statusCode != 200)
  {
    throw new Error("Request failed with status code " +
                    response.statusCode);
  }

  const filenamePrefix = "adblockpluschrome-";
  let remoteFilename = path.basename(response.request.path);
  let filename = remoteFilename.replace("extension_", filenamePrefix)
                               .replace(/_/g, ".");

  r.pipe(fs.createWriteStream(filename));
});
