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

import handlebars from "handlebars";
import fs from "fs";
import {Readable} from "stream";
import Vinyl from "vinyl";

export function addDevEnvVersion()
{
  let randNumber = Number(new Date()).toString();

  return new Readable.from([
    new Vinyl({
      contents: Buffer.from(randNumber),
      path: "devenvVersion__"
    })
  ]);
}

export async function addTestsPage(templateData)
{
  let file = await fs.promises.readFile("build/templates/testIndex.html.tmpl");
  let template = handlebars.compile(file.toString());
  let data = template(templateData);

  return new Readable.from([
    new Vinyl({
      contents: Buffer.from(data),
      path: "qunit/index.html"
    })
  ]);
}
