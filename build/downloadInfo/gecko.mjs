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

import got from "got";

const AMO_URL_PREFIX = "https://addons.mozilla.org/api/v4/addons/addon/";
const AMP_URL_SUFFIX = "/?appversion=current_version";

// See https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#detail
export async function getLatestFileUrl(extensionId)
{
  let body = await got.get(
    `${AMO_URL_PREFIX}${extensionId}${AMP_URL_SUFFIX}`
  ).json();
  return body["current_version"]["files"][0]["url"];
}

export function filenameFormat(remoteFileName)
{
  return remoteFileName.replace("adblock_plus", "adblockplusfirefox")
                       .replace("-an+fx", "")
                       .replace(/\.xpi.+/g, ".xpi");
}
