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
  if ("Promise" in global)
    return;

  var PENDING = 0;
  var FULFILLED = 1;
  var REJECTED = 2;

  var Promise = global.Promise = function(executor)
  {
    this._state = PENDING;
    this._value = undefined;
    this._subscriptions = [];

    try
    {
      executor(this._emit.bind(this, FULFILLED),
               this._emit.bind(this, REJECTED));
    }
    catch (reason)
    {
      this._emit(REJECTED, reason);
    }
  };

  Promise.prototype = {
    _dispatch: function(onFulfilled, onRejected, resolve, reject)
    {
      var callback = this._state == FULFILLED ? onFulfilled : onRejected;

      if (typeof callback == "function")
      {
        var result;

        try
        {
          result = callback(this._value);
        }
        catch (reason)
        {
          reject(reason);
          return;
        }

        Promise.resolve(result).then(resolve, reject);
      }
      else if (this._state == FULFILLED)
      {
        resolve(this._value);
      }
      else if (this._state == REJECTED)
      {
        reject(this._value);
      }
    },
    _dispatchSubscriptions: function()
    {
      if (this._state == REJECTED && this._subscriptions.length == 0)
        console.error('Uncaught (in promise)', this._value);

      for (var i = 0; i < this._subscriptions.length; i++)
        this._dispatch.apply(this, this._subscriptions[i]);

      this._subscriptions = null;
    },
    _emit: function(state, value)
    {
      if (this._state != PENDING)
        return;

      this._state = state;
      this._value = value;

      setTimeout(this._dispatchSubscriptions.bind(this), 0);
    },
    then: function(onFulfilled, onRejected)
    {
      return new Promise(function(resolve, reject)
      {
        if (this._subscriptions)
          this._subscriptions.push([onFulfilled, onRejected, resolve, reject]);
        else
          setTimeout(
            this._dispatch.bind(this), 0,
            onFulfilled, onRejected, resolve, reject
          );
      }.bind(this));
    },
    catch: function(onRejected)
    {
      return this.then(undefined, onRejected);
    }
  };

  Promise.resolve = function(value)
  {
    if (value instanceof Promise)
      return value;
    return new Promise(function(resolve, reject) { resolve(value); });
  };

  Promise.reject = function(reason)
  {
    return new Promise(function(resolve, reject) { reject(reason); });
  };

  Promise.all = function(promises)
  {
    return new Promise(function(resolve, reject)
    {
      var count = promises.length;
      var result = new Array(count);

      if (count == 0)
      {
        resolve(result);
        return;
      }

      promises.forEach(function(promise, i)
      {
        Promise.resolve(promise).then(
          function(value)
          {
            result[i] = value;
            if (--count == 0)
              resolve(result);
          },
          reject
        );
      });
    });
  };
})(this);
