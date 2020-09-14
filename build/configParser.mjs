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

let configs = {};
let parsedConfigs = {};

function mergeObjectArray(base, override = [])
{
  let result = base.slice(0);

  override.forEach(elem =>
  {
    let commonDest = base.findIndex(baseElem => baseElem.dest == elem.dest);

    if (commonDest != -1)
    {
      result[commonDest] = {
        ...result[commonDest],
        src: removeDuplicates(result[commonDest].src, elem.src)
      };
    }
    else
    {
      result.push(elem);
    }
  });

  return result;
}

function removeDuplicates(base, override = [])
{
  let unique = base.filter(elem =>
  {
    let duplicate = override
      .find(value => value.replace(/!/, "") == elem.replace(/!/, ""));
    return !duplicate;
  });

  return unique.concat(override);
}

function mergeWebpack(base, override)
{
  return {
    alias: {...base.alias, ...override.alias},
    bundles: mergeObjectArray(base.bundles, override.bundles)
  };
}

function mergeTranslations(base, override = {})
{
  return {
    dest: override.dest || base.dest,
    src: removeDuplicates(base.src, override.src)
  };
}

function mergeTests(base = {}, override = {})
{
  let result = {};
  let baseScripts = base.scripts || [];
  let overrideScripts = override.scripts || [];

  result.scripts = [...new Set([...baseScripts, ...overrideScripts])];

  return result;
}

function mergeMapping(base, override = {})
{
  let result = {};

  result.copy = mergeObjectArray(base.copy, override.copy);
  result.rename = mergeObjectArray(base.rename, override.rename);

  return result;
}

function mergeConfig(target)
{
  if (parsedConfigs[target])
    return parsedConfigs[target];

  let config = configs[target];

  if (!config.extends)
  {
    parsedConfigs[target] = {...config};
    parsedConfigs[target].webpack.baseConfig = configs.webpack;

    return parsedConfigs[target];
  }

  let baseConfig = mergeConfig(config.extends);

  let version = config.version || baseConfig.version;
  let webpack = mergeWebpack(baseConfig.webpack, config.webpack);
  let translations = mergeTranslations(
    baseConfig.translations,
    config.translations);

  webpack.baseConfig = configs.webpack;

  parsedConfigs[target] = {
    basename: baseConfig.basename,
    version,
    webpack,
    mapping: mergeMapping(baseConfig.mapping, config.mapping),
    translations,
    tests: mergeTests(baseConfig.tests, config.tests)
  };

  return parsedConfigs[target];
}

export function getSection(target, section)
{
  return mergeConfig(target)[section];
}

export function setConfig(config)
{
  configs = config;
}

export function hasTarget(name)
{
  return !!configs[name];
}
