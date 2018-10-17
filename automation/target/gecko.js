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

const path = require("path");
const {exec} = require("child_process");
const signAddon = require("sign-addon").default;
const {promisify} = require("util");
const fs = require("fs");
const mv = require("mv");

const readFileAsync = promisify(fs.readFile);
const mvFileAsync = promisify(mv);

exports.addArguments = function(parser)
{
  parser.addArgument(["-p", "--package"], {required: true});
  parser.addArgument(["-c", "--credentials"], {required: true});
  parser.addArgument(["-t", "--target"], {defaultValue: "dist"});
};

exports.run = function(args)
{
  let appIdFromPython = new Promise((resolve, reject) =>
  {
    exec(
      "python -c \"" +
        "from buildtools.chainedconfigparser import ChainedConfigParser; " +
        "p = ChainedConfigParser(); " +
        "p.read('metadata.gecko'); " +
        "print p.get('general', 'app_id_devbuild')\"",
      (error, stdout, stderr) =>
      {
        if (error)
        {
          console.error(stderr);
          reject(error);
        }
        else
          resolve(stdout.trim());
      }
    );
  });

  Promise.all([
    appIdFromPython,
    readFileAsync(path.resolve(args.credentials))
  ]).then(([appId, fileContent]) =>
  {
    let auth = JSON.parse(fileContent);
    let extension = path.extname(args.package);
    let version = args.package.replace(extension, "").split("-");
    version = version[version.length - 1];

    return signAddon({
      xpiPath: args.package,
      version,
      apiKey: auth["AMO_KEY"],
      apiSecret: auth["AMO_SECRET"],
      channel: "unlisted",
      id: appId
    });
  }).then(result =>
  {
    // signAddon writes failure reasons directly to the shell, so we don't have
    // to take care about logging the error messages.
    if (!result.success)
      process.exit(1);

    let fullName = result.downloadedFiles[0];
    let newName = path.join(args.target, path.basename(fullName));

    return mvFileAsync(fullName, newName, {mkdirp: true});
  }).catch(err =>
  {
    console.error(err);
    process.exit(1);
  });
};
