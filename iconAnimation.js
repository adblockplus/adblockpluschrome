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

iconAnimation = {
  _icons: new ext.PageMap(),
  _animatedPages: new ext.PageMap(),
  _step: 0,

  update: function(type)
  {
    if (type == this._type)
       return;

    if (!this._type)
      this._start();

    this._type = type;
  },
  stop: function()
  {
    clearInterval(this._interval);

    delete this._interval;
    delete this._type;

    this._animatedPages.clear();
  },
  registerPage: function(page, icon)
  {
    this._icons.set(page, icon);

    if (this._animatedPages.has(page))
      this._updateIcon(page);
  },
  _start: function()
  {
    this._interval = setInterval(function()
    {
      ext.pages.query({active: true}, function(pages)
      {
        if (pages.length == 0)
          return;

        for (var i = 0; i < pages.length; i++)
          this._animatedPages.set(pages[i], null);

        var interval = setInterval(function()
        {
          this._step++;
          pages.forEach(this._updateIcon.bind(this));

          if (this._step < 10)
            return;

          clearInterval(interval);
          setTimeout(function()
          {
            interval = setInterval(function()
            {
              this._step--;
              pages.forEach(this._updateIcon.bind(this));

              if (this._step > 0)
                return;

              clearInterval(interval);
              this._animatedPages.clear();
            }.bind(this), 100);
          }.bind(this), 1000);
        }.bind(this), 100);
      }.bind(this));
    }.bind(this), 15000);
  },
  _updateIcon: function(page)
  {
    var path = this._icons.get(page);

    if (!path)
      return;

    if (this._step > 0)
    {
      var suffix = "-notification-" + this._type;

      if (this._step < 10)
        suffix += "-" + this._step;

      path = path.replace(/(?=\..+$)/, suffix);
    }

    page.browserAction.setIcon(path);
  }
};
