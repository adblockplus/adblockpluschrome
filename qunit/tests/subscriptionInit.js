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

let {chooseFilterSubscriptions} = require("../../lib/subscriptionInit");

QUnit.module("Subscription initialization", hooks =>
{
  let subscriptions = require("../subscriptions.json");
  let origGetUILanguage;
  let language;

  hooks.before(() =>
  {
    origGetUILanguage = browser.i18n.getUILanguage;
    browser.i18n.getUILanguage = () => language;
  });

  hooks.after(() =>
  {
    browser.i18n.getUILanguage = origGetUILanguage;
  });

  QUnit.test("chooses default filter subscriptions", assert =>
  {
    language = "en";

    let subs = chooseFilterSubscriptions(subscriptions);
    assert.ok(subs);

    let sub1 = subs.find(sub => sub.type == "circumvention");
    assert.ok(sub1);
    let sub2 = subs.find(sub => sub.type == "ads");
    assert.ok(sub1);

    assert.deepEqual(sub1.languages, ["de", "en"]);
    assert.deepEqual(sub2.languages, ["en"]);
  });

  QUnit.test("falls back to default language", assert =>
  {
    language = "sl";

    let subs = chooseFilterSubscriptions(subscriptions);
    assert.ok(subs);
    let sub1 = subs.find(sub => sub.type == "ads");
    assert.ok(sub1);
    assert.deepEqual(sub1.languages, ["en"]);
  });
});
