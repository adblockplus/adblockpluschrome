(function()
{
  var filterValidation = require("filterValidation");
  var parseFilter = filterValidation.parseFilter;
  var parseFilters = filterValidation.parseFilters;

  var filterClasses = require("filterClasses");
  var BlockingFilter = filterClasses.BlockingFilter;
  var ElemHideFilter = filterClasses.ElemHideFilter;
  var CommentFilter = filterClasses.CommentFilter;

  module("Filter validation");

  test("Detecting invalid filters", function()
  {
    ok(parseFilter("||example.com^$unknown").error, "unknown option");
    ok(parseFilter("[foobar]").error, "filter list header");
    ok(parseFilter("##[foo").error, "invalid selector");
    ok(/\b4\b/.test(parseFilters("!comment\r\n||example.com^\n\n##/").error), "error contains corresponding line number");
  });

  test("Allowing valid filters", function()
  {
    var text, filter;

    text = "||example.com^";
    filter = parseFilter(text).filter;
    ok(filter instanceof BlockingFilter, "blocking filter parsed");
    equal(filter.text, text, "blocking filter text matches");

    text = '##div:first-child a[src="http://example.com"] > .foo + #bar'
    filter = parseFilter(text).filter;
    ok(filter instanceof ElemHideFilter, "elemhide filter parsed");
    equal(filter.text, text, "elemhide filter text matches");

    text = "! foo bar"
    filter = parseFilter(text).filter;
    ok(filter instanceof CommentFilter, "comment filter parsed");
    equal(filter.text, text, "comment filter text matches");

    equal(parseFilter("").filter, null, "empty filter parsed as 'null'");
  });

  test("Normalizing filters", function()
  {
    var ws = " \t\r\n";

    equal(parseFilter(ws + "@@" + ws + "||" + ws + "example.com" + ws + "^" + ws).filter.text, "@@||example.com^", "unnecessary spaces");
    equal(parseFilter(ws).filter, null, "only spaces");
  });

  test("Parsing multiple filters", function()
  {
    var filters = parseFilters("||example.com^\n \n###foobar\r\n! foo bar\n").filters;

    equal(filters.length, 3, "all filters parsed");

    ok(filters[0] instanceof BlockingFilter, "1st filter is blocking");
    equal(filters[0].text, "||example.com^", "1st filter text matches");

    ok(filters[1] instanceof ElemHideFilter, "2nd filter is elemhide");
    equal(filters[1].text, "###foobar",      "2nd filter text matches");

    ok(filters[2] instanceof CommentFilter,  "3rd filter is comment");
    equal(filters[2].text, "! foo bar",      "3rd filter text matches");
  });

  test("Parsing multiple filters, stripping filter list headers", function()
  {
    var filters = parseFilters("[foobar]\n \n||example.com^\r\n! foo bar\n", true).filters;

    equal(filters.length, 2, "all filters parsed");

    ok(filters[0] instanceof BlockingFilter, "1st filter is blocking");
    equal(filters[0].text, "||example.com^", "1st filter text matches");

    ok(filters[1] instanceof CommentFilter,  "2nd filter is comment");
    equal(filters[1].text, "! foo bar",      "2nd filter text matches");
  });
})();
