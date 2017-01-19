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

/** @module messaging */

"use strict";

const {EventEmitter} = require("events");

/**
 * Communication port wrapping ext.onMessage to receive messages.
 *
 * @constructor
 */
function Port()
{
  this._eventEmitter = new EventEmitter();
  this._onMessage = this._onMessage.bind(this);
  ext.onMessage.addListener(this._onMessage);
};

Port.prototype = {
  _onMessage(message, sender, sendResponse)
  {
    let async = false;
    let callbacks = this._eventEmitter.listeners(message.type);

    for (let callback of callbacks)
    {
      let response = callback(message, sender);

      if (response && typeof response.then == "function")
      {
        response.then(
          sendResponse,
          reason => {
            console.error(reason);
            sendResponse(undefined);
          }
        );
        async = true;
      }
      else if (typeof response != "undefined")
      {
        sendResponse(response);
      }
    }

    return async;
  },

  /**
   * Function to be called when a particular message is received.
   *
   * @callback Port~messageCallback
   * @param {object} message
   * @param {object} sender
   * @return The callback can return undefined (no response),
   *         a value (response to be sent to sender immediately)
   *         or a promise (asynchronous response).
   */

  /**
   * Adds a callback for the specified message.
   *
   * The return value of the callback (if not undefined) is sent as response.
   * @param {string}   name
   * @param {Port~messageCallback} callback
   */
  on(name, callback)
  {
    this._eventEmitter.on(name, callback);
  },

  /**
   * Removes a callback for the specified message.
   *
   * @param {string}   name
   * @param {Port~messageCallback} callback
   */
  off(name, callback)
  {
    this._eventEmitter.off(name, callback);
  },

  /**
   * Disables the port and makes it stop listening to incoming messages.
   */
  disconnect()
  {
    ext.onMessage.removeListener(this._onMessage);
  }
};

/**
 * The default port to receive messages.
 *
 * @type {Port}
 */
exports.port = new Port();

/**
 * Creates a new port that is disconnected when the given window is unloaded.
 *
 * @param {Window} window
 * @return {Port}
 */
exports.getPort = function(window)
{
  let port = new Port();
  window.addEventListener("unload", () =>
  {
    port.disconnect();
  });
  return port;
};

