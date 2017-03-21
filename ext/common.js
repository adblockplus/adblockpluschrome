/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2017 eyeo GmbH
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
  var ext = {};

  let EventTarget = ext._EventTarget = function()
  {
    this._listeners = [];
  };
  EventTarget.prototype = {
    addListener(listener)
    {
      if (this._listeners.indexOf(listener) == -1)
        this._listeners.push(listener);
    },
    removeListener(listener)
    {
      let idx = this._listeners.indexOf(listener);
      if (idx != -1)
        this._listeners.splice(idx, 1);
    },
    _dispatch()
    {
      let results = [];
      let listeners = this._listeners.slice();

      for (let listener of listeners)
        results.push(listener.apply(null, arguments));

      return results;
    }
  };
}
