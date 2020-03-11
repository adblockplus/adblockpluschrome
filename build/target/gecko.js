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
const {compile} = require("handlebars");
const signAddon = require("sign-addon").default;
const {promisify} = require("util");
const fs = require("fs");
const {cycleBuilds} = require("../buildlist.js");

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const INDEXTEMPLATE = "./build/templates/nightlies.html.tmpl";
const STABLEURL = "https://addons.mozilla.org/firefox/addon/adblock-plus/";
const STABLEURLLABLE = "Mozilla Add-ons";
const UPDATEURL = "https://downloads.adblockplus.org/devbuilds/" +
                  "adblockplusfirefox/";

exports.addArguments = function(parser)
{
  parser.addArgument(["-p", "--package"], {required: true});
  parser.addArgument(["-c", "--credentials"], {required: true});
  parser.addArgument(["-t", "--target"], {defaultValue: "dist"});
  parser.addArgument(["-r", "--revision"], {required: true});
  parser.addArgument(
    ["-u", "--url-changelog"],
    {defaultValue: "https://gitlab.com/eyeo/adblockplus/adblockpluschrome/" +
                   "commits/"
    }
  );
  parser.addArgument(
    ["-n", "--name"],
    {defaultValue: "Adblock Plus for Firefox"}
  );
};


function renderBuildList(name, urlChangelog, buildList, target)
{
  let targetFileName = path.join(target, "index.html");

  return readFileAsync(INDEXTEMPLATE, "utf-8").then(data =>
  {
    let template = compile(data, {strict: true});
    let context = {
      commitUrl: urlChangelog,
      config:
      {
        name,
        stableUrl: STABLEURL,
        stableUrlLable: STABLEURLLABLE
      },
      list: buildList
    };

    return writeFileAsync(targetFileName, template(context));
  });
}

function metadataFromPython(section, option)
{
  return new Promise((resolve, reject) =>
  {
    exec(
      "python -c \"" +
        "from buildtools.chainedconfigparser import ChainedConfigParser; " +
        "p = ChainedConfigParser(); " +
        "p.read('metadata.gecko'); " +
        `print p.get('${section}', '${option}')"`,
      (error, stdout, stderr) =>
      {
        if (error)
        {
          console.error(stderr);
          reject(error);
        }
        else
        {
          resolve(stdout.trim());
        }
      }
    );
  });
}

exports.run = function(args)
{
  let version = path.parse(args.package).name.split("-").pop();
  let symLinkName = path.join(args.target, "00latest.xpi");

  Promise.all([
    metadataFromPython("general", "app_id_devbuild"),
    metadataFromPython("compat", "gecko")
  ]).then(([appId, minGeckoVersion]) =>
  {
    readFileAsync(path.resolve(args.credentials)).then(fileContent =>
    {
      let {AMO_KEY: apiKey, AMO_SECRET: apiSecret} = JSON.parse(fileContent);
      return signAddon({
        xpiPath: args.package,
        channel: "unlisted",
        id: appId,
        downloadDir: args.target,
        version, apiKey, apiSecret
      });
    }).then(result =>
    {
      // signAddon writes failure reasons directly to the shell, so we don't
      // have to take care about logging the error messages.
      if (!result.success)
        process.exit(1);

      return path.basename(result.downloadedFiles[0]);
    }).then(filename =>
    {
      try
      {
        fs.unlinkSync(symLinkName);
      }
      catch (err)
      {
        // Ignore a missing "00latest.xpi"
      }
      fs.symlinkSync(filename, symLinkName);

      return Promise.all([
        cycleBuilds(args.target, {
          version, filename,
          commit: args.revision,
          timeCreated: new Date().toISOString().replace("T", " ")
                                               .replace(/:[^:]+$/, ""),
          fileSize: (fs.statSync(path.join(args.target, filename))
                     .size / 1000000.0).toFixed(2)
        }),
        writeFileAsync(
          path.join(args.target, "updates.json"),
          JSON.stringify({
            addons: {
              [appId]: {
                updates: [{
                  version,
                  update_link: UPDATEURL + path.basename(filename),
                  applications: {
                    gecko: {
                      strict_min_version: minGeckoVersion
                    }
                  }
                }]
              }
            }
          })
        )
      ]);
    }).then(([buildList]) =>
      renderBuildList(args.name, args.url_changelog, buildList, args.target)
    );
  }).catch(err =>
  {
    console.error(err);
    process.exit(1);
  });
};
