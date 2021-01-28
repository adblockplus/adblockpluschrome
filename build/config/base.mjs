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

export default {
  basename: "adblockplus",
  version: "3.10.2",
  webpack: {
    bundles: [
      {
        dest: "background.js",
        src: [
          "lib/devtools.js",
          "lib/debug.js",
          "lib/requestBlocker.js",
          "lib/popupBlocker.js",
          "lib/subscriptionInit.js",
          "adblockplusui/lib/init.js",
          "lib/filterComposer.js",
          "lib/stats.js",
          "lib/uninstall.js",
          "lib/csp.js",
          "lib/contentFiltering.js",
          "lib/messageResponder.js",
          "lib/filterConfiguration.js",
          "lib/ml.js"
        ]
      },
      {
        dest: "include.preload.js",
        src: [
          "include.preload.js",
          "inject.preload.js"
        ]
      },
      {
        dest: "composer.postload.js",
        src: [
          "composer.postload.js"
        ]
      },
      {
        dest: "subscriptionLink.postload.js",
        src: [
          "subscriptionLink.postload.js"
        ]
      }
    ]
  },
  mapping: {
    copy: [
      {
        dest: "skin",
        src: [
          "adblockplusui/skin/**",
          "!adblockplusui/skin/fonts/*00/**",
          "!adblockplusui/skin/icons/toolbar/**",
          "!adblockplusui/skin/icons/abp-128.png",
          "!adblockplusui/skin/icons/arrow.svg",
          "!adblockplusui/skin/icons/iconClose.svg",
          "!adblockplusui/skin/icons/iconCritical.svg",
          "!adblockplusui/skin/icons/mobile/**",
          "!adblockplusui/skin/mobile-options.css"
        ]
      },
      {
        dest: "icons/detailed",
        src: [
          "icons/detailed/*.png",
          "adblockplusui/skin/icons/abp-128.png"
        ]
      },
      {
        dest: "data",
        src: "adblockplusui/data/*.json"
      },
      {
        dest: "data/mlHideIfGraphMatches",
        src: [
          "adblockpluscore/data/mlHideIfGraphMatches/model.json",
          "adblockpluscore/data/mlHideIfGraphMatches/group1-shard1of1.dat"
        ]
      },
      {
        dest: "ext",
        src: [
          "ext/**"
        ]
      },
      {
        dest: "",
        src: [
          "adblockplusui/*.js",
          "adblockplusui/*.html",
          "adblockpluscore/lib/content/snippets.js",
          "options.*",
          "devtools.*",
          "managed-storage-schema.json",
          "polyfill.js",
          "!adblockplusui/polyfill.js",
          "!adblockplusui/mobile-options.*"
        ]
      }
    ],
    rename: [
      {
        dest: "icons/abp-16-notification.png",
        src: "adblockplusui/skin/icons/toolbar/notification-16.png"
      },
      {
        dest: "icons/abp-16-allowlisted.png",
        src: "adblockplusui/skin/icons/toolbar/disabled-16.png"
      },
      {
        dest: "icons/abp-16.png",
        src: "adblockplusui/skin/icons/toolbar/default-16.png"
      },
      {
        dest: "icons/abp-20-notification.png",
        src: "adblockplusui/skin/icons/toolbar/notification-20.png"
      },
      {
        dest: "icons/abp-20-allowlisted.png",
        src: "adblockplusui/skin/icons/toolbar/disabled-20.png"
      },
      {
        dest: "icons/abp-20.png",
        src: "adblockplusui/skin/icons/toolbar/default-20.png"
      },
      {
        dest: "icons/abp-32-notification.png",
        src: "adblockplusui/skin/icons/toolbar/notification-32.png"
      },
      {
        dest: "icons/abp-32-allowlisted.png",
        src: "adblockplusui/skin/icons/toolbar/disabled-32.png"
      },
      {
        dest: "icons/abp-32.png",
        src: "adblockplusui/skin/icons/toolbar/default-32.png"
      },
      {
        dest: "icons/abp-40-notification.png",
        src: "adblockplusui/skin/icons/toolbar/notification-40.png"
      },
      {
        dest: "icons/abp-40-allowlisted.png",
        src: "adblockplusui/skin/icons/toolbar/disabled-40.png"
      },
      {
        dest: "icons/abp-40.png",
        src: "adblockplusui/skin/icons/toolbar/default-40.png"
      }
    ]
  },
  translations: {
    dest: "_locales",
    src: [
      "adblockplusui/locale/**/*.json",
      "!adblockplusui/locale/*/mobile-options.json"
    ]
  }
};
