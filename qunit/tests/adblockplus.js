/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

//
// This file has been generated automatically from Adblock Plus for Firefox
// source code. DO NOT MODIFY, change the original source code instead.
//
// Relevant repositories:
// * https://hg.adblockplus.org/adblockplustests/
// * https://hg.adblockplus.org/jshydra/
//

(function()
{
  module("Domain restrictions",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });

  function testActive(text, domain, expectedActive, expectedOnlyDomain)
  {
    var filter = Filter.fromText(text);
    equal(filter.isActiveOnDomain(domain), expectedActive, text + " active on " + domain);
    equal(filter.isActiveOnlyOnDomain(domain), expectedOnlyDomain, text + " only active on " + domain);
  }
  test("Unrestricted blocking filters", function()
  {
    testActive("foo", null, true, false);
    testActive("foo", "com", true, false);
    testActive("foo", "example.com", true, false);
    testActive("foo", "example.com.", true, false);
    testActive("foo", "foo.example.com", true, false);
    testActive("foo", "mple.com", true, false);
  });
  test("Unrestricted hiding rules", function()
  {
    testActive("#foo", null, true, false);
    testActive("#foo", "com", true, false);
    testActive("#foo", "example.com", true, false);
    testActive("#foo", "example.com.", true, false);
    testActive("#foo", "foo.example.com", true, false);
    testActive("#foo", "mple.com", true, false);
  });
  test("Domain-restricted blocking filters", function()
  {
    testActive("foo$domain=example.com", null, false, false);
    testActive("foo$domain=example.com", "com", false, true);
    testActive("foo$domain=example.com", "example.com", true, true);
    testActive("foo$domain=example.com", "example.com.", true, true);
    testActive("foo$domain=example.com.", "example.com", true, true);
    testActive("foo$domain=example.com.", "example.com.", true, true);
    testActive("foo$domain=example.com", "foo.example.com", true, false);
    testActive("foo$domain=example.com", "mple.com", false, false);
  });
  test("Domain-restricted hiding rules", function()
  {
    testActive("example.com#foo", null, false, false);
    testActive("example.com#foo", "com", false, true);
    testActive("example.com#foo", "example.com", true, true);
    testActive("example.com#foo", "example.com.", false, false);
    testActive("example.com.#foo", "example.com", false, false);
    testActive("example.com.#foo", "example.com.", true, true);
    testActive("example.com#foo", "foo.example.com", true, false);
    testActive("example.com#foo", "mple.com", false, false);
  });
  test("Blocking filters restricted to domain and its subdomain", function()
  {
    testActive("foo$domain=example.com|foo.example.com", null, false, false);
    testActive("foo$domain=example.com|foo.example.com", "com", false, true);
    testActive("foo$domain=example.com|foo.example.com", "example.com", true, true);
    testActive("foo$domain=example.com|foo.example.com", "example.com.", true, true);
    testActive("foo$domain=example.com|foo.example.com", "foo.example.com", true, false);
    testActive("foo$domain=example.com|foo.example.com", "mple.com", false, false);
  });
  test("Hiding rules restricted to domain and its subdomain", function()
  {
    testActive("example.com,foo.example.com#foo", null, false, false);
    testActive("example.com,foo.example.com#foo", "com", false, true);
    testActive("example.com,foo.example.com#foo", "example.com", true, true);
    testActive("example.com,foo.example.com#foo", "example.com.", false, false);
    testActive("example.com,foo.example.com#foo", "foo.example.com", true, false);
    testActive("example.com,foo.example.com#foo", "mple.com", false, false);
  });
  test("Blocking filters with exception for a subdomain", function()
  {
    testActive("foo$domain=~foo.example.com", null, true, false);
    testActive("foo$domain=~foo.example.com", "com", true, false);
    testActive("foo$domain=~foo.example.com", "example.com", true, false);
    testActive("foo$domain=~foo.example.com", "example.com.", true, false);
    testActive("foo$domain=~foo.example.com", "foo.example.com", false, false);
    testActive("foo$domain=~foo.example.com", "mple.com", true, false);
  });
  test("Hiding rules with exception for a subdomain", function()
  {
    testActive("~foo.example.com#foo", null, true, false);
    testActive("~foo.example.com#foo", "com", true, false);
    testActive("~foo.example.com#foo", "example.com", true, false);
    testActive("~foo.example.com#foo", "example.com.", true, false);
    testActive("~foo.example.com#foo", "foo.example.com", false, false);
    testActive("~foo.example.com#foo", "mple.com", true, false);
  });
  test("Blocking filters for domain but not its subdomain", function()
  {
    testActive("foo$domain=example.com|~foo.example.com", null, false, false);
    testActive("foo$domain=example.com|~foo.example.com", "com", false, true);
    testActive("foo$domain=example.com|~foo.example.com", "example.com", true, true);
    testActive("foo$domain=example.com|~foo.example.com", "example.com.", true, true);
    testActive("foo$domain=example.com|~foo.example.com", "foo.example.com", false, false);
    testActive("foo$domain=example.com|~foo.example.com", "mple.com", false, false);
  });
  test("Hiding rules for domain but not its subdomain", function()
  {
    testActive("example.com,~foo.example.com#foo", null, false, false);
    testActive("example.com,~foo.example.com#foo", "com", false, true);
    testActive("example.com,~foo.example.com#foo", "example.com", true, true);
    testActive("example.com,~foo.example.com#foo", "example.com.", false, false);
    testActive("example.com,~foo.example.com#foo", "foo.example.com", false, false);
    testActive("example.com,~foo.example.com#foo", "mple.com", false, false);
  });
  test("Blocking filters for domain but not its TLD", function()
  {
    testActive("foo$domain=example.com|~com", null, false, false);
    testActive("foo$domain=example.com|~com", "com", false, true);
    testActive("foo$domain=example.com|~com", "example.com", true, true);
    testActive("foo$domain=example.com|~com", "example.com.", true, true);
    testActive("foo$domain=example.com|~com", "foo.example.com", true, false);
    testActive("foo$domain=example.com|~com", "mple.com", false, false);
  });
  test("Hiding rules for domain but not its TLD", function()
  {
    testActive("example.com,~com#foo", null, false, false);
    testActive("example.com,~com#foo", "com", false, true);
    testActive("example.com,~com#foo", "example.com", true, true);
    testActive("example.com,~com#foo", "example.com.", false, false);
    testActive("example.com,~com#foo", "foo.example.com", true, false);
    testActive("example.com,~com#foo", "mple.com", false, false);
  });
  test("Blocking filters restricted to an unrelated domain", function()
  {
    testActive("foo$domain=nnnnnnn.nnn", null, false, false);
    testActive("foo$domain=nnnnnnn.nnn", "com", false, false);
    testActive("foo$domain=nnnnnnn.nnn", "example.com", false, false);
    testActive("foo$domain=nnnnnnn.nnn", "example.com.", false, false);
    testActive("foo$domain=nnnnnnn.nnn", "foo.example.com", false, false);
    testActive("foo$domain=nnnnnnn.nnn", "mple.com", false, false);
  });
  test("Hiding rules restricted to an unrelated domain", function()
  {
    testActive("nnnnnnn.nnn#foo", null, false, false);
    testActive("nnnnnnn.nnn#foo", "com", false, false);
    testActive("nnnnnnn.nnn#foo", "example.com", false, false);
    testActive("nnnnnnn.nnn#foo", "example.com.", false, false);
    testActive("nnnnnnn.nnn#foo", "foo.example.com", false, false);
    testActive("nnnnnnn.nnn#foo", "mple.com", false, false);
  });
})();
(function()
{
  module("Filter classes",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });

  function serializeFilter(filter)
  {
    var result = [];
    result.push("text=" + filter.text);
    if (filter instanceof InvalidFilter)
    {
      result.push("type=invalid");
      if (filter.reason)
      {
        result.push("hasReason");
      }
    }
    else if (filter instanceof CommentFilter)
    {
      result.push("type=comment");
    }
    else if (filter instanceof ActiveFilter)
    {
      result.push("disabled=" + filter.disabled);
      result.push("lastHit=" + filter.lastHit);
      result.push("hitCount=" + filter.hitCount);
      var domains = [];
      if (filter.domains)
      {
        for (var domain in filter.domains)
        {
          if (domain != "")
          {
            domains.push(filter.domains[domain] ? domain : "~" + domain);
          }
        }
      }
      result.push("domains=" + domains.sort().join("|"));
      if (filter instanceof RegExpFilter)
      {
        result.push("regexp=" + filter.regexp.source);
        result.push("contentType=" + filter.contentType);
        result.push("matchCase=" + filter.matchCase);
        result.push("thirdParty=" + filter.thirdParty);
        if (filter instanceof BlockingFilter)
        {
          result.push("type=filterlist");
          result.push("collapse=" + filter.collapse);
        }
        else if (filter instanceof WhitelistFilter)
        {
          result.push("type=whitelist");
        }
      }
      else if (filter instanceof ElemHideBase)
      {
        if (filter instanceof ElemHideFilter)
        {
          result.push("type=elemhide");
        }
        else if (filter instanceof ElemHideException)
        {
          result.push("type=elemhideexception");
        }
        result.push("selectorDomain=" + (filter.selectorDomain || ""));
        result.push("selector=" + filter.selector);
      }
    }
    return result;
  }

  function addDefaults(expected)
  {
    var type = null;
    var hasProperty = {};
    for (var _loopIndex0 = 0; _loopIndex0 < expected.length; ++_loopIndex0)
    {
      var entry = expected[_loopIndex0];
      if (/^type=(.*)/.test(entry))
      {
        type = RegExp.$1;
      }
      else if (/^(\w+)/.test(entry))
      {
        hasProperty[RegExp.$1] = true;
      }
    }

    function addProperty(prop, value)
    {
      if (!(prop in hasProperty))
      {
        expected.push(prop + "=" + value);
      }
    }
    if (type == "whitelist" || type == "filterlist" || type == "elemhide" || type == "elemhideexception")
    {
      addProperty("disabled", "false");
      addProperty("lastHit", "0");
      addProperty("hitCount", "0");
    }
    if (type == "whitelist" || type == "filterlist")
    {
      addProperty("contentType", 2147483647 & ~ (RegExpFilter.typeMap.ELEMHIDE | RegExpFilter.typeMap.DONOTTRACK | RegExpFilter.typeMap.POPUP));
      addProperty("matchCase", "false");
      addProperty("thirdParty", "null");
      addProperty("domains", "");
    }
    if (type == "filterlist")
    {
      addProperty("collapse", "null");
    }
    if (type == "elemhide" || type == "elemhideexception")
    {
      addProperty("selectorDomain", "");
      addProperty("domains", "");
    }
  }

  function compareFilter(text, expected, postInit)
  {
    addDefaults(expected);
    var filter = Filter.fromText(text);
    if (postInit)
    {
      postInit(filter);
    }
    var result = serializeFilter(filter);
    equal(result.sort().join("\n"), expected.sort().join("\n"), text);
    var filter2;
    var buffer = [];
    filter.serialize(buffer);
    if (buffer.length)
    {
      var map =
      {
        __proto__: null
      };
      for (var _loopIndex1 = 0; _loopIndex1 < buffer.slice(1).length; ++_loopIndex1)
      {
        var line = buffer.slice(1)[_loopIndex1];
        if (/(.*?)=(.*)/.test(line))
        {
          map[RegExp.$1] = RegExp.$2;
        }
      }
      filter2 = Filter.fromObject(map);
    }
    else
    {
      filter2 = Filter.fromText(filter.text);
    }
    equal(serializeFilter(filter).join("\n"), serializeFilter(filter2).join("\n"), text + " deserialization");
  }
  test("Filter class definitions", function()
  {
    equal(typeof Filter, "function", "typeof Filter");
    equal(typeof InvalidFilter, "function", "typeof InvalidFilter");
    equal(typeof CommentFilter, "function", "typeof CommentFilter");
    equal(typeof ActiveFilter, "function", "typeof ActiveFilter");
    equal(typeof RegExpFilter, "function", "typeof RegExpFilter");
    equal(typeof BlockingFilter, "function", "typeof BlockingFilter");
    equal(typeof WhitelistFilter, "function", "typeof WhitelistFilter");
    equal(typeof ElemHideBase, "function", "typeof ElemHideBase");
    equal(typeof ElemHideFilter, "function", "typeof ElemHideFilter");
    equal(typeof ElemHideException, "function", "typeof ElemHideException");
  });
  test("Comments", function()
  {
    compareFilter("!asdf", ["type=comment", "text=!asdf"]);
    compareFilter("!foo#bar", ["type=comment", "text=!foo#bar"]);
    compareFilter("!foo##bar", ["type=comment", "text=!foo##bar"]);
  });
  test("Invalid filters", function()
  {
    compareFilter("/??/", ["type=invalid", "text=/??/", "hasReason"]);
    compareFilter("#dd(asd)(ddd)", ["type=invalid", "text=#dd(asd)(ddd)", "hasReason"]);
    {
      var result = Filter.fromText("#dd(asd)(ddd)").reason;
      equal(result, Utils.getString("filter_elemhide_duplicate_id"), "#dd(asd)(ddd).reason");
    }
    compareFilter("#*", ["type=invalid", "text=#*", "hasReason"]);
    {
      var result = Filter.fromText("#*").reason;
      equal(result, Utils.getString("filter_elemhide_nocriteria"), "#*.reason");
    }
  });
  test("Filters with state", function()
  {
    compareFilter("blabla", ["type=filterlist", "text=blabla", "regexp=blabla"]);
    compareFilter("blabla_default", ["type=filterlist", "text=blabla_default", "regexp=blabla_default"], function(filter)
    {
      filter.disabled = false;
      filter.hitCount = 0;
      filter.lastHit = 0;
    });
    compareFilter("blabla_non_default", ["type=filterlist", "text=blabla_non_default", "regexp=blabla_non_default", "disabled=true", "hitCount=12", "lastHit=20"], function(filter)
    {
      filter.disabled = true;
      filter.hitCount = 12;
      filter.lastHit = 20;
    });
  });
  var t = RegExpFilter.typeMap;
  var defaultTypes = 2147483647 & ~ (t.ELEMHIDE | t.DONOTTRACK | t.DOCUMENT | t.POPUP);
  test("Special characters", function()
  {
    compareFilter("/ddd|f?a[s]d/", ["type=filterlist", "text=/ddd|f?a[s]d/", "regexp=ddd|f?a[s]d"]);
    compareFilter("*asdf*d**dd*", ["type=filterlist", "text=*asdf*d**dd*", "regexp=asdf.*d.*dd"]);
    compareFilter("|*asd|f*d**dd*|", ["type=filterlist", "text=|*asd|f*d**dd*|", "regexp=^.*asd\\|f.*d.*dd.*$"]);
    compareFilter("dd[]{}$%<>&()d", ["type=filterlist", "text=dd[]{}$%<>&()d", "regexp=dd\\[\\]\\{\\}\\$\\%\\<\\>\\&\\(\\)d"]);
    compareFilter("@@/ddd|f?a[s]d/", ["type=whitelist", "text=@@/ddd|f?a[s]d/", "regexp=ddd|f?a[s]d", "contentType=" + defaultTypes]);
    compareFilter("@@*asdf*d**dd*", ["type=whitelist", "text=@@*asdf*d**dd*", "regexp=asdf.*d.*dd", "contentType=" + defaultTypes]);
    compareFilter("@@|*asd|f*d**dd*|", ["type=whitelist", "text=@@|*asd|f*d**dd*|", "regexp=^.*asd\\|f.*d.*dd.*$", "contentType=" + defaultTypes]);
    compareFilter("@@dd[]{}$%<>&()d", ["type=whitelist", "text=@@dd[]{}$%<>&()d", "regexp=dd\\[\\]\\{\\}\\$\\%\\<\\>\\&\\(\\)d", "contentType=" + defaultTypes]);
  });
  test("Filter options", function()
  {
    compareFilter("bla$match-case,script,other,third-party,domain=foo.com", ["type=filterlist", "text=bla$match-case,script,other,third-party,domain=foo.com", "regexp=bla", "matchCase=true", "contentType=" + (t.SCRIPT | t.OTHER), "thirdParty=true", "domains=FOO.COM"]);
    compareFilter("bla$~match-case,~script,~other,~third-party,domain=~bar.com", ["type=filterlist", "text=bla$~match-case,~script,~other,~third-party,domain=~bar.com", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.DOCUMENT), "thirdParty=false", "domains=~BAR.COM"]);
    compareFilter("@@bla$match-case,script,other,third-party,domain=foo.com|bar.com|~bar.foo.com|~foo.bar.com", ["type=whitelist", "text=@@bla$match-case,script,other,third-party,domain=foo.com|bar.com|~bar.foo.com|~foo.bar.com", "regexp=bla", "matchCase=true", "contentType=" + (t.SCRIPT | t.OTHER), "thirdParty=true", "domains=BAR.COM|FOO.COM|~BAR.FOO.COM|~FOO.BAR.COM"]);
    compareFilter("bla$image", ["type=filterlist", "text=bla$image", "regexp=bla", "contentType=" + t.IMAGE]);
    compareFilter("bla$background", ["type=filterlist", "text=bla$background", "regexp=bla", "contentType=" + t.IMAGE]);
    compareFilter("bla$~image", ["type=filterlist", "text=bla$~image", "regexp=bla", "contentType=" + (defaultTypes & ~t.IMAGE | t.DOCUMENT)]);
    compareFilter("bla$~background", ["type=filterlist", "text=bla$~background", "regexp=bla", "contentType=" + (defaultTypes & ~t.IMAGE | t.DOCUMENT)]);
    compareFilter("@@bla$~script,~other", ["type=whitelist", "text=@@bla$~script,~other", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER))]);
    compareFilter("@@http://bla$~script,~other", ["type=whitelist", "text=@@http://bla$~script,~other", "regexp=http\\:\\/\\/bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.DOCUMENT)]);
    compareFilter("@@|ftp://bla$~script,~other", ["type=whitelist", "text=@@|ftp://bla$~script,~other", "regexp=^ftp\\:\\/\\/bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.DOCUMENT)]);
    compareFilter("@@bla$~script,~other,document", ["type=whitelist", "text=@@bla$~script,~other,document", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.DOCUMENT)]);
    compareFilter("@@bla$~script,~other,~document", ["type=whitelist", "text=@@bla$~script,~other,~document", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER))]);
    compareFilter("@@bla$document", ["type=whitelist", "text=@@bla$document", "regexp=bla", "contentType=" + t.DOCUMENT]);
    compareFilter("@@bla$~script,~other,elemhide", ["type=whitelist", "text=@@bla$~script,~other,elemhide", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.ELEMHIDE)]);
    compareFilter("@@bla$~script,~other,~elemhide", ["type=whitelist", "text=@@bla$~script,~other,~elemhide", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER))]);
    compareFilter("@@bla$elemhide", ["type=whitelist", "text=@@bla$elemhide", "regexp=bla", "contentType=" + t.ELEMHIDE]);
    compareFilter("@@bla$~script,~other,donottrack", ["type=whitelist", "text=@@bla$~script,~other,donottrack", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER) | t.DONOTTRACK)]);
    compareFilter("@@bla$~script,~other,~donottrack", ["type=whitelist", "text=@@bla$~script,~other,~donottrack", "regexp=bla", "contentType=" + (defaultTypes & ~ (t.SCRIPT | t.OTHER))]);
    compareFilter("@@bla$donottrack", ["type=whitelist", "text=@@bla$donottrack", "regexp=bla", "contentType=" + t.DONOTTRACK]);
  });
  test("Element hiding rules", function()
  {
    compareFilter("#ddd", ["type=elemhide", "text=#ddd", "selector=ddd"]);
    compareFilter("#ddd(fff)", ["type=elemhide", "text=#ddd(fff)", "selector=ddd.fff,ddd#fff"]);
    compareFilter("#ddd(foo=bar)(foo2^=bar2)(foo3*=bar3)(foo4$=bar4)", ["type=elemhide", "text=#ddd(foo=bar)(foo2^=bar2)(foo3*=bar3)(foo4$=bar4)", "selector=ddd[foo=\"bar\"][foo2^=\"bar2\"][foo3*=\"bar3\"][foo4$=\"bar4\"]"]);
    compareFilter("#ddd(fff)(foo=bar)", ["type=elemhide", "text=#ddd(fff)(foo=bar)", "selector=ddd.fff[foo=\"bar\"],ddd#fff[foo=\"bar\"]"]);
    compareFilter("#*(fff)", ["type=elemhide", "text=#*(fff)", "selector=.fff,#fff"]);
    compareFilter("#*(foo=bar)", ["type=elemhide", "text=#*(foo=bar)", "selector=[foo=\"bar\"]"]);
    compareFilter("##body > div:first-child", ["type=elemhide", "text=##body > div:first-child", "selector=body > div:first-child"]);
    compareFilter("foo#ddd", ["type=elemhide", "text=foo#ddd", "selectorDomain=foo", "selector=ddd", "domains=FOO"]);
    compareFilter("foo,bar#ddd", ["type=elemhide", "text=foo,bar#ddd", "selectorDomain=foo,bar", "selector=ddd", "domains=BAR|FOO"]);
    compareFilter("foo,~bar#ddd", ["type=elemhide", "text=foo,~bar#ddd", "selectorDomain=foo", "selector=ddd", "domains=FOO|~BAR"]);
    compareFilter("foo,~baz,bar#ddd", ["type=elemhide", "text=foo,~baz,bar#ddd", "selectorDomain=foo,bar", "selector=ddd", "domains=BAR|FOO|~BAZ"]);
  });
  test("Element hiding exceptions", function()
  {
    compareFilter("#@ddd", ["type=elemhideexception", "text=#@ddd", "selector=ddd"]);
    compareFilter("#@ddd(fff)", ["type=elemhideexception", "text=#@ddd(fff)", "selector=ddd.fff,ddd#fff"]);
    compareFilter("#@ddd(foo=bar)(foo2^=bar2)(foo3*=bar3)(foo4$=bar4)", ["type=elemhideexception", "text=#@ddd(foo=bar)(foo2^=bar2)(foo3*=bar3)(foo4$=bar4)", "selector=ddd[foo=\"bar\"][foo2^=\"bar2\"][foo3*=\"bar3\"][foo4$=\"bar4\"]"]);
    compareFilter("#@ddd(fff)(foo=bar)", ["type=elemhideexception", "text=#@ddd(fff)(foo=bar)", "selector=ddd.fff[foo=\"bar\"],ddd#fff[foo=\"bar\"]"]);
    compareFilter("#@*(fff)", ["type=elemhideexception", "text=#@*(fff)", "selector=.fff,#fff"]);
    compareFilter("#@*(foo=bar)", ["type=elemhideexception", "text=#@*(foo=bar)", "selector=[foo=\"bar\"]"]);
    compareFilter("#@#body > div:first-child", ["type=elemhideexception", "text=#@#body > div:first-child", "selector=body > div:first-child"]);
    compareFilter("foo#@ddd", ["type=elemhideexception", "text=foo#@ddd", "selectorDomain=foo", "selector=ddd", "domains=FOO"]);
    compareFilter("foo,bar#@ddd", ["type=elemhideexception", "text=foo,bar#@ddd", "selectorDomain=foo,bar", "selector=ddd", "domains=BAR|FOO"]);
    compareFilter("foo,~bar#@ddd", ["type=elemhideexception", "text=foo,~bar#@ddd", "selectorDomain=foo", "selector=ddd", "domains=FOO|~BAR"]);
    compareFilter("foo,~baz,bar#@ddd", ["type=elemhideexception", "text=foo,~baz,bar#@ddd", "selectorDomain=foo,bar", "selector=ddd", "domains=BAR|FOO|~BAZ"]);
  });
})();
(function()
{
  module("Filter notifier",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });
  var triggeredListeners = [];
  var listeners = [function(action, item)
  {
    return triggeredListeners.push(["listener1", action, item]);
  }, function(action, item)
  {
    return triggeredListeners.push(["listener2", action, item]);
  }, function(action, item)
  {
    return triggeredListeners.push(["listener3", action, item]);
  }];

  function compareListeners(test, list)
  {
    var result1 = triggeredListeners = [];
    FilterNotifier.triggerListeners("foo",
    {
      bar: true
    });
    var result2 = triggeredListeners = [];
    for (var _loopIndex2 = 0; _loopIndex2 < list.length; ++_loopIndex2)
    {
      var observer = list[_loopIndex2];
      observer("foo",
      {
        bar: true
      });
    }
    deepEqual(result1, result2, test);
  }
  test("Adding/removing listeners", function()
  {
    var _tempVar3 = listeners;
    var listener1 = _tempVar3[0];
    var listener2 = _tempVar3[1];
    var listener3 = _tempVar3[2];
    compareListeners("No listeners", []);
    FilterNotifier.addListener(listener1);
    compareListeners("addListener(listener1)", [listener1]);
    FilterNotifier.addListener(listener1);
    compareListeners("addListener(listener1) again", [listener1]);
    FilterNotifier.addListener(listener2);
    compareListeners("addListener(listener2)", [listener1, listener2]);
    FilterNotifier.removeListener(listener1);
    compareListeners("removeListener(listener1)", [listener2]);
    FilterNotifier.removeListener(listener1);
    compareListeners("removeListener(listener1) again", [listener2]);
    FilterNotifier.addListener(listener3);
    compareListeners("addListener(listener3)", [listener2, listener3]);
    FilterNotifier.addListener(listener1);
    compareListeners("addListener(listener1)", [listener2, listener3, listener1]);
    FilterNotifier.removeListener(listener3);
    compareListeners("removeListener(listener3)", [listener2, listener1]);
    FilterNotifier.removeListener(listener1);
    compareListeners("removeListener(listener1)", [listener2]);
    FilterNotifier.removeListener(listener2);
    compareListeners("removeListener(listener2)", []);
  });
})();
(function()
{
  module("Filter storage",
  {
    setup: function()
    {
      prepareFilterComponents.call(this);
      preparePrefs.call(this);
      Prefs.savestats = true;
    },
    teardown: function()
    {
      restoreFilterComponents.call(this);
      restorePrefs.call(this);
    }
  });

  function compareSubscriptionList(test, list)
  {
    var result = FilterStorage.subscriptions.map(function(subscription)
    {
      return subscription.url;
    });
    var expected = list.map(function(subscription)
    {
      return subscription.url;
    });
    deepEqual(result, expected, test);
  }

  function compareFiltersList(test, list)
  {
    var result = FilterStorage.subscriptions.map(function(subscription)
    {
      return subscription.filters.map(function(filter)
      {
        return filter.text;
      });
    });
    deepEqual(result, list, test);
  }

  function compareFilterSubscriptions(test, filter, list)
  {
    var result = filter.subscriptions.map(function(subscription)
    {
      return subscription.url;
    });
    var expected = list.map(function(subscription)
    {
      return subscription.url;
    });
    deepEqual(result, expected, test);
  }
  test("Adding subscriptions", function()
  {
    var subscription1 = Subscription.fromURL("http://test1/");
    var subscription2 = Subscription.fromURL("http://test2/");
    var changes = [];

    function listener(action, subscription)
    {
      changes.push(action + " " + subscription.url);
    }
    FilterNotifier.addListener(listener);
    compareSubscriptionList("Initial state", []);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.addSubscription(subscription1);
    compareSubscriptionList("Regular add", [subscription1]);
    deepEqual(changes, ["subscription.added http://test1/"], "Received changes");
    changes = [];
    FilterStorage.addSubscription(subscription1);
    compareSubscriptionList("Adding already added subscription", [subscription1]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.addSubscription(subscription2, true);
    compareSubscriptionList("Silent add", [subscription1, subscription2]);
    deepEqual(changes, [], "Received changes");
    FilterStorage.removeSubscription(subscription1);
    compareSubscriptionList("Remove", [subscription2]);
    changes = [];
    FilterStorage.addSubscription(subscription1);
    compareSubscriptionList("Re-adding previously removed subscription", [subscription2, subscription1]);
    deepEqual(changes, ["subscription.added http://test1/"], "Received changes");
  });
  test("Removing subscriptions", function()
  {
    var subscription1 = Subscription.fromURL("http://test1/");
    var subscription2 = Subscription.fromURL("http://test2/");
    FilterStorage.addSubscription(subscription1);
    FilterStorage.addSubscription(subscription2);
    var changes = [];

    function listener(action, subscription)
    {
      changes.push(action + " " + subscription.url);
    }
    FilterNotifier.addListener(listener);
    compareSubscriptionList("Initial state", [subscription1, subscription2]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.removeSubscription(subscription1);
    compareSubscriptionList("Regular remove", [subscription2]);
    deepEqual(changes, ["subscription.removed http://test1/"], "Received changes");
    changes = [];
    FilterStorage.removeSubscription(subscription1);
    compareSubscriptionList("Removing already removed subscription", [subscription2]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.removeSubscription(subscription2, true);
    compareSubscriptionList("Silent remove", []);
    deepEqual(changes, [], "Received changes");
    FilterStorage.addSubscription(subscription1);
    compareSubscriptionList("Add", [subscription1]);
    changes = [];
    FilterStorage.removeSubscription(subscription1);
    compareSubscriptionList("Re-removing previously added subscription", []);
    deepEqual(changes, ["subscription.removed http://test1/"], "Received changes");
  });
  test("Moving subscriptions", function()
  {
    var subscription1 = Subscription.fromURL("http://test1/");
    var subscription2 = Subscription.fromURL("http://test2/");
    var subscription3 = Subscription.fromURL("http://test3/");
    FilterStorage.addSubscription(subscription1);
    FilterStorage.addSubscription(subscription2);
    FilterStorage.addSubscription(subscription3);
    var changes = [];

    function listener(action, subscription)
    {
      changes.push(action + " " + subscription.url);
    }
    FilterNotifier.addListener(listener);
    compareSubscriptionList("Initial state", [subscription1, subscription2, subscription3]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveSubscription(subscription1);
    compareSubscriptionList("Move without explicit position", [subscription2, subscription3, subscription1]);
    deepEqual(changes, ["subscription.moved http://test1/"], "Received changes");
    changes = [];
    FilterStorage.moveSubscription(subscription1);
    compareSubscriptionList("Move without explicit position (subscription already last)", [subscription2, subscription3, subscription1]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveSubscription(subscription2, subscription1);
    compareSubscriptionList("Move with explicit position", [subscription3, subscription2, subscription1]);
    deepEqual(changes, ["subscription.moved http://test2/"], "Received changes");
    changes = [];
    FilterStorage.moveSubscription(subscription3, subscription2);
    compareSubscriptionList("Move without explicit position (subscription already at position)", [subscription3, subscription2, subscription1]);
    deepEqual(changes, [], "Received changes");
    FilterStorage.removeSubscription(subscription2);
    compareSubscriptionList("Remove", [subscription3, subscription1]);
    changes = [];
    FilterStorage.moveSubscription(subscription3, subscription2);
    compareSubscriptionList("Move before removed subscription", [subscription1, subscription3]);
    deepEqual(changes, ["subscription.moved http://test3/"], "Received changes");
    changes = [];
    FilterStorage.moveSubscription(subscription2);
    compareSubscriptionList("Move of removed subscription", [subscription1, subscription3]);
    deepEqual(changes, [], "Received changes");
  });
  test("Adding filters", function()
  {
    var subscription1 = Subscription.fromURL("~blocking");
    subscription1.defaults = ["blocking"];
    var subscription2 = Subscription.fromURL("~exceptions");
    subscription2.defaults = ["whitelist", "elemhide"];
    var subscription3 = Subscription.fromURL("~other");
    FilterStorage.addSubscription(subscription1);
    FilterStorage.addSubscription(subscription2);
    FilterStorage.addSubscription(subscription3);
    var changes = [];

    function listener(action, filter)
    {
      changes.push(action + " " + filter.text);
    }
    FilterNotifier.addListener(listener);
    compareFiltersList("Initial state", [
      [],
      [],
      []
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo"));
    compareFiltersList("Adding blocking filter", [
      ["foo"],
      [],
      []
    ]);
    deepEqual(changes, ["filter.added foo"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("@@bar"));
    compareFiltersList("Adding exception rule", [
      ["foo"],
      ["@@bar"],
      []
    ]);
    deepEqual(changes, ["filter.added @@bar"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo#bar"));
    compareFiltersList("Adding hiding rule", [
      ["foo"],
      ["@@bar", "foo#bar"],
      []
    ]);
    deepEqual(changes, ["filter.added foo#bar"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo#@#bar"));
    compareFiltersList("Adding hiding exception", [
      ["foo"],
      ["@@bar", "foo#bar", "foo#@#bar"],
      []
    ]);
    deepEqual(changes, ["filter.added foo#@#bar"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("!foobar"), undefined, undefined, true);
    compareFiltersList("Adding comment silent", [
      ["foo"],
      ["@@bar", "foo#bar", "foo#@#bar"],
      ["!foobar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo"));
    compareFiltersList("Adding already added filter", [
      ["foo"],
      ["@@bar", "foo#bar", "foo#@#bar"],
      ["!foobar"]
    ]);
    deepEqual(changes, [], "Received changes");
    subscription1.disabled = true;
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo"));
    compareFiltersList("Adding filter already in a disabled subscription", [
      ["foo"],
      ["@@bar", "foo#bar", "foo#@#bar"],
      ["!foobar", "foo"]
    ]);
    deepEqual(changes, ["filter.added foo"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("foo"), subscription1);
    compareFiltersList("Adding filter to an explicit subscription", [
      ["foo", "foo"],
      ["@@bar", "foo#bar", "foo#@#bar"],
      ["!foobar", "foo"]
    ]);
    deepEqual(changes, ["filter.added foo"], "Received changes");
    changes = [];
    FilterStorage.addFilter(Filter.fromText("!foobar"), subscription2, 0);
    compareFiltersList("Adding filter to an explicit subscription with position", [
      ["foo", "foo"],
      ["!foobar", "@@bar", "foo#bar", "foo#@#bar"],
      ["!foobar", "foo"]
    ]);
    deepEqual(changes, ["filter.added !foobar"], "Received changes");
  });
  test("Removing filters", function()
  {
    var subscription1 = Subscription.fromURL("~foo");
    subscription1.filters = [Filter.fromText("foo"), Filter.fromText("foo"), Filter.fromText("bar")];
    var subscription2 = Subscription.fromURL("~bar");
    subscription2.filters = [Filter.fromText("foo"), Filter.fromText("bar"), Filter.fromText("foo")];
    var subscription3 = Subscription.fromURL("http://test/");
    subscription3.filters = [Filter.fromText("foo"), Filter.fromText("bar")];
    FilterStorage.addSubscription(subscription1);
    FilterStorage.addSubscription(subscription2);
    FilterStorage.addSubscription(subscription3);
    var changes = [];

    function listener(action, filter)
    {
      changes.push(action + " " + filter.text);
    }
    FilterNotifier.addListener(listener);
    compareFiltersList("Initial state", [
      ["foo", "foo", "bar"],
      ["foo", "bar", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("foo"), subscription2, 0);
    compareFiltersList("Remove with explicit subscription and position", [
      ["foo", "foo", "bar"],
      ["bar", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, ["filter.removed foo"], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("foo"), subscription2, 0);
    compareFiltersList("Remove with explicit subscription and wrong position", [
      ["foo", "foo", "bar"],
      ["bar", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("foo"), subscription1);
    compareFiltersList("Remove with explicit subscription", [
      ["bar"],
      ["bar", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, ["filter.removed foo", "filter.removed foo"], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("foo"), subscription1);
    compareFiltersList("Remove from subscription not having the filter", [
      ["bar"],
      ["bar", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("bar"));
    compareFiltersList("Remove everywhere", [
      [],
      ["foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, ["filter.removed bar", "filter.removed bar"], "Received changes");
    changes = [];
    FilterStorage.removeFilter(Filter.fromText("bar"));
    compareFiltersList("Remove of unknown filter", [
      [],
      ["foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
  });
  test("Moving filters", function()
  {
    var subscription1 = Subscription.fromURL("~foo");
    subscription1.filters = [Filter.fromText("foo"), Filter.fromText("bar"), Filter.fromText("bas"), Filter.fromText("foo")];
    var subscription2 = Subscription.fromURL("http://test/");
    subscription2.filters = [Filter.fromText("foo"), Filter.fromText("bar")];
    FilterStorage.addSubscription(subscription1);
    FilterStorage.addSubscription(subscription2);
    var changes = [];

    function listener(action, filter)
    {
      changes.push(action + " " + filter.text);
    }
    FilterNotifier.addListener(listener);
    compareFiltersList("Initial state", [
      ["foo", "bar", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveFilter(Filter.fromText("foo"), subscription1, 0, 1);
    compareFiltersList("Regular move", [
      ["bar", "foo", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, ["filter.moved foo"], "Received changes");
    changes = [];
    FilterStorage.moveFilter(Filter.fromText("foo"), subscription1, 0, 3);
    compareFiltersList("Invalid move", [
      ["bar", "foo", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveFilter(Filter.fromText("foo"), subscription2, 0, 1);
    compareFiltersList("Invalid subscription", [
      ["bar", "foo", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveFilter(Filter.fromText("foo"), subscription1, 1, 1);
    compareFiltersList("Move to current position", [
      ["bar", "foo", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, [], "Received changes");
    changes = [];
    FilterStorage.moveFilter(Filter.fromText("bar"), subscription1, 0, 1);
    compareFiltersList("Regular move", [
      ["foo", "bar", "bas", "foo"],
      ["foo", "bar"]
    ]);
    deepEqual(changes, ["filter.moved bar"], "Received changes");
  });
  test("Hit counts", function()
  {
    var changes = [];

    function listener(action, filter)
    {
      changes.push(action + " " + filter.text);
    }
    FilterNotifier.addListener(listener);
    var filter1 = Filter.fromText("filter1");
    var filter2 = Filter.fromText("filter2");
    FilterStorage.addFilter(filter1);
    equal(filter1.hitCount, 0, "filter1 initial hit count");
    equal(filter2.hitCount, 0, "filter2 initial hit count");
    equal(filter1.lastHit, 0, "filter1 initial last hit");
    equal(filter2.lastHit, 0, "filter2 initial last hit");
    var changes = [];
    FilterStorage.increaseHitCount(filter1);
    equal(filter1.hitCount, 1, "Hit count after increase (filter in list)");
    ok(filter1.lastHit > 0, "Last hit changed after increase");
    deepEqual(changes, ["filter.hitCount filter1", "filter.lastHit filter1"], "Received changes");
    var changes = [];
    FilterStorage.increaseHitCount(filter2);
    equal(filter2.hitCount, 1, "Hit count after increase (filter not in list)");
    ok(filter2.lastHit > 0, "Last hit changed after increase");
    deepEqual(changes, ["filter.hitCount filter2", "filter.lastHit filter2"], "Received changes");
    var changes = [];
    FilterStorage.resetHitCounts([filter1]);
    equal(filter1.hitCount, 0, "Hit count after reset");
    equal(filter1.lastHit, 0, "Last hit after reset");
    deepEqual(changes, ["filter.hitCount filter1", "filter.lastHit filter1"], "Received changes");
    var changes = [];
    FilterStorage.resetHitCounts(null);
    equal(filter2.hitCount, 0, "Hit count after complete reset");
    equal(filter2.lastHit, 0, "Last hit after complete reset");
    deepEqual(changes, ["filter.hitCount filter2", "filter.lastHit filter2"], "Received changes");
  });
  test("Filter/subscription relationship", function()
  {
    var filter1 = Filter.fromText("filter1");
    var filter2 = Filter.fromText("filter2");
    var filter3 = Filter.fromText("filter3");
    var subscription1 = Subscription.fromURL("http://test1/");
    subscription1.filters = [filter1, filter2];
    var subscription2 = Subscription.fromURL("http://test2/");
    subscription2.filters = [filter2, filter3];
    var subscription3 = Subscription.fromURL("http://test3/");
    subscription3.filters = [filter1, filter2, filter3];
    compareFilterSubscriptions("Initial filter1 subscriptions", filter1, []);
    compareFilterSubscriptions("Initial filter2 subscriptions", filter2, []);
    compareFilterSubscriptions("Initial filter3 subscriptions", filter3, []);
    FilterStorage.addSubscription(subscription1);
    compareFilterSubscriptions("filter1 subscriptions after adding http://test1/", filter1, [subscription1]);
    compareFilterSubscriptions("filter2 subscriptions after adding http://test1/", filter2, [subscription1]);
    compareFilterSubscriptions("filter3 subscriptions after adding http://test1/", filter3, []);
    FilterStorage.addSubscription(subscription2);
    compareFilterSubscriptions("filter1 subscriptions after adding http://test2/", filter1, [subscription1]);
    compareFilterSubscriptions("filter2 subscriptions after adding http://test2/", filter2, [subscription1, subscription2]);
    compareFilterSubscriptions("filter3 subscriptions after adding http://test2/", filter3, [subscription2]);
    FilterStorage.removeSubscription(subscription1);
    compareFilterSubscriptions("filter1 subscriptions after removing http://test1/", filter1, []);
    compareFilterSubscriptions("filter2 subscriptions after removing http://test1/", filter2, [subscription2]);
    compareFilterSubscriptions("filter3 subscriptions after removing http://test1/", filter3, [subscription2]);
    FilterStorage.updateSubscriptionFilters(subscription3, [filter3]);
    compareFilterSubscriptions("filter1 subscriptions after updating http://test3/ filters", filter1, []);
    compareFilterSubscriptions("filter2 subscriptions after updating http://test3/ filters", filter2, [subscription2]);
    compareFilterSubscriptions("filter3 subscriptions after updating http://test3/ filters", filter3, [subscription2]);
    FilterStorage.addSubscription(subscription3);
    compareFilterSubscriptions("filter1 subscriptions after adding http://test3/", filter1, []);
    compareFilterSubscriptions("filter2 subscriptions after adding http://test3/", filter2, [subscription2]);
    compareFilterSubscriptions("filter3 subscriptions after adding http://test3/", filter3, [subscription2, subscription3]);
    FilterStorage.updateSubscriptionFilters(subscription3, [filter1, filter2]);
    compareFilterSubscriptions("filter1 subscriptions after updating http://test3/ filters", filter1, [subscription3]);
    compareFilterSubscriptions("filter2 subscriptions after updating http://test3/ filters", filter2, [subscription2, subscription3]);
    compareFilterSubscriptions("filter3 subscriptions after updating http://test3/ filters", filter3, [subscription2]);
    FilterStorage.removeSubscription(subscription3);
    compareFilterSubscriptions("filter1 subscriptions after removing http://test3/", filter1, []);
    compareFilterSubscriptions("filter2 subscriptions after removing http://test3/", filter2, [subscription2]);
    compareFilterSubscriptions("filter3 subscriptions after removing http://test3/", filter3, [subscription2]);
  });
})();
(function()
{
  module("Filter matcher",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });

  function compareKeywords(text, expected)
  {
    for (var _loopIndex4 = 0; _loopIndex4 < [Filter.fromText(text), Filter.fromText("@@" + text)].length; ++_loopIndex4)
    {
      var filter = [Filter.fromText(text), Filter.fromText("@@" + text)][_loopIndex4];
      var matcher = new Matcher();
      var result = [];
      for (var _loopIndex5 = 0; _loopIndex5 < expected.length; ++_loopIndex5)
      {
        var dummy = expected[_loopIndex5];
        keyword = matcher.findKeyword(filter);
        result.push(keyword);
        if (keyword)
        {
          var dummyFilter = Filter.fromText("^" + keyword + "^");
          dummyFilter.filterCount = Infinity;
          matcher.add(dummyFilter);
        }
      }
      equal(result.join(", "), expected.join(", "), "Keyword candidates for " + filter.text);
    }
  }

  function checkMatch(filters, location, contentType, docDomain, thirdParty, expected)
  {
    var matcher = new Matcher();
    for (var _loopIndex6 = 0; _loopIndex6 < filters.length; ++_loopIndex6)
    {
      var filter = filters[_loopIndex6];
      matcher.add(Filter.fromText(filter));
    }
    var result = matcher.matchesAny(location, contentType, docDomain, thirdParty);
    if (result)
    {
      result = result.text;
    }
    equal(result, expected, "match(" + location + ", " + contentType + ", " + docDomain + ", " + (thirdParty ? "third-party" : "first-party") + ") with:\n" + filters.join("\n"));
    var combinedMatcher = new CombinedMatcher();
    for (var i = 0; i < 2; i++)
    {
      for (var _loopIndex7 = 0; _loopIndex7 < filters.length; ++_loopIndex7)
      {
        var filter = filters[_loopIndex7];
        combinedMatcher.add(Filter.fromText(filter));
      }
      var result = combinedMatcher.matchesAny(location, contentType, docDomain, thirdParty);
      if (result)
      {
        result = result.text;
      }
      equal(result, expected, "combinedMatch(" + location + ", " + contentType + ", " + docDomain + ", " + (thirdParty ? "third-party" : "first-party") + ") with:\n" + filters.join("\n"));
      filters = filters.map(function(text)
      {
        return "@@" + text;
      });
      if (expected)
      {
        expected = "@@" + expected;
      }
    }
  }

  function cacheCheck(matcher, location, contentType, docDomain, thirdParty, expected)
  {
    var result = matcher.matchesAny(location, contentType, docDomain, thirdParty);
    if (result)
    {
      result = result.text;
    }
    equal(result, expected, "match(" + location + ", " + contentType + ", " + docDomain + ", " + (thirdParty ? "third-party" : "first-party") + ") with static filters");
  }
  test("Matcher class definitions", function()
  {
    equal(typeof Matcher, "function", "typeof Matcher");
    equal(typeof CombinedMatcher, "function", "typeof CombinedMatcher");
    equal(typeof defaultMatcher, "object", "typeof defaultMatcher");
    ok(defaultMatcher instanceof CombinedMatcher, "defaultMatcher is a CombinedMatcher instance");
  });
  test("Keyword extraction", function()
  {
    compareKeywords("*", []);
    compareKeywords("asdf", []);
    compareKeywords("/asdf/", []);
    compareKeywords("/asdf1234", []);
    compareKeywords("/asdf/1234", ["asdf"]);
    compareKeywords("/asdf/1234^", ["asdf", "1234"]);
    compareKeywords("/asdf/123456^", ["123456", "asdf"]);
    compareKeywords("^asdf^1234^56as^", ["asdf", "1234", "56as"]);
    compareKeywords("*asdf/1234^", ["1234"]);
    compareKeywords("|asdf,1234*", ["asdf"]);
    compareKeywords("||domain.example^", ["example", "domain"]);
    compareKeywords("&asdf=1234|", ["asdf", "1234"]);
    compareKeywords("^foo%2Ebar^", ["foo%2ebar"]);
    compareKeywords("^aSdF^1234", ["asdf"]);
    compareKeywords("_asdf_1234_", ["asdf", "1234"]);
    compareKeywords("+asdf-1234=", ["asdf", "1234"]);
    compareKeywords("/123^ad2&ad&", ["123", "ad2"]);
    compareKeywords("/123^ad2&ad$script,domain=example.com", ["123", "ad2"]);
    compareKeywords("^foobar^$donottrack", ["foobar"]);
    compareKeywords("*$donottrack", ["donottrack"]);
  });
  test("Filter matching", function()
  {
    checkMatch([], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["abc"], "http://abc/def", "IMAGE", null, false, "abc");
    checkMatch(["abc", "ddd"], "http://abc/def", "IMAGE", null, false, "abc");
    checkMatch(["ddd", "abc"], "http://abc/def", "IMAGE", null, false, "abc");
    checkMatch(["ddd", "abd"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["abc", "://abc/d"], "http://abc/def", "IMAGE", null, false, "://abc/d");
    checkMatch(["://abc/d", "abc"], "http://abc/def", "IMAGE", null, false, "://abc/d");
    checkMatch(["|http://"], "http://abc/def", "IMAGE", null, false, "|http://");
    checkMatch(["|http://abc"], "http://abc/def", "IMAGE", null, false, "|http://abc");
    checkMatch(["|abc"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["|/abc/def"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["/def|"], "http://abc/def", "IMAGE", null, false, "/def|");
    checkMatch(["/abc/def|"], "http://abc/def", "IMAGE", null, false, "/abc/def|");
    checkMatch(["/abc/|"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["http://abc/|"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["|http://abc/def|"], "http://abc/def", "IMAGE", null, false, "|http://abc/def|");
    checkMatch(["|/abc/def|"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["|http://abc/|"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["|/abc/|"], "http://abc/def", "IMAGE", null, false, null);
    checkMatch(["||example.com/abc"], "http://example.com/abc/def", "IMAGE", null, false, "||example.com/abc");
    checkMatch(["||com/abc/def"], "http://example.com/abc/def", "IMAGE", null, false, "||com/abc/def");
    checkMatch(["||com/abc"], "http://example.com/abc/def", "IMAGE", null, false, "||com/abc");
    checkMatch(["||mple.com/abc"], "http://example.com/abc/def", "IMAGE", null, false, null);
    checkMatch(["||.com/abc/def"], "http://example.com/abc/def", "IMAGE", null, false, null);
    checkMatch(["||http://example.com/"], "http://example.com/abc/def", "IMAGE", null, false, null);
    checkMatch(["||example.com/abc/def|"], "http://example.com/abc/def", "IMAGE", null, false, "||example.com/abc/def|");
    checkMatch(["||com/abc/def|"], "http://example.com/abc/def", "IMAGE", null, false, "||com/abc/def|");
    checkMatch(["||example.com/abc|"], "http://example.com/abc/def", "IMAGE", null, false, null);
    checkMatch(["abc", "://abc/d", "asdf1234"], "http://abc/def", "IMAGE", null, false, "://abc/d");
    checkMatch(["foo*://abc/d", "foo*//abc/de", "://abc/de", "asdf1234"], "http://abc/def", "IMAGE", null, false, "://abc/de");
    checkMatch(["abc$third-party", "abc$~third-party", "ddd"], "http://abc/def", "IMAGE", null, false, "abc$~third-party");
    checkMatch(["abc$third-party", "abc$~third-party", "ddd"], "http://abc/def", "IMAGE", null, true, "abc$third-party");
    checkMatch(["//abc/def$third-party", "//abc/def$~third-party", "//abc_def"], "http://abc/def", "IMAGE", null, false, "//abc/def$~third-party");
    checkMatch(["//abc/def$third-party", "//abc/def$~third-party", "//abc_def"], "http://abc/def", "IMAGE", null, true, "//abc/def$third-party");
    checkMatch(["abc$third-party", "abc$~third-party", "//abc/def"], "http://abc/def", "IMAGE", null, true, "//abc/def");
    checkMatch(["//abc/def", "abc$third-party", "abc$~third-party"], "http://abc/def", "IMAGE", null, true, "//abc/def");
    checkMatch(["abc$third-party", "abc$~third-party", "//abc/def$third-party"], "http://abc/def", "IMAGE", null, true, "//abc/def$third-party");
    checkMatch(["abc$third-party", "abc$~third-party", "//abc/def$third-party"], "http://abc/def", "IMAGE", null, false, "abc$~third-party");
    checkMatch(["abc$third-party", "abc$~third-party", "//abc/def$~third-party"], "http://abc/def", "IMAGE", null, true, "abc$third-party");
    checkMatch(["abc$image", "abc$script", "abc$~image"], "http://abc/def", "IMAGE", null, false, "abc$image");
    checkMatch(["abc$image", "abc$script", "abc$~script"], "http://abc/def", "SCRIPT", null, false, "abc$script");
    checkMatch(["abc$image", "abc$script", "abc$~image"], "http://abc/def", "OTHER", null, false, "abc$~image");
    checkMatch(["//abc/def$image", "//abc/def$script", "//abc/def$~image"], "http://abc/def", "IMAGE", null, false, "//abc/def$image");
    checkMatch(["//abc/def$image", "//abc/def$script", "//abc/def$~script"], "http://abc/def", "SCRIPT", null, false, "//abc/def$script");
    checkMatch(["//abc/def$image", "//abc/def$script", "//abc/def$~image"], "http://abc/def", "OTHER", null, false, "//abc/def$~image");
    checkMatch(["abc$image", "abc$~image", "//abc/def"], "http://abc/def", "IMAGE", null, false, "//abc/def");
    checkMatch(["//abc/def", "abc$image", "abc$~image"], "http://abc/def", "IMAGE", null, false, "//abc/def");
    checkMatch(["abc$image", "abc$~image", "//abc/def$image"], "http://abc/def", "IMAGE", null, false, "//abc/def$image");
    checkMatch(["abc$image", "abc$~image", "//abc/def$script"], "http://abc/def", "IMAGE", null, false, "abc$image");
    checkMatch(["abc$domain=foo.com", "abc$domain=bar.com", "abc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "foo.com", false, "abc$domain=foo.com");
    checkMatch(["abc$domain=foo.com", "abc$domain=bar.com", "abc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "bar.com", false, "abc$domain=bar.com");
    checkMatch(["abc$domain=foo.com", "abc$domain=bar.com", "abc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "baz.com", false, "abc$domain=~foo.com|~bar.com");
    checkMatch(["abc$domain=foo.com", "cba$domain=bar.com", "ccc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "foo.com", false, "abc$domain=foo.com");
    checkMatch(["abc$domain=foo.com", "cba$domain=bar.com", "ccc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "bar.com", false, null);
    checkMatch(["abc$domain=foo.com", "cba$domain=bar.com", "ccc$domain=~foo.com|~bar.com"], "http://abc/def", "IMAGE", "baz.com", false, null);
    checkMatch(["abc$domain=foo.com", "cba$domain=bar.com", "ccc$domain=~foo.com|~bar.com"], "http://ccc/def", "IMAGE", "baz.com", false, "ccc$domain=~foo.com|~bar.com");
    checkMatch(["*$image"], "http://ccc/def", "DONOTTRACK", "example.com", false, null);
    checkMatch(["*$donottrack"], "http://ccc/def", "DONOTTRACK", "example.com", false, "*$donottrack");
    checkMatch(["*$donottrack"], "http://ccc/def", "DONOTTRACK", "example.com", false, "*$donottrack");
    checkMatch(["*$donottrack"], "http://ccc/def", "IMAGE", "example.com", false, null);
    checkMatch(["*$donottrack,third-party"], "http://ccc/def", "DONOTTRACK", "example.com", true, "*$donottrack,third-party");
    checkMatch(["*$donottrack,third-party"], "http://ccc/def", "DONOTTRACK", "example.com", false, null);
  });
  test("Result cache checks", function()
  {
    var matcher = new CombinedMatcher();
    matcher.add(Filter.fromText("abc$image"));
    matcher.add(Filter.fromText("abc$script"));
    matcher.add(Filter.fromText("abc$~image,~script,~document"));
    matcher.add(Filter.fromText("cba$third-party"));
    matcher.add(Filter.fromText("cba$~third-party,~script"));
    matcher.add(Filter.fromText("http://def$image"));
    matcher.add(Filter.fromText("http://def$script"));
    matcher.add(Filter.fromText("http://def$~image,~script,~document"));
    matcher.add(Filter.fromText("http://fed$third-party"));
    matcher.add(Filter.fromText("http://fed$~third-party,~script"));
    cacheCheck(matcher, "http://abc", "IMAGE", null, false, "abc$image");
    cacheCheck(matcher, "http://abc", "SCRIPT", null, false, "abc$script");
    cacheCheck(matcher, "http://abc", "OTHER", null, false, "abc$~image,~script,~document");
    cacheCheck(matcher, "http://cba", "IMAGE", null, false, "cba$~third-party,~script");
    cacheCheck(matcher, "http://cba", "IMAGE", null, true, "cba$third-party");
    cacheCheck(matcher, "http://def", "IMAGE", null, false, "http://def$image");
    cacheCheck(matcher, "http://def", "SCRIPT", null, false, "http://def$script");
    cacheCheck(matcher, "http://def", "OTHER", null, false, "http://def$~image,~script,~document");
    cacheCheck(matcher, "http://fed", "IMAGE", null, false, "http://fed$~third-party,~script");
    cacheCheck(matcher, "http://fed", "IMAGE", null, true, "http://fed$third-party");
    cacheCheck(matcher, "http://abc_cba", "DOCUMENT", null, false, "cba$~third-party,~script");
    cacheCheck(matcher, "http://abc_cba", "DOCUMENT", null, true, "cba$third-party");
    cacheCheck(matcher, "http://abc_cba", "SCRIPT", null, false, "abc$script");
    cacheCheck(matcher, "http://def?http://fed", "DOCUMENT", null, false, "http://fed$~third-party,~script");
    cacheCheck(matcher, "http://def?http://fed", "DOCUMENT", null, true, "http://fed$third-party");
    cacheCheck(matcher, "http://def?http://fed", "SCRIPT", null, false, "http://def$script");
  });
})();
(function()
{
  module("Matching of blocking filters",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });

  function testMatch(text, location, contentType, docDomain, thirdParty, expected)
  {
    function testMatch_internal(text, location, contentType, docDomain, thirdParty, expected)
    {
      var filter = Filter.fromText(text);
      var result = filter.matches(location, contentType, docDomain, thirdParty);
      equal(!!result, expected, "\"" + text + "\".matches(" + location + ", " + contentType + ", " + docDomain + ", " + (thirdParty ? "third-party" : "first-party") + ")");
    }
    testMatch_internal(text, location, contentType, docDomain, thirdParty, expected);
    if (!/^@@/.test(text))
    {
      testMatch_internal("@@" + text, location, contentType, docDomain, thirdParty, expected);
    }
  }
  test("Basic filters", function()
  {
    testMatch("abc", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc", "http://ABC/adf", "IMAGE", null, false, true);
    testMatch("abc", "http://abd/adf", "IMAGE", null, false, false);
    testMatch("|abc", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("|http://abc", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc|", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc/adf|", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("||example.com/foo", "http://example.com/foo/bar", "IMAGE", null, false, true);
    testMatch("||com/foo", "http://example.com/foo/bar", "IMAGE", null, false, true);
    testMatch("||mple.com/foo", "http://example.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||/example.com/foo", "http://example.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||example.com/foo/bar|", "http://example.com/foo/bar", "IMAGE", null, false, true);
    testMatch("||example.com/foo", "http://foo.com/http://example.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||example.com/foo|", "http://example.com/foo/bar", "IMAGE", null, false, false);
  });
  test("Separator placeholders", function()
  {
    testMatch("abc^d", "http://abc/def", "IMAGE", null, false, true);
    testMatch("abc^e", "http://abc/def", "IMAGE", null, false, false);
    testMatch("def^", "http://abc/def", "IMAGE", null, false, true);
    testMatch("http://abc/d^f", "http://abc/def", "IMAGE", null, false, false);
    testMatch("http://abc/def^", "http://abc/def", "IMAGE", null, false, true);
    testMatch("^foo=bar^", "http://abc/?foo=bar", "IMAGE", null, false, true);
    testMatch("^foo=bar^", "http://abc/?a=b&foo=bar", "IMAGE", null, false, true);
    testMatch("^foo=bar^", "http://abc/?foo=bar&a=b", "IMAGE", null, false, true);
    testMatch("^foo=bar^", "http://abc/?notfoo=bar", "IMAGE", null, false, false);
    testMatch("^foo=bar^", "http://abc/?foo=barnot", "IMAGE", null, false, false);
    testMatch("^foo=bar^", "http://abc/?foo=bar%2Enot", "IMAGE", null, false, false);
    testMatch("||example.com^", "http://example.com/foo/bar", "IMAGE", null, false, true);
    testMatch("||example.com^", "http://example.company.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||example.com^", "http://example.com:1234/foo/bar", "IMAGE", null, false, true);
    testMatch("||example.com^", "http://example.com.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||example.com^", "http://example.com-company.com/foo/bar", "IMAGE", null, false, false);
    testMatch("||example.com^foo", "http://example.com/foo/bar", "IMAGE", null, false, true);
    testMatch("||пример.ру^", "http://пример.ру/foo/bar", "IMAGE", null, false, true);
    testMatch("||пример.ру^", "http://пример.руководитель.ру/foo/bar", "IMAGE", null, false, false);
    testMatch("||пример.ру^", "http://пример.ру:1234/foo/bar", "IMAGE", null, false, true);
    testMatch("||пример.ру^", "http://пример.ру.ру/foo/bar", "IMAGE", null, false, false);
    testMatch("||пример.ру^", "http://пример.ру-ководитель.ру/foo/bar", "IMAGE", null, false, false);
    testMatch("||пример.ру^foo", "http://пример.ру/foo/bar", "IMAGE", null, false, true);
  });
  test("Wildcard matching", function()
  {
    testMatch("abc*d", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc*d", "http://abcd/af", "IMAGE", null, false, true);
    testMatch("abc*d", "http://abc/d/af", "IMAGE", null, false, true);
    testMatch("abc*d", "http://dabc/af", "IMAGE", null, false, false);
    testMatch("*abc", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc*", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("|*abc", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc*|", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc***d", "http://abc/adf", "IMAGE", null, false, true);
  });
  test("Type options", function()
  {
    testMatch("abc$image", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$other", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$other", "http://abc/adf", "OTHER", null, false, true);
    testMatch("abc$~other", "http://abc/adf", "OTHER", null, false, false);
    testMatch("abc$script", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$script", "http://abc/adf", "SCRIPT", null, false, true);
    testMatch("abc$~script", "http://abc/adf", "SCRIPT", null, false, false);
    testMatch("abc$stylesheet", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$stylesheet", "http://abc/adf", "STYLESHEET", null, false, true);
    testMatch("abc$~stylesheet", "http://abc/adf", "STYLESHEET", null, false, false);
    testMatch("abc$object", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$object", "http://abc/adf", "OBJECT", null, false, true);
    testMatch("abc$~object", "http://abc/adf", "OBJECT", null, false, false);
    testMatch("abc$document", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$document", "http://abc/adf", "DOCUMENT", null, false, true);
    testMatch("abc$~document", "http://abc/adf", "DOCUMENT", null, false, false);
    testMatch("abc$subdocument", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$subdocument", "http://abc/adf", "SUBDOCUMENT", null, false, true);
    testMatch("abc$~subdocument", "http://abc/adf", "SUBDOCUMENT", null, false, false);
    testMatch("abc$background", "http://abc/adf", "OBJECT", null, false, false);
    testMatch("abc$background", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~background", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$xbl", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$xbl", "http://abc/adf", "XBL", null, false, true);
    testMatch("abc$~xbl", "http://abc/adf", "XBL", null, false, false);
    testMatch("abc$ping", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$ping", "http://abc/adf", "PING", null, false, true);
    testMatch("abc$~ping", "http://abc/adf", "PING", null, false, false);
    testMatch("abc$xmlhttprequest", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$xmlhttprequest", "http://abc/adf", "XMLHTTPREQUEST", null, false, true);
    testMatch("abc$~xmlhttprequest", "http://abc/adf", "XMLHTTPREQUEST", null, false, false);
    testMatch("abc$object-subrequest", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$object-subrequest", "http://abc/adf", "OBJECT_SUBREQUEST", null, false, true);
    testMatch("abc$~object-subrequest", "http://abc/adf", "OBJECT_SUBREQUEST", null, false, false);
    testMatch("abc$dtd", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$dtd", "http://abc/adf", "DTD", null, false, true);
    testMatch("abc$~dtd", "http://abc/adf", "DTD", null, false, false);
    testMatch("abc$media", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$media", "http://abc/adf", "MEDIA", null, false, true);
    testMatch("abc$~media", "http://abc/adf", "MEDIA", null, false, false);
    testMatch("abc$font", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$font", "http://abc/adf", "FONT", null, false, true);
    testMatch("abc$~font", "http://abc/adf", "FONT", null, false, false);
    testMatch("abc$image,script", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~image", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$~script", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~image,~script", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$~script,~image", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$~document,~script,~other", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~image,image", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$image,~image", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$~image,image", "http://abc/adf", "SCRIPT", null, false, true);
    testMatch("abc$image,~image", "http://abc/adf", "SCRIPT", null, false, false);
    testMatch("abc$match-case", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$match-case", "http://ABC/adf", "IMAGE", null, false, false);
    testMatch("abc$~match-case", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~match-case", "http://ABC/adf", "IMAGE", null, false, true);
    testMatch("abc$match-case,image", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$match-case,script", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$match-case,image", "http://ABC/adf", "IMAGE", null, false, false);
    testMatch("abc$match-case,script", "http://ABC/adf", "IMAGE", null, false, false);
    testMatch("abc$third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$third-party", "http://abc/adf", "IMAGE", null, true, true);
    testMatch("abd$third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abd$third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("abc$image,third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$image,third-party", "http://abc/adf", "IMAGE", null, true, true);
    testMatch("abc$~image,third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abc$~image,third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("abc$~third-party", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$~third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("abd$~third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("abd$~third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("abc$image,~third-party", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("abc$image,~third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("abc$~image,~third-party", "http://abc/adf", "IMAGE", null, false, false);
  });
  test("Regular expressions", function()
  {
    testMatch("/abc/", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/abc/", "http://abcd/adf", "IMAGE", null, false, true);
    testMatch("*/abc/", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("*/abc/", "http://abcd/adf", "IMAGE", null, false, false);
    testMatch("/a\\wc/", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/a\\wc/", "http://a1c/adf", "IMAGE", null, false, true);
    testMatch("/a\\wc/", "http://a_c/adf", "IMAGE", null, false, true);
    testMatch("/a\\wc/", "http://a%c/adf", "IMAGE", null, false, false);
  });
  test("Regular expressions with type options", function()
  {
    testMatch("/abc/$image", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/abc/$image", "http://aBc/adf", "IMAGE", null, false, true);
    testMatch("/abc/$script", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/abc/$~image", "http://abcd/adf", "IMAGE", null, false, false);
    testMatch("/ab{2}c/$image", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/ab{2}c/$script", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/ab{2}c/$~image", "http://abcd/adf", "IMAGE", null, false, false);
    testMatch("/abc/$third-party", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/abc/$third-party", "http://abc/adf", "IMAGE", null, true, true);
    testMatch("/abc/$~third-party", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/abc/$~third-party", "http://abc/adf", "IMAGE", null, true, false);
    testMatch("/abc/$match-case", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/abc/$match-case", "http://aBc/adf", "IMAGE", null, true, false);
    testMatch("/ab{2}c/$match-case", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/ab{2}c/$match-case", "http://aBc/adf", "IMAGE", null, true, false);
    testMatch("/abc/$~match-case", "http://abc/adf", "IMAGE", null, false, true);
    testMatch("/abc/$~match-case", "http://aBc/adf", "IMAGE", null, true, true);
    testMatch("/ab{2}c/$~match-case", "http://abc/adf", "IMAGE", null, false, false);
    testMatch("/ab{2}c/$~match-case", "http://aBc/adf", "IMAGE", null, true, false);
  });
  test("Domain restrictions", function()
  {
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "foo.com.", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "www.foo.com", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "www.foo.com.", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "Foo.com", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, true);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", "www.baz.com", true, false);
    testMatch("abc$domain=foo.com", "http://abc/def", "IMAGE", null, true, false);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "foo.com.", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "www.foo.com", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "www.foo.com.", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "Foo.com", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, true);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", "www.baz.com", true, false);
    testMatch("abc$domain=foo.com|bar.com", "http://abc/def", "IMAGE", null, true, false);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "foo.com.", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "www.foo.com", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "www.foo.com.", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "Foo.com", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, true);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", "www.baz.com", true, false);
    testMatch("abc$domain=bar.com|foo.com", "http://abc/def", "IMAGE", null, true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "foo.com.", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "www.foo.com", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "www.foo.com.", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "Foo.com", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, false);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", "www.baz.com", true, true);
    testMatch("abc$domain=~foo.com", "http://abc/def", "IMAGE", null, true, true);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "foo.com.", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "www.foo.com", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "www.foo.com.", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "Foo.com", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, false);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", "www.baz.com", true, true);
    testMatch("abc$domain=~foo.com|~bar.com", "http://abc/def", "IMAGE", null, true, true);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "foo.com.", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "www.foo.com", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "www.foo.com.", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "Foo.com", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "abc.def.foo.com", true, false);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", "www.baz.com", true, true);
    testMatch("abc$domain=~bar.com|~foo.com", "http://abc/def", "IMAGE", null, true, true);
    testMatch("abc$domain=foo.com|~bar.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=foo.com|~bar.com", "http://abc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$domain=foo.com|~bar.com", "http://abc/def", "IMAGE", "baz.com", true, false);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "www.foo.com", true, true);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "bar.foo.com", true, false);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "www.bar.foo.com", true, false);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "baz.com", true, false);
    testMatch("abc$domain=foo.com|~bar.foo.com", "http://abc/def", "IMAGE", "www.baz.com", true, false);
    testMatch("abc$domain=com|~foo.com", "http://abc/def", "IMAGE", "bar.com", true, true);
    testMatch("abc$domain=com|~foo.com", "http://abc/def", "IMAGE", "bar.net", true, false);
    testMatch("abc$domain=com|~foo.com", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=com|~foo.com", "http://abc/def", "IMAGE", "foo.net", true, false);
    testMatch("abc$domain=com|~foo.com", "http://abc/def", "IMAGE", "com", true, true);
    testMatch("abc$domain=foo.com", "http://ccc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=foo.com", "http://ccc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$image,domain=foo.com", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$image,domain=foo.com", "http://abc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$image,domain=foo.com", "http://abc/def", "OBJECT", "foo.com", true, false);
    testMatch("abc$image,domain=foo.com", "http://abc/def", "OBJECT", "bar.com", true, false);
    testMatch("abc$~image,domain=foo.com", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$~image,domain=foo.com", "http://abc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$~image,domain=foo.com", "http://abc/def", "OBJECT", "foo.com", true, true);
    testMatch("abc$~image,domain=foo.com", "http://abc/def", "OBJECT", "bar.com", true, false);
    testMatch("abc$domain=foo.com,image", "http://abc/def", "IMAGE", "foo.com", true, true);
    testMatch("abc$domain=foo.com,image", "http://abc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$domain=foo.com,image", "http://abc/def", "OBJECT", "foo.com", true, false);
    testMatch("abc$domain=foo.com,image", "http://abc/def", "OBJECT", "bar.com", true, false);
    testMatch("abc$domain=foo.com,~image", "http://abc/def", "IMAGE", "foo.com", true, false);
    testMatch("abc$domain=foo.com,~image", "http://abc/def", "IMAGE", "bar.com", true, false);
    testMatch("abc$domain=foo.com,~image", "http://abc/def", "OBJECT", "foo.com", true, true);
    testMatch("abc$domain=foo.com,~image", "http://abc/def", "OBJECT", "bar.com", true, false);
  });
  test("Exception rules", function()
  {
    testMatch("@@test", "http://test/", "DOCUMENT", null, false, false);
    testMatch("@@http://test*", "http://test/", "DOCUMENT", null, false, true);
    testMatch("@@ftp://test*", "ftp://test/", "DOCUMENT", null, false, true);
    testMatch("@@test$document", "http://test/", "DOCUMENT", null, false, true);
    testMatch("@@test$document,image", "http://test/", "DOCUMENT", null, false, true);
    testMatch("@@test$~image", "http://test/", "DOCUMENT", null, false, false);
    testMatch("@@test$~image,document", "http://test/", "DOCUMENT", null, false, true);
    testMatch("@@test$document,~image", "http://test/", "DOCUMENT", null, false, true);
    testMatch("@@test$document,domain=foo.com", "http://test/", "DOCUMENT", "foo.com", false, true);
    testMatch("@@test$document,domain=foo.com", "http://test/", "DOCUMENT", "bar.com", false, false);
    testMatch("@@test$document,domain=~foo.com", "http://test/", "DOCUMENT", "foo.com", false, false);
    testMatch("@@test$document,domain=~foo.com", "http://test/", "DOCUMENT", "bar.com", false, true);
  });
})();
(function()
{
  module("Subscription classes",
  {
    setup: prepareFilterComponents,
    teardown: restoreFilterComponents
  });

  function compareSubscription(url, expected, postInit)
  {
    expected.push("[Subscription]");
    var subscription = Subscription.fromURL(url);
    if (postInit)
    {
      postInit(subscription);
    }
    var result = [];
    subscription.serialize(result);
    equal(result.sort().join("\n"), expected.sort().join("\n"), url);
    var map =
    {
      __proto__: null
    };
    for (var _loopIndex8 = 0; _loopIndex8 < result.slice(1).length; ++_loopIndex8)
    {
      var line = result.slice(1)[_loopIndex8];
      if (/(.*?)=(.*)/.test(line))
      {
        map[RegExp.$1] = RegExp.$2;
      }
    }
    var subscription2 = Subscription.fromObject(map);
    equal(subscription.toString(), subscription2.toString(), url + " deserialization");
  }
  test("Subscription class definitions", function()
  {
    equal(typeof Subscription, "function", "typeof Subscription");
    equal(typeof SpecialSubscription, "function", "typeof SpecialSubscription");
    equal(typeof RegularSubscription, "function", "typeof RegularSubscription");
    equal(typeof ExternalSubscription, "function", "typeof ExternalSubscription");
    equal(typeof DownloadableSubscription, "function", "typeof DownloadableSubscription");
  });
  test("Subscriptions with state", function()
  {
    compareSubscription("~fl~", ["url=~fl~", "title=" + Utils.getString("newGroup_title")]);
    compareSubscription("http://test/default", ["url=http://test/default", "title=http://test/default"]);
    compareSubscription("http://test/default_titled", ["url=http://test/default_titled", "title=test"], function(subscription)
    {
      subscription.title = "test";
    });
    compareSubscription("http://test/non_default", ["url=http://test/non_default", "title=test", "nextURL=http://test2/", "disabled=true", "lastSuccess=8", "lastDownload=12", "lastCheck=16", "softExpiration=18", "expires=20", "downloadStatus=foo", "lastModified=bar", "errors=3", "requiredVersion=0.6", "alternativeLocations=http://foo/;q=0.5,http://bar/;q=2"], function(subscription)
    {
      subscription.title = "test";
      subscription.nextURL = "http://test2/";
      subscription.disabled = true;
      subscription.lastSuccess = 8;
      subscription.lastDownload = 12;
      subscription.lastCheck = 16;
      subscription.softExpiration = 18;
      subscription.expires = 20;
      subscription.downloadStatus = "foo";
      subscription.lastModified = "bar";
      subscription.errors = 3;
      subscription.requiredVersion = "0.6";
      subscription.alternativeLocations = "http://foo/;q=0.5,http://bar/;q=2";
    });
    compareSubscription("~wl~", ["url=~wl~", "disabled=true", "title=Test group"], function(subscription)
    {
      subscription.title = "Test group";
      subscription.disabled = true;
    });
  });
})();
