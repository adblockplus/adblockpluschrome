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

import assert from "assert";
import {chooseFilterSubscriptions} from "../../lib/subscriptionInit.js";
import subscriptions from "./resources/subscriptions.js";

describe("Subscription initialization", () =>
{
  let origGetUILanguage;
  let language;

  before(() =>
  {
    origGetUILanguage = browser.i18n.getUILanguage;
    browser.i18n.getUILanguage = () => language;
  });

  after(() =>
  {
    browser.i18n.getUILanguage = origGetUILanguage;
  });

  it("chooses default filter subscriptions", () =>
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

  it("falls back to default language", () =>
  {
    language = "sl";

    let subs = chooseFilterSubscriptions(subscriptions);
    assert.ok(subs);
    let sub1 = subs.find(sub => sub.type == "ads");
    assert.ok(sub1);
    assert.deepEqual(sub1.languages, ["en"]);
  });
});
