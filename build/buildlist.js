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

const {promisify} = require("util");
const fs = require("fs");
const path = require("path");
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

const FILENAME = "build_list.json";
const MAXKEPTBUILDS = 150;


/**
 * Shift a new build into the list of builds and drop the oldest one. Also
 * remove the actual file of the oldest build.
 * @param {string} folder - the folder where builds and the build_list.json are
 * stored.
 * @param {string} newBuild - the newly added Build.
 * @return {object} the update build_list as a JSON object.
 */
exports.cycleBuilds = function(folder, newBuild)
{
  let absFilename = path.join(folder, FILENAME);
  return Promise.resolve(
    readFileAsync(absFilename).then(JSON.parse).catch(err =>
    {
      console.warn(`WARNING: Could not read ${absFilename}`);
      return [];
    })
  ).then(buildList =>
  {
    buildList.unshift(newBuild);

    return Promise.all(
     buildList.splice(MAXKEPTBUILDS)
       .map(({filename}) => unlinkAsync(path.join(folder, filename)))
    ).then(() => writeFileAsync(absFilename, JSON.stringify(buildList)
    ).then(() => buildList));
  });
};
