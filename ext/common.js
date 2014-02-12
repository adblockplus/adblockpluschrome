/*
 * This file is part of Adblock Plus <http://adblockplus.org/>,
 * Copyright (C) 2006-2014 Eyeo GmbH
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
  window.ext = {};

  var EventTarget = ext._EventTarget = function(cancelable)
  {
    this._listeners = [];
    this._cancelable = cancelable;
  };
  EventTarget.prototype = {
    addListener: function(listener)
    {
      if (this._listeners.indexOf(listener) == -1)
        this._listeners.push(listener);
    },
    removeListener: function(listener)
    {
      var idx = this._listeners.indexOf(listener);
      if (idx != -1)
        this._listeners.splice(idx, 1);
    },
    _dispatch: function(cancelable, args)
    {
      for (var i = 0; i < this._listeners.length; i++)
      {
        var result = this._listeners[i].apply(null, arguments);
        if (this._cancelable && result === false)
          return false;
      }
      return true;
    }
  };
})();
