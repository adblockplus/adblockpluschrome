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
import {Filter, ElemHideFilter}
  from "../../adblockpluscore/lib/filterClasses.js";
import {escapeCSS, quoteCSS} from "../../lib/filterComposer.js";

describe("CSS escaping", () =>
{
  it("escapes CSS", () =>
  {
    function testSelector(opts)
    {
      let mustMatch = opts.mustMatch !== false;
      let doc = document.implementation.createHTMLDocument();

      let style = doc.createElement("style");
      doc.documentElement.appendChild(style);
      style.sheet.insertRule(opts.selector + " {}", 0);

      let element;
      try
      {
        element = doc.createElement(opts.tagName || "div");
      }
      catch (e)
      {
        // Some characters we are going to test can not occur in tag names,
        // but we still have to make sure that no exception is thrown when
        // calling .querySelector() and .insertRule()
        element = null;
        mustMatch = false;
      }

      if (element)
      {
        for (let attr in opts.attributes)
          element.setAttribute(attr, opts.attributes[attr]);

        doc.documentElement.appendChild(element);
      }

      let foundElement = doc.querySelector(opts.selector);
      let filter = Filter.fromText("##" + opts.selector);

      if (!(filter instanceof ElemHideFilter))
        assert.ok(false, opts.selector + " (not allowed in elemhide filters)");
      else if (mustMatch)
        assert.equal(foundElement, element, opts.selector);
      else
        assert.ok(true, opts.selector);
    }

    function testEscape(s)
    {
      testSelector({
        selector: escapeCSS(s),
        tagName: s
      });

      testSelector({
        selector: "#" + escapeCSS(s),
        attributes: {id: s}
      });

      testSelector({
        selector: "." + escapeCSS(s),
        attributes: {class: s},

        // Whitespace characters split the class name, hence the selector
        // won't match. But we still have to make sure that no exception
        // is thrown when calling .querySelector() and .insertRule()
        mustMatch: !/\s/.test(s)
      });

      testSelector({
        selector: "[foo=" + quoteCSS(s) + "]",
        attributes: {foo: s}
      });
    }

    for (let i = 1; i < 0x80; i++)
    {
      let chr = String.fromCharCode(i);

      // Make sure that all ASCII characters are correctly escaped.
      testEscape(chr);

      // Some characters are only escaped when in the first positon,
      // so we still have to make sure that everything is correctly escaped
      // in subsequent positions.
      testEscape("x" + chr);

      // Leading dashes must be escaped, when followed by certain characters.
      testEscape("-" + chr);
    }

    // Test some non-ASCII characters. However, those shouldn't
    // require escaping.
    testEscape("\uD83D\uDE3B\u2665\u00E4");
  });
});
