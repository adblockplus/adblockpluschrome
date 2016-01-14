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

"use strict";

(function(global)
{
  if ("fetch" in global)
    return;

  function Response(xhr)
  {
    this._xhr = xhr;
  }
  Response.prototype = {
    get ok()
    {
      return this._xhr.status >= 200 && this._xhr.status <= 299;
    },
    text: function()
    {
      return Promise.resolve(this._xhr.responseText);
    }
  };

  global.fetch = function(url)
  {
    return new Promise(function(resolve, reject)
    {
      var xhr = new XMLHttpRequest();

      xhr.onload = function()
      {
        resolve(new Response(xhr));
      };

      xhr.onerror = xhr.onabort = function()
      {
        reject(new TypeError("Failed to fetch"));
      };

      xhr.overrideMimeType("text/plain");
      xhr.open("GET", url);
      xhr.send();
    });
  };
})(this);
