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

/** @module messageResponder */

"use strict";

const {port} = require("messaging");
const info = require("info");

function forward(type, message, sender)
{
  return new Promise(resolve =>
  {
    port._onMessage(Object.assign({}, message, {type}), sender, resolve);
  });
}

/**
 * @deprecated Please send the "filters.getTypes" message instead.
 *
 * @event "types.get"
 */
port.on("types.get",
        (message, sender) => forward("filters.getTypes", message, sender));

/**
 * @deprecated Please send the "options.open" message instead.
 *
 * @event "app.open"
 */
port.on("app.open", (message, sender) =>
{
  if (message.what == "options")
    return forward("options.open", message, sender);
});

/**
 * @deprecated Please send the "subscriptions.getInitIssues",
 *             "prefs.getDocLink", "subscriptions.getRecommendations",
 *             "devtools.supported" or "info.get" messages, or call the
 *             browser.tabs.getCurrent(), browser.i18n.getUILanguage(),
 *             browser.i18n.getMessage("@@bidi_dir") APIs instead.
 *
 * @event "app.get"
 */
port.on("app.get", (message, sender) =>
{
  if (message.what == "localeInfo")
  {
    return {
      locale: browser.i18n.getUILanguage(),
      bidiDir: browser.i18n.getMessage("@@bidi_dir")
    };
  }

  if (message.what == "senderId")
    return sender.page.id;

  if (message.what == "doclink")
    return forward("prefs.getDocLink", message, sender);

  if (message.what == "recommendations")
    return forward("subscriptions.getRecommendations", message, sender);

  if (message.what == "features")
  {
    return forward("devtools.supported", message, sender)
      .then(devToolsPanel => ({devToolsPanel}));
  }

  return info[message.what];
});

/**
 * @typedef {object} infoGetResult
 * @property {string} addonName
 *   The extension's name, e.g. "adblockpluschrome".
 * @property {string} addonVersion
 *   The extension's version, e.g. "3.6.3".
 * @property {string} application
 *   The browser's name, e.g. "chrome".
 * @property {string} applicationVersion
 *   The browser's version, e.g. "77.0.3865.90".
 * @property {string} platform
 *   The browser platform, e.g. "chromium".
 * @property {string} platformVersion
 *   The browser platform's version, e.g. "77.0.3865.90".
 */

/**
 * Returns the browser platform information.
 *
 * @event "info.get"
 * @returns {infoGetResult}
 */
port.on("info.get", (message, sender) => info);
