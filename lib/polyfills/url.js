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

(function(global)
{
  var URLProperties = ["href", "protocol", "hostname",
                       "host", "pathname", "search"];

  // Chrome <35 and Safari 6 used the non-standard name webkitURL
  var URL = global.URL || global.webkitURL;

  // Chrome <32 didn't implement any of those properties
  function hasProperties()
  {
    var dummy = new URL("about:blank");
    for (var i = 0; i < URLProperties.length; i++)
      if (!(URLProperties[i] in dummy))
        return false;
    return true;
  }

  if (!URL || !hasProperties())
  {
    var doc = document.implementation.createHTMLDocument();

    var base = doc.createElement("base");
    doc.head.appendChild(base);

    var anchor = doc.createElement("a");
    doc.body.appendChild(anchor);

    URL = function(url, baseUrl)
    {
      if (baseUrl instanceof URL)
        base.href = baseUrl.href;
      else
        base.href = baseUrl || "";
      anchor.href = url;

      for (var i = 0; i < URLProperties.length; i++)
      {
        var prop = URLProperties[i];
        this[prop] = anchor[prop];
      }
    };
  }

  global.URL = URL;
})(this);
