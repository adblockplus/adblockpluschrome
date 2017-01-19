/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2016 Eyeo GmbH
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

/** @module tldjs */

"use strict";

let getDomain =
/**
 * Get the base domain for given hostname.
 *
 * @param {string} hostname
 * @return {string}
 */
exports.getDomain = hostname =>
{
  let bits = hostname.split(".");
  let cutoff = bits.length - 2;

  for (let i = 0; i < bits.length; i++)
  {
    let offset = publicSuffixes[bits.slice(i).join(".")];

    if (typeof offset != "undefined")
    {
      cutoff = i - offset;
      break;
    }
  }

  if (cutoff <= 0)
    return hostname;

  return bits.slice(cutoff).join(".");
}
