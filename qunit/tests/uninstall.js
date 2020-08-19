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

const {analytics} = require("../../adblockpluscore/lib/analytics");
const {filterStorage} = require("../../adblockpluscore/lib/filterStorage");
const {Prefs} = require("../../lib/prefs");
const {setUninstallURL} = require("../../lib/uninstall");

const realSetUninstallURL = browser.runtime.setUninstallURL;

let uninstallURL;
let urlParams = () => new URL(uninstallURL).search.substr(1).split("&");

QUnit.module("Uninstall URL", hooks =>
{
  hooks.beforeEach(assert =>
  {
    browser.runtime.setUninstallURL = url => uninstallURL = url;
    assert.ok(true);
  });
  hooks.afterEach(assert =>
  {
    browser.runtime.setUninstalLURL = realSetUninstallURL;
    assert.ok(true);
  });

  QUnit.test("parameters in uninstall URL", assert =>
  {
    const info = require("info");
    const expectedParams = [
      ["an", info.addonName],
      ["av", info.addonVersion],
      ["ap", info.application],
      ["apv", info.applicationVersion],
      ["p", info.platform],
      ["fv", analytics.getFirstVersion()],
      ["pv", info.platformVersion],
      ["ndc", "0"],
      ["c", "0"],
      ["s", "3"]
    ];
    setUninstallURL();

    let params = urlParams();
    for (let [name, value] of expectedParams)
    {
      value = encodeURIComponent(value);
      assert.ok(
        params.includes(`${name}=${value}`),
        `The parameter '${name}' has the expected value '${value}'`
      );
    }
  });

  QUnit.test("uninstall URL length", assert =>
  {
    const maxLength = 255;
    setUninstallURL();
    assert.ok(
      uninstallURL.length <= maxLength,
      `uninstall URL is not longer than ${maxLength} characters`
    );
  });

  let initialSubscriptions;

  QUnit.module("subscription parameter", {
    beforeEach()
    {
      browser.runtime.setUninstallURL = url => uninstallURL = url;
      initialSubscriptions = Array.from(filterStorage.subscriptions());
    },
    afterEach()
    {
      for (let subscription of initialSubscriptions)
        filterStorage.addSubscription(subscription);
      browser.runtime.setUninstalLURL = realSetUninstallURL;
    }
  });

  QUnit.test("parameter s=0", assert =>
  {
    for (let subscription of initialSubscriptions)
      filterStorage.removeSubscription(subscription);
    setUninstallURL();
    assert.ok(
      urlParams().includes("s=0"),
      "subscription parameter 's' has the expected value '0'"
    );
  });

  QUnit.test("parameter s=1", assert =>
  {
    for (let subscription of initialSubscriptions)
    {
      if (subscription.type != "ads")
        filterStorage.removeSubscription(subscription);
    }
    setUninstallURL();
    assert.ok(
      urlParams().includes("s=1"),
      "subscription parameter 's' has the expected value '1'" + urlParams()
    );
  });

  QUnit.test("parameter s=2", assert =>
  {
    for (let subscription of initialSubscriptions)
    {
      if (subscription.url != Prefs.subscriptions_exceptionsurl)
        filterStorage.removeSubscription(subscription);
    }
    setUninstallURL();
    assert.ok(
      urlParams().includes("s=2"),
      "subscription parameter 's' has the expected value '2'" + urlParams()
    );
  });
});
