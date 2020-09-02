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

import fs from "fs";
import path from "path";
import argparse from "argparse";
import got from "got";

(async() =>
{
  let parser = new argparse.ArgumentParser({
    description: "Download an Adblock Plus build from the Chrome Web Store."
  });

  parser.addArgument(
    "extension-id",
    {help: "The id of the extension."}
  );

  parser.addArgument(
    ["-p", "--platform"],
    {choices: ["gecko", "chrome"], default: "chrome"}
  );

  let args = parser.parseArgs();
  let dirname = path.join("build", "downloadInfo");
  let module = await import(path.resolve(dirname, `${args["platform"]}.mjs`));

  let downloadUrl = await module.getLatestFileUrl(args["extension-id"]);
  console.error(downloadUrl);
  let stream = got.stream(downloadUrl);

  stream.on("response", response =>
  {
    let remoteFilename = path.basename(response.req.path);
    let filename = module.filenameFormat(remoteFilename);
    stream.pipe(fs.createWriteStream(filename));
  });

  stream.on("error", error =>
  {
    console.error(error);
    process.exit(1);
  });
})();
