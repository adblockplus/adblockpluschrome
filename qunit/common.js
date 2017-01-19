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

importAll("filterClasses", this);
importAll("subscriptionClasses", this);
importAll("matcher", this);
importAll("filterStorage", this);
importAll("filterNotifier", this);
importAll("elemHide", this);
importAll("prefs", this);
importAll("utils", this);

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

function preparePrefs()
{
  this._pbackup = Object.create(null);
  for (let pref in Prefs)
  {
    let value = Prefs[pref];
    this._pbackup[pref] = value;
  }
  Prefs.enabled = true;
}

function restorePrefs()
{
  for (let pref in this._pbackup)
    Prefs[pref] = this._pbackup[pref];
}

function executeFirstRunActions()
{
}
