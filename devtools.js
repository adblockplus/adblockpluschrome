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

let panelWindow = null;

// Versions of Firefox before 54 do not support the devtools.panels API; on
// these platforms, even when the option is enabled, we cannot show the
// devtools panel.
if ("panels" in browser.devtools)
{
  browser.runtime.sendMessage(
    {
      type: "prefs.get",
      key: "show_devtools_panel"
    },
    enabled =>
    {
      if (enabled)
      {
        browser.devtools.panels.create(
          "Adblock Plus",
          "icons/abp-32.png",
          "devtools-panel.html",
          panel =>
          {
            panel.onShown.addListener(window =>
            {
              panelWindow = window;
            });

            panel.onHidden.addListener(window =>
            {
              panelWindow = null;
            });

            if (panel.onSearch)
            {
              panel.onSearch.addListener((eventName, queryString) =>
              {
                if (panelWindow)
                  panelWindow.postMessage({type: eventName, queryString}, "*");
              });
            }
          }
        );
      }
    }
  );
}
