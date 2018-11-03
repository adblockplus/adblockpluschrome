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

const {ArgumentParser} = require("argparse");
const fs = require("fs");
const path = require("path");

let platforms = {};

let parser = new ArgumentParser({
  help: "Deploy an Adblock Plus development build."
});
let subParser = parser.addSubparsers({
  title: "Platforms",
  dest: "platform_name"
});

for (let file of fs.readdirSync(path.resolve("build/target/")))
{
  let target = path.basename(file, ".js");
  let platformSubParser = subParser.addParser(target, {addHelp: true});
  let module = require(path.resolve(`build/target/${file}`));
  module.addArguments(platformSubParser);
  platforms[target] = module;
}

let args = parser.parseArgs();
platforms[args.platform_name].run(args);
