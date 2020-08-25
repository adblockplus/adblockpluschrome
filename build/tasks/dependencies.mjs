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
import fs from "fs";
import {promisify} from "util";
import glob from "glob";
import {exec} from "child_process";
import {Readable} from "stream";
import Vinyl from "vinyl";

async function getMTime(file)
{
  return (await fs.promises.stat(file)).mtimeMs;
}

function createBuild()
{
  return (promisify(exec))("bash -c \"npm run --prefix adblockplusui/ dist\"");
}

async function mustBuildUI(lastUIBuildTime)
{
  let matches = await (promisify(glob))(
    "adblockplusui/**",
    {
      ignore: ["**/node_modules/**"]
    }
  );

  return await new Promise((resolve, reject) =>
  {
    Promise.all(matches.map(filename =>
      getMTime(filename).then(mtime =>
      {
        if (mtime > lastUIBuildTime)
          resolve(true);
      })
    )).then(() => { resolve(false); }, reject);
  });
}

function updateLastUIBuildTime()
{
  return fs.promises.utimes(".last_ui_build", new Date(), new Date());
}

function createLastUIBuildTime()
{
  return new Readable.from([
    new Vinyl({
      path: ".last_ui_build",
      contents: Buffer.from("")
    })
  ]).pipe(gulp.dest("."));
}

export async function buildUI(cb)
{
  let lastUIBuildTime;

  try
  {
    lastUIBuildTime = await getMTime(".last_ui_build");
  }
  catch (e)
  {
    await createBuild();
    return createLastUIBuildTime();
  }

  if (await mustBuildUI(lastUIBuildTime))
  {
    await createBuild();
    return updateLastUIBuildTime();
  }

  return cb();
}

