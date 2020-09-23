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

let common = {
  webpack: {
    bundles: [
      {
        dest: "tests/unit-tests.js",
        src: ["test/unit-tests/*"]
      },
      {
        dest: "background.js",
        src: ["lib/devenvPoller.js"]
      }
    ]
  },
  mapping: {
    copy: [
      {
        dest: "tests",
        src: [
          "node_modules/mocha/mocha.js",
          "node_modules/mocha/mocha.css",
          "test/unit-tests/mocha/*"
        ]
      }
    ]
  },
  unitTests: {
    scripts: [
      "mocha.js",
      "mocha-setup.js",
      "../polyfill.js",
      "../ext/common.js",
      "../ext/background.js",
      "unit-tests.js",
      "mocha-runner.js"
    ]
  }
};

export let chromeDev = {...common, extends: "chrome"};
export let firefoxDev = {...common, extends: "firefox"};
