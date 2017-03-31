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

const {FilterStorage} = require("filterStorage");
const {Subscription} = require("subscriptionClasses");
const {Filter} = require("filterClasses");
const {defaultMatcher} = require("matcher");
const {ElemHide} = require("elemHide");
const {Prefs} = require("prefs");

function prepareFilterComponents(keepListeners)
{
  FilterStorage.subscriptions = [];
  FilterStorage.knownSubscriptions = Object.create(null);
  Subscription.knownSubscriptions = Object.create(null);
  Filter.knownFilters = Object.create(null);

  defaultMatcher.clear();
  ElemHide.clear();
}

function restoreFilterComponents()
{
}

function executeFirstRunActions()
{
}
