const readline = require("readline");
const fs = require('fs');
const {Filter, RegExpFilter} = require("../adblockpluscore/lib/filterClasses");

RegExpFilter.typeMap.OBJECT_SUBREQUEST = RegExpFilter.typeMap.OBJECT;

const requestTypes = [
  [RegExpFilter.typeMap.SUBDOCUMENT, "sub_frame"],
  [RegExpFilter.typeMap.STYLESHEET, "stylesheet"],
  [RegExpFilter.typeMap.SCRIPT, "script"],
  [RegExpFilter.typeMap.IMAGE, "image"],
  [RegExpFilter.typeMap.FONT, "font"],
  [RegExpFilter.typeMap.OBJECT, "object"],
  [RegExpFilter.typeMap.XMLHTTPREQUEST, "xmlhttprequest"],
  [RegExpFilter.typeMap.PING, "ping"],
  [RegExpFilter.typeMap.MEDIA, "media"],
  [RegExpFilter.typeMap.WEBSOCKET, "websocket"],
  [RegExpFilter.typeMap.OTHER, "csp_report"],
  [RegExpFilter.typeMap.OTHER, "other"]
];

const requestContentTypes = requestTypes.reduce((acc, [ct]) => acc | ct, 0);
const nonASCII = /[^\x00-\x7F]/;

let rules = [];
let documentExceptionDomains = new Set();
var genericblockExceptionDomains = new Set();
let done = Promise.resolve();

function processFilter(text)
{
  let normalized = Filter.normalize(text);
  if (!normalized)
    return;

  let filter = Filter.fromText(normalized);
  if (filter.type != "blocking" && filter.type != "whitelist" ||
      filter.pattern == null || filter.sitekeys || filter.rewrite)
    return;

  if (filter.contentType & requestContentTypes &&
      !nonASCII.test(filter.pattern))
  {
    let rule = {
      id: rules.length + 1,
      action: {
        type: filter.type == "blocking" ? "block" : "allow"
      },
      condition: {}
    };

    if (filter.pattern)
    {
      rule.condition.urlFilter = filter.pattern;

      if (!filter.matchCase)
      {
        let s = filter.pattern.replace(/^\|(?:\w+:\/\/)?.*?(?:[/^*]|$)/, "");
        if (/[a-z]/.test(s))
          rule.condition.isUrlFilterCaseSensitive = false;
      }
    }

    if ((filter.contentType & requestContentTypes) != requestContentTypes)
    {
      let resourceTypes = [];
      for (let [contentType, resourceType] of requestTypes)
      {
        if (filter.contentType & contentType)
          resourceTypes.push(resourceType);
      }
      rule.condition.resourceTypes = resourceTypes;
    }

    if (filter.domains)
    {
      let domains = new Set();
      let excludedDomains = new Set();

      for (let [domain, included] of filter.domains.entries())
      {
        if (domain && !nonASCII.test(domain))
        {
          if (included)
            domains.add(domain);
          else
            excludedDomains.add(domain);
        }
      }

      if (!filter.domains.get("") && domains.size == 0)
        return;

      if (domains.size > 0)
        rule.condition.domains = Array.from(domains);
      if (excludedDomains.size > 0)
        rule.condition.excludedDomains = Array.from(excludedDomains);
    }

    if (filter.thirdParty != null)
      rule.condition.domainType = filter.thirdParty ? "thirdParty" :
                                                      "firstParty";

    rules.push(rule);
  }

  if (filter.type == "whitelist" &&
      !filter.domains && filter.thirdParty == null &&
      filter.contentType & (RegExpFilter.typeMap.DOCUMENT |
                            RegExpFilter.typeMap.GENERICBLOCK))
  {
    let match = /^\|\|([\w.-]+)[/^]?$/.exec(filter.pattern);
    if (match)
    {
      if (filter.contentType & RegExpFilter.typeMap.DOCUMENT)
        documentExceptionDomains.add(match[1]);
      if (filter.contentType & RegExpFilter.typeMap.GENERICBLOCK)
        genericblockExceptionDomains.add(match[1]);
    }
  }
}

for (let i = 2; i < process.argv.length; i++)
{
  done = done.then(() =>
  {
    return new Promise(resolve =>
    {
      let rl = readline.createInterface({input: fs.createReadStream(process.argv[i])});
      let first = true;

      rl.on("line", line =>
      {
        if (!first || !line.startsWith("["))
          processFilter(line);
        first = false;
      });

      rl.on("close", resolve);
    });
  });
}

done.then(() =>
{
  if (documentExceptionDomains.size > 0)
  {
    rules.push({
      id: rules.length + 1,
      action: {
        type: "allow"
      },
      condition: {
        domains: Array.from(documentExceptionDomains)
      }
    });
  }

  if (genericblockExceptionDomains.size > 0)
  {
    let domains = Array.from(genericblockExceptionDomains);
    for (let rule of rules)
    {
      if (rule.action.type == "block" && !("domains" in rule.condition))
      {
        if ("excludedDomains" in rule.condition)
        {
          rule.condition.excludedDomains = Array.from(
            new Set([...rule.condition.excludedDomains, ...domains])
          );
        }
        else
        {
          rule.condition.excludedDomains = domains;
        }
      }
    }
  }

  console.log(JSON.stringify(rules, null, 2));
});
