"use strict";

{
  const {Filter, ElemHideFilter} = require("filterClasses");
  const {escapeCSS, quoteCSS} = require("filterComposer");

  module("CSS escaping");

  test("CSS escaping", () =>
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
      {
        ok(false, opts.selector + " (not allowed in elemhide filters)");
      }
      else
      {
        if (mustMatch)
          equal(foundElement, element, opts.selector);
        else
          ok(true, opts.selector);
      }
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

    // Test some non-ASCII characters. However, those shouldn't require escaping.
    testEscape("\uD83D\uDE3B\u2665\u00E4");
  });
}
