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

{
  const {analytics} = require("../../adblockpluscore/lib/analytics");
  const {setUninstallURL} = require("../../lib/uninstall");

  const realSetUninstallURL = browser.runtime.setUninstallURL;
  let uninstallURL;

  QUnit.module("Uninstall Link", {
    beforeEach()
    {
      browser.runtime.setUninstallURL = url => uninstallURL = url;
    },
    afterEach()
    {
      browser.runtime.setUninstalLURL = realSetUninstallURL;
    }
  });

  QUnit.test("firstVersion parameter in uninstall URL", assert =>
  {
    setUninstallURL();

    let params = new URL(uninstallURL).search.substr(1).split("&");
    let firstVersion = analytics.getFirstVersion();

    assert.ok(
      params.includes("fv=" + encodeURIComponent(firstVersion)),
      "The firstVersion parameter is included correctly"
    );
  });
}
