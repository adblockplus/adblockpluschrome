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

const {extractHostFromFrame} = require("../../lib/url");

QUnit.module("URL/host tools", () =>
{
  QUnit.test("Extracting hostname from frame", assert =>
  {
    function testFrameHostname(hierarchy, expectedHostname, message)
    {
      let frame = null;

      for (let url of hierarchy)
        frame = {parent: frame, url: new URL(url)};

      assert.equal(extractHostFromFrame(frame), expectedHostname, message);
    }

    testFrameHostname(["http://example.com/"], "example.com", "single frame");
    testFrameHostname(["http://example.com/", "http://example.org/"],
                      "example.org", "with parent frame");
    testFrameHostname(["http://example.com/", "data:text/plain,foo"],
                      "example.com", "data: URL, hostname in parent");
    testFrameHostname(["http://example.com/", "about:blank", "about:blank"],
                      "example.com", "about:blank, hostname in ancestor");
    testFrameHostname(["about:blank", "about:blank"], "",
                      "about:blank, no hostname");
    testFrameHostname(["http://xn--f-1gaa.com/"], "xn--f-1gaa.com",
                      "with punycode");
    testFrameHostname(["http://user:password@example.com/"], "example.com",
                      "with auth credentials");
  });
});
