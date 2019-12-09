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
  let {chooseFilterSubscriptions} = require("../../lib/subscriptionInit");

  QUnit.module("Subscription", {
    setup()
    {
      browser.i18n.getUILanguage = () => "en";
    }
  });


  test("Choosing filter subscriptions", assert =>
  {
    let subs = chooseFilterSubscriptions(require("../subscriptions.json"));
    assert.ok(subs);
    assert.ok(subs.has("circumvention"));
    assert.ok(subs.has("ads"));

    assert.deepEqual(subs.get("circumvention").languages,
                     ["de", "en", "en-US"]);
    assert.equal(subs.get("circumvention").type, "circumvention");
    assert.deepEqual(subs.get("ads").languages, ["en"]);
    assert.equal(subs.get("ads").type, "ads");
  });
}
