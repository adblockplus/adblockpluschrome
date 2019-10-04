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
const {Utils} = require("utils");

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
  if (message.what == "issues")
    return forward("subscriptions.getInitIssues", message, sender);

  if (message.what == "localeInfo")
    return {locale: Utils.appLocale, bidiDir: Utils.readingDirection};

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

  return forward("info.get", message, sender)
    .then(info => info[message.what]);
});
