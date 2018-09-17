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
  const {extractHostFromFrame, isThirdParty} = require("../../lib/url");
  const {platform} = require("info");

  QUnit.module("URL/host tools");

  test("Extracting hostname from frame", () =>
  {
    function testFrameHostname(hierarchy, expectedHostname, message)
    {
      let frame = null;

      for (let url of hierarchy)
        frame = {parent: frame, url: new URL(url)};

      equal(extractHostFromFrame(frame), expectedHostname, message);
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

    // Currently there are two bugs in Microsoft Edge (EdgeHTML 17.17134)
    // that would make this two assertions fail,
    // so for now we are not running them on this platform.
    // See:
    // with punycode: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/18861990/
    // with auth credentials: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8004284/
    if (platform != "edgehtml")
    {
      testFrameHostname(["http://xn--f-1gaa.com/"], "xn--f-1gaa.com",
                        "with punycode");
      testFrameHostname(["http://user:password@example.com/"], "example.com",
                        "with auth credentials");
    }
  });

  test("Third-party checks", () =>
  {
    function hostnameToURL(hostname)
    {
      return new URL("http://" + hostname);
    }

    function testThirdParty(requestHost, documentHost, expected, message)
    {
      equal(
        isThirdParty(
          hostnameToURL(requestHost),

          // Chrome's URL object normalizes IP addresses. So some test
          // will fail if we don't normalize the document host as well.
          hostnameToURL(documentHost).hostname
        ),
        expected,
        message
      );
    }

    testThirdParty("foo", "foo", false, "same domain isn't third-party");
    testThirdParty("foo", "bar", true, "different domain is third-party");
    testThirdParty("foo.com", "foo.com", false,
                   "same domain with TLD (.com) isn't third-party");
    testThirdParty("foo.com", "bar.com", true,
                   "same TLD (.com) but different domain is third-party");
    testThirdParty("foo.com", "www.foo.com", false,
                   "same domain but differend subdomain isn't third-party");
    testThirdParty("foo.example.com", "bar.example.com", false,
                   "same basedomain (example.com) isn't third-party");
    testThirdParty("foo.uk", "bar.uk", true,
                   "same TLD (.uk) but different domain is third-party");
    testThirdParty("foo.co.uk", "bar.co.uk", true,
                   "same TLD (.co.uk) but different domain is third-party");
    testThirdParty("foo.example.co.uk", "bar.example.co.uk", false,
                   "same basedomain (example.co.uk) isn't third-party");
    testThirdParty("1.2.3.4", "1.2.3.4", false,
                   "same IPv4 address isn't third-party");
    testThirdParty("1.1.1.1", "2.1.1.1", true,
                   "different IPv4 address is third-party");
    testThirdParty("0x01ff0101", "0x01ff0101", false,
                   "same IPv4 hexadecimal address isn't third-party");
    testThirdParty("0x01ff0101", "0x01ff0102", true,
                   "different IPv4 hexadecimal address is third-party");
    testThirdParty(
      "1.0xff.3.4", "1.0xff.3.4", false,
      "same IPv4 address with hexadecimal octet isn't third-party"
    );
    testThirdParty(
      "1.0xff.1.1", "2.0xff.1.1", true,
      "different IPv4 address with hexadecimal octet is third-party"
    );
    testThirdParty(
      "0xff.example.com", "example.com", false,
      "domain starts like a hexadecimal IPv4 address but isn't one"
    );
    testThirdParty(
      "[2001:db8:85a3::8a2e:370:7334]", "[2001:db8:85a3::8a2e:370:7334]", false,
      "same IPv6 address isn't third-party"
    );
    testThirdParty(
      "[2001:db8:85a3::8a2e:370:7334]", "[5001:db8:85a3::8a2e:370:7334]", true,
      "different IPv6 address is third-party"
    );
    testThirdParty(
      "[::ffff:192.0.2.128]", "[::ffff:192.0.2.128]", false,
      "same IPv4-mapped IPv6 address isn't third-party"
    );
    testThirdParty(
      "[::ffff:192.0.2.128]", "[::ffff:192.1.2.128]", true,
      "different IPv4-mapped IPv6 address is third-party"
    );
    testThirdParty("xn--f-1gaa.com", "f\u00f6\u00f6.com", false,
                   "same IDN isn't third-party");
    testThirdParty("example.com..", "example.com....", false,
                   "traling dots are ignored");
  });
}
