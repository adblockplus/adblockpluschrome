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
      let {Utils} = require("../../lib/utils");
      Object.defineProperty(Utils, "appLocale",
                            {value: "en", enumerable: true});
    }
  });


  test("Choosing filter subscriptions", assert =>
  {
    let done = assert.async();
    fetch("subscriptions.xml")
      .then(response => response.text())
      .then(text =>
      {
        let doc = new DOMParser().parseFromString(text, "application/xml");
        let nodes = doc.getElementsByTagName("subscription");

        let subs = chooseFilterSubscriptions(nodes);
        assert.ok(subs);
        assert.ok(subs.circumvention);
        assert.ok(subs.ads);

        assert.equal(subs.circumvention.getAttribute("prefixes"),
                     "de,en,en-US");
        assert.equal(subs.circumvention.getAttribute("type"), "circumvention");
        assert.equal(subs.ads.getAttribute("prefixes"), "en");
        assert.equal(subs.ads.getAttribute("type"), "ads");

        done();
      })
      .catch(() =>
      {
        assert.ok(false);

        done();
      });
  });
}
