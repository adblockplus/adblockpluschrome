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

"use strict";

{
  let {getDecodedHostname,
       extractHostFromFrame,
       stringifyURL,
       isThirdParty} = require("url");

  module("URL/host tools");

  test("Extracting hostname from URL", () =>
  {
    function testURLHostname(url, expectedHostname, message)
    {
      equal(getDecodedHostname(new URL(url)), expectedHostname, message);
    }

    testURLHostname("http://example.com/foo", "example.com", "with path");
    testURLHostname("http://example.com/?foo=bar", "example.com", "with query");
    testURLHostname("http://example.com/#top", "example.com", "with hash");
    testURLHostname("http://example.com:8080/", "example.com", "with port");
    testURLHostname("http://user:password@example.com/", "example.com", "with auth credentials");
    testURLHostname("http://xn--f-1gaa.com/", "f\u00f6\u00f6.com", "with punycode");
    testURLHostname("about:blank", "", "about:blank");
    testURLHostname("data:text/plain,foo", "", "data: URL");
    testURLHostname("ftp://example.com/", "example.com", "ftp: URL");
    testURLHostname("http://1.2.3.4:8000/", "1.2.3.4", "IPv4 address");
    testURLHostname("http://[2001:db8:85a3::8a2e:370:7334]/", "[2001:db8:85a3::8a2e:370:7334]", "IPv6 address");
  });

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
    testFrameHostname(["http://example.com/", "http://example.org/"], "example.org", "with parent frame");
    testFrameHostname(["http://example.com/", "data:text/plain,foo"], "example.com", "data: URL, hostname in parent");
    testFrameHostname(["http://example.com/", "about:blank", "about:blank"], "example.com", "about:blank, hostname in ancestor");
    testFrameHostname(["about:blank", "about:blank"], "", "about:blank, no hostname");
    testFrameHostname(["http://xn--f-1gaa.com/"], "f\u00f6\u00f6.com", "with punycode");
  });

  test("Stringifying URLs", () =>
  {
    function testNormalizedURL(url, expectedURL, message)
    {
      equal(stringifyURL(new URL(url)), expectedURL, message);
    }

    function testPreservedURL(url, message)
    {
      testNormalizedURL(url, url, message);
    }

    testPreservedURL("http://example.com/foo", "includes path");
    testPreservedURL("http://example.com/?foo=bar", "includes query");
    testPreservedURL("http://example.com:8080/", "includes port");
    testPreservedURL("http://example.com/?", "with empty query string");
    testNormalizedURL("http://example.com/#top","http://example.com/", "stripped hash");
    testNormalizedURL("http://example.com/#top?", "http://example.com/", "stripped hash with trailing question mark");
    testNormalizedURL("http://xn--f-1gaa.com/","http://f\u00f6\u00f6.com/", "decoded punycode");
    testPreservedURL("about:blank", "about:blank");
    testPreservedURL("data:text/plain,foo", "data: URL");
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
          getDecodedHostname(hostnameToURL(documentHost))
        ),
        expected,
        message
      );
    }

    testThirdParty("foo", "foo", false, "same domain isn't third-party");
    testThirdParty("foo", "bar", true, "different domain is third-party");
    testThirdParty("foo.com", "foo.com", false, "same domain with TLD (.com) isn't third-party");
    testThirdParty("foo.com", "bar.com", true, "same TLD (.com) but different domain is third-party");
    testThirdParty("foo.com", "www.foo.com", false, "same domain but differend subdomain isn't third-party");
    testThirdParty("foo.example.com", "bar.example.com", false, "same basedomain (example.com) isn't third-party");
    testThirdParty("foo.uk", "bar.uk", true, "same TLD (.uk) but different domain is third-party");
    testThirdParty("foo.co.uk", "bar.co.uk", true, "same TLD (.co.uk) but different domain is third-party");
    testThirdParty("foo.example.co.uk", "bar.example.co.uk", false, "same basedomain (example.co.uk) isn't third-party");
    testThirdParty("1.2.3.4", "1.2.3.4", false, "same IPv4 address isn't third-party");
    testThirdParty("1.1.1.1", "2.1.1.1", true, "different IPv4 address is third-party");
    testThirdParty("0x01ff0101", "0x01ff0101", false, "same IPv4 hexadecimal address isn't third-party");
    testThirdParty("0x01ff0101", "0x01ff0102", true, "different IPv4 hexadecimal address is third-party");
    testThirdParty("1.0xff.3.4", "1.0xff.3.4", false, "same IPv4 address with hexadecimal octet isn't third-party");
    testThirdParty("1.0xff.1.1", "2.0xff.1.1", true, "different IPv4 address with hexadecimal octet is third-party");
    testThirdParty("0xff.example.com", "example.com", false, "domain starts like a hexadecimal IPv4 address but isn't one");
    testThirdParty("[2001:db8:85a3::8a2e:370:7334]", "[2001:db8:85a3::8a2e:370:7334]", false, "same IPv6 address isn't third-party");
    testThirdParty("[2001:db8:85a3::8a2e:370:7334]", "[5001:db8:85a3::8a2e:370:7334]", true, "different IPv6 address is third-party");
    testThirdParty("[::ffff:192.0.2.128]", "[::ffff:192.0.2.128]", false, "same IPv4-mapped IPv6 address isn't third-party");
    testThirdParty("[::ffff:192.0.2.128]", "[::ffff:192.1.2.128]", true, "different IPv4-mapped IPv6 address is third-party");
    testThirdParty("xn--f-1gaa.com", "f\u00f6\u00f6.com", false, "same IDN isn't third-party");
    testThirdParty("example.com..", "example.com....", false, "traling dots are ignored");
  });
}
