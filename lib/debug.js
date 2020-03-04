/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
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

const {port} = require("messaging");

let lastError = null;

function safeToString(value)
{
  try
  {
    return String(value);
  }
  catch (e)
  {
    return "<string conversion error>";
  }
}

self.addEventListener("error", event =>
{
  lastError = safeToString(event.error);
});

self.addEventListener("unhandledrejection", event =>
{
  lastError = safeToString(event.reason);
});

let consoleError = console.error;
console.error = function error(...args)
{
  lastError = args.map(safeToString).join(" ");
  consoleError.apply(this, args);
};

port.on("debug.getLastError", () =>
{
  let error = lastError;
  lastError = null;
  return error;
});
