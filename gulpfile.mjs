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

import gulp from "gulp";
import argparse from "argparse";
import merge from "merge-stream";
import zip from "gulp-vinyl-zip";
import * as tasks from "./build/tasks/index.mjs";
import * as config from "./build/config/index.mjs";
import * as configParser from "./build/configParser.mjs";
import * as gitUtils from "./build/utils/git.mjs";
import url from "url";

let argumentParser = new argparse.ArgumentParser({
  description: "Build the extension"
});

argumentParser.addArgument(
  ["-t", "--target"],
  {
    choices: ["chrome", "gecko"],
    required: true
  }
);
argumentParser.addArgument(
  ["-c", "--channel"],
  {
    choices: ["development", "release"],
    defaultValue: "release"
  }
);
argumentParser.addArgument(["-b", "--build-num"]);
argumentParser.addArgument("--config");
argumentParser.addArgument(["-m", "--manifest"]);

let args = argumentParser.parseKnownArgs()[0];

let targetDir = {
  chrome: "devenv.chrome",
  gecko: "devenv.gecko"
};

async function getBuildSteps(options)
{
  let translations = options.target == "chrome" ?
    tasks.chromeTranslations :
    tasks.translations;
  let buildSteps = [];

  if (options.isDevenv)
  {
    buildSteps.push(
      tasks.addDevEnvVersion(),
      await tasks.addTestsPage(
        {
          scripts: options.tests.scripts,
          addonName: options.webpackInfo.addonName
        }
      )
    );
  }

  buildSteps.push(
    tasks.mapping(options.mapping),
    tasks.webpack({
      webpackInfo: options.webpackInfo,
      version: options.version,
      sourceMapType: options.sourceMapType
    }),
    tasks.createManifest(options.manifest),
    translations(options.translations, options.manifest),
    tasks.createRevision(await gitUtils.getRevision())
  );

  return buildSteps;
}

async function getBuildOptions(isDevenv)
{
  let opts = {
    isDevenv,
    target: args.target,
    channel: args.channel,
    archiveType: args.target == "chrome" ? ".zip" : ".xpi"
  };

  opts.sourceMapType = opts.target == "chrome" ?
                        isDevenv == true ? "inline-cheap-source-maps" : "none" :
                        "source-maps";

  if (args.config)
    configParser.setConfig(await import(url.pathToFileURL(args.config)));
  else
    configParser.setConfig(config);

  let configName = isDevenv && configParser.hasTarget(`${opts.target}Dev`) ?
                    `${opts.target}Dev` :
                    opts.target;

  opts.webpackInfo = configParser.getSection(configName, "webpack");
  opts.mapping = configParser.getSection(configName, "mapping");
  opts.tests = configParser.getSection(configName, "tests");
  opts.version = configParser.getSection(configName, "version");
  opts.translations = configParser.getSection(configName, "translations");

  if (isDevenv)
  {
    opts.output = gulp.dest(targetDir[opts.target]);
  }
  else
  {
    if (opts.channel == "development")
    {
      opts.version = args["build_num"] ?
        opts.version.concat(".", args["build_num"]) :
        opts.version.concat(".", await gitUtils.getBuildnum());
    }

    opts.output = zip.dest(
      `${opts.webpackInfo.addonName}-${opts.version}${opts.archiveType}`
    );
  }

  opts.manifest = await tasks.getManifestContent({
    target: opts.target,
    version: opts.version,
    channel: opts.channel,
    path: args.manifest
  });

  return opts;
}

async function buildDevenv()
{
  let options = await getBuildOptions(true);

  return merge(await getBuildSteps(options))
    .pipe(options.output);
}

async function buildPacked()
{
  let options = await getBuildOptions(false);

  return merge(await getBuildSteps(options))
    .pipe(options.output);
}

export let devenv = gulp.series(
  tasks.cleanDir(targetDir[args.target]),
  tasks.buildUI,
  buildDevenv
);

export let build = gulp.series(
  tasks.buildUI,
  buildPacked
);

function startWatch()
{
  gulp.watch(
    [
      "*.js",
      "*.html",
      "qunit/**",
      "lib/*",
      "ext/*",
      "adblockpluscore/lib/*",
      "adblockplusui/*.js",
      "!gulpfile.js"
    ],
    {
      ignoreInitial: false
    },
    gulp.series(
      tasks.cleanDir(targetDir[args.target]),
      buildDevenv
    )
  );
}

export let watch = gulp.series(
  tasks.buildUI,
  startWatch
);
