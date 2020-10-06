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

import through from "through";
import Vinyl from "vinyl";
import path from "path";

const PLUGIN_NAME = "gulp-merge-translations";

function mergeTranslations(options = {})
{
  let merged = {};
  let info;
  let mandatoryInfo = {};
  let fields = options.defaults ? options.defaults.fields : [];

  function getLocaleName(fullPath)
  {
    let parts = fullPath.split(path.sep);

    return parts[parts.length - 2];
  }

  function truncate(text, limit)
  {
    if (text.length <= limit)
      return text;
    return text.slice(0, limit - 1).concat("\u2026");
  }

  function groupByLocale(file)
  {
    if (file.isBuffer())
    {
      try
      {
        let locale = getLocaleName(file.path);
        let content = JSON.parse(file.contents.toString());

        info = info || {
          cwd: file.cwd,
          base: file.base
        };

        if (options.defaults)
        {
          fields.forEach(field =>
          {
            if (content[field.name])
            {
              content[field.name] = {
                message: field.limit ?
                  truncate(content[field.name].message, field.limit) :
                  content[field.name].message,
                description: content[field.name].description
              };

              if (locale == options.defaults.locale)
                mandatoryInfo[field.name] = content[field.name];
            }
          });
        }

        merged[locale] = merged[locale] || {};
        merged[locale] = {...merged[locale], ...content};
      }
      catch (error)
      {
        let msg = `${PLUGIN_NAME} parsing: ${file.path} : ${error.message}`;
        this.emit("error", msg);
      }
    }
  }

  function emitByLocale()
  {
    Object.keys(merged).forEach(localeName =>
    {
      let mergedFile = merged[localeName];

      if (options.defaults)
        mergedFile = {...mandatoryInfo, ...mergedFile};

      this.emit("data", new Vinyl({
        contents: Buffer.from(JSON.stringify(mergedFile, null, 2)),
        cwd: info.cwd,
        base: info.base,
        path: path.join(info.base, localeName, options.fileName)
      }));
    });

    this.emit("end");
  }

  return through(groupByLocale, emitByLocale);
}

export default mergeTranslations;
