/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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


(function()
{
  module("URL/host tools");

  test("Host name extraction", function()
  {
    var tests = [
      [null, ""],
      ["/foo/bar", ""],
      ["http://example.com", "example.com"],
      ["http://example.com?foo#bar", "example.com"],
      ["http://example.com#foo?bar", "example.com"],
      ["http://example.com/", "example.com"],
      ["http://example.com:8000/", "example.com"],
      ["http://foo:bar@example.com:8000/foo:bar/bas", "example.com"],
      ["ftp://example.com/", "example.com"],
      ["http://1.2.3.4:8000/", "1.2.3.4"],
      ["http://[2001:0db8:85a3:0000:0000:8a2e:0370:7334]/", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
      ["http://[2001::7334]:8000/test@foo.example.com/bar", "2001::7334"],
    ];

    for (var i = 0; i < tests.length; i++)
      equal(extractHostFromURL(tests[i][0]), tests[i][1], tests[i][0]);
  });

  test("Determining base domain", function()
  {
    var tests = [
      ["com", "com"],
      ["example.com", "example.com"],
      ["www.example.com", "example.com"],
      ["www.example.com.", "example.com"],
      ["www.example.co.uk", "example.co.uk"],
      ["www.example.co.uk.", "example.co.uk"],
      ["www.example.bl.uk", "bl.uk"],
      ["foo.bar.example.co.uk", "example.co.uk"],
      ["1.2.3.4.com", "4.com"],
      ["1.2.3.4.bg", "3.4.bg"],
      ["1.2.3.4", "1.2.3.4"],
      ["1.2.0x3.0x4", "1.2.0x3.0x4"],
      ["1.2.3", "2.3"],
      ["1.2.0x3g.0x4", "0x3g.0x4"],
      ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
      ["2001::7334", "2001::7334"],
      ["::ffff:1.2.3.4", "::ffff:1.2.3.4"],
      ["foo.bar.2001::7334", "bar.2001::7334"],
      ["test.xn--e1aybc.xn--p1ai", "тест.рф"],
    ];

    for (var i = 0; i < tests.length; i++)
      equal(getBaseDomain(tests[i][0]), tests[i][1], tests[i][0]);
  });

  test("Third party checks", function()
  {
    var tests = [
      ["foo", "foo", false],
      ["foo", "bar", true],
      ["foo.com", "bar.com", true],
      ["foo.com", "foo.com", false],
      ["foo.com", "www.foo.com", false],
      ["foo.example.com", "bar.example.com", false],
      ["foo.uk", "bar.uk", true],
      ["foo.co.uk", "bar.co.uk", true],
      ["foo.example.co.uk", "bar.example.co.uk", false],
      ["1.2.3.4", "2.2.3.4", true],
    ];

    for (var i = 0; i < tests.length; i++)
      equal(isThirdParty(tests[i][0], tests[i][1]), tests[i][2], tests[i][0] + " and " + tests[i][1]);
  });
})();
