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

import argparse from "argparse";
import path from "path";
import fs from "fs";

(async() =>
{
  let parser = new argparse.ArgumentParser({
    help: "Deploy an Adblock Plus development build."
  });
  let subParser = parser.addSubparsers({
    title: "Platforms",
    dest: "platform_name"
  });

  let dirname = path.join("build", "target");
  let platforms = {};
  for (let filename of await fs.promises.readdir(dirname))
  {
    let target = path.parse(filename).name;
    let platformSubParser = subParser.addParser(target, {addHelp: true});
    let module = await import(path.resolve(dirname, filename));
    module.addArguments(platformSubParser);
    platforms[target] = module;
  }

  let args = parser.parseArgs();
  platforms[args.platform_name].run(args);
})();
