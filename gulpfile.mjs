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
import del from "del";
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
  {choices: ["chrome", "firefox"]}
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

let targetDir = `devenv.${args.target}`;

async function getBuildSteps(options)
{
  let translations = options.target == "chrome" ?
    tasks.chromeTranslations :
    tasks.translations;
  let buildSteps = [];
  let addonName = `${options.basename}${options.target}`;

  if (options.isDevenv)
  {
    buildSteps.push(
      tasks.addDevEnvVersion(),
      await tasks.addTestsPage({scripts: options.tests.scripts, addonName})
    );
  }

  buildSteps.push(
    tasks.mapping(options.mapping),
    tasks.webpack({
      webpackInfo: options.webpackInfo,
      addonName,
      addonVersion: options.version,
      sourceMapType: options.sourceMapType
    }),
    tasks.createManifest(options.manifest),
    translations(options.translations, options.manifest)
  );

  return buildSteps;
}

async function getBuildOptions(isDevenv, isSource)
{
  if (!isSource && !args.target)
    argumentParser.error("Argument \"-t/--target\" is required");

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

  let configName;
  if (isSource)
    configName = "base";
  else if (isDevenv && configParser.hasTarget(`${opts.target}Dev`))
    configName = `${opts.target}Dev`;
  else
    configName = opts.target;

  opts.webpackInfo = configParser.getSection(configName, "webpack");
  opts.mapping = configParser.getSection(configName, "mapping");
  opts.tests = configParser.getSection(configName, "tests");
  opts.basename = configParser.getSection(configName, "basename");
  opts.version = configParser.getSection(configName, "version");
  opts.translations = configParser.getSection(configName, "translations");

  if (isDevenv)
  {
    opts.output = gulp.dest(targetDir);
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
      `${opts.basename}${opts.target}-${opts.version}${opts.archiveType}`
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

function cleanDir()
{
  return del(targetDir);
}

export let devenv = gulp.series(
  cleanDir,
  tasks.buildUI,
  buildDevenv
);

export let build = gulp.series(
  tasks.buildUI,
  buildPacked
);

export async function source()
{
  let options = await getBuildOptions(false, true);
  return tasks.sourceDistribution(`${options.basename}-${options.version}`);
}

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
      cleanDir,
      buildDevenv
    )
  );
}

export let watch = gulp.series(
  tasks.buildUI,
  startWatch
);
