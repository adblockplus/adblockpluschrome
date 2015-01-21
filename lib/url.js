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

window.URL = (function()
{
  let URL = window.URL || window.webkitURL;
  let URLProperties = ["href", "protocol", "host", "hostname", "port", "pathname", "search"];

  if (!URL || !URLProperties.every(prop => prop in new URL("")))
  {
    let doc = document.implementation.createHTMLDocument();

    let base = doc.createElement("base");
    doc.head.appendChild(base);

    let anchor = doc.createElement("a");
    doc.body.appendChild(anchor);

    URL = function(url, baseUrl)
    {
      if (baseUrl instanceof URL)
        base.href = baseUrl.href;
      else
        base.href = baseUrl || "";
      anchor.href = url;

      for (let prop of URLProperties)
        this[prop] = anchor[prop];
    };
  }

  return URL;
})();
