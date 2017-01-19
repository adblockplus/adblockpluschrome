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

{
  let nonEmptyPageMaps = Object.create(null);
  let pageMapCounter = 0;

  let PageMap = ext.PageMap = function()
  {
    this._map = Object.create(null);
    this._id = ++pageMapCounter;
  };
  PageMap.prototype = {
    _delete(id)
    {
      delete this._map[id];

      if (Object.keys(this._map).length == 0)
        delete nonEmptyPageMaps[this._id];
    },
    keys()
    {
      return Object.keys(this._map).map(ext.getPage);
    },
    get(page)
    {
      return this._map[page.id];
    },
    set(page, value)
    {
      this._map[page.id] = value;
      nonEmptyPageMaps[this._id] = this;
    },
    has(page)
    {
      return page.id in this._map;
    },
    clear()
    {
      for (let id in this._map)
        this._delete(id);
    },
    delete(page)
    {
      this._delete(page.id);
    }
  };

  ext._removeFromAllPageMaps = pageId =>
  {
    for (let pageMapId in nonEmptyPageMaps)
      nonEmptyPageMaps[pageMapId]._delete(pageId);
  };
}
