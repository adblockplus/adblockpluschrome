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

import assert from "assert";
import {Prefs} from "../../lib/prefs.js";

describe("Preferences", () =>
{
  function afterWrite(prefKey)
  {
    return Promise.race([
      new Promise((resolve, reject) =>
      {
        let onChange = (changes, area) =>
        {
          if (area == "local" && prefKey in changes)
          {
            browser.storage.onChanged.removeListener(onChange);
            resolve();
          }
        };
        browser.storage.onChanged.addListener(onChange);
      }),
      // We sleep 500ms in case the onChange event doesn't fire when expected.
      // Firefox 66 has a bug whereby the event doesn't fire for falsey values.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1541449
      new Promise(r => setTimeout(r, 500))
    ]);
  }

  async function performStorageTests(prefName, prefKey, defaultValue, newValue,
                                     tests)
  {
    let [method, whichValue] = tests.shift();
    let value = whichValue == "default" ? defaultValue : newValue;

    let items = await browser.storage.local.get(prefKey);
    let expectingWrite = typeof defaultValue == "object" ||
                         prefKey in items ||
                         whichValue == "new";
    if (expectingWrite)
      afterWrite(prefKey);

    if (method == "property")
      Prefs[prefName] = value;
    else
      Prefs.set(prefName, value);

    assert.deepEqual(Prefs[prefName], value,
                     `Assigned Prefs['${prefName}'] ${whichValue} value`);

    items = await browser.storage.local.get(prefKey);
    if (whichValue == "default" && typeof defaultValue != "object")
    {
      assert.equal(prefKey in items, false,
                   `${prefKey} shouldn't be present in stoage.local`);
    }
    else
    {
      assert.equal(prefKey in items, true,
                   `${prefKey} should be present in stoage.local`);

      assert.deepEqual(items[prefKey], value,
                       `${prefKey} in storage.local should have the value
                        ${JSON.stringify(value)}`);
    }

    if (tests.length)
    {
      await performStorageTests(prefName, prefKey, defaultValue, newValue,
                                tests);
    }
  }

  async function testPrefStorage(prefName, defaultValue, newValue)
  {
    let prefKey = `pref:${prefName}`;
    let tests = [["property", "default"],
                 ["property", "new"],
                 ["property", "default"],
                 ["set", "new"],
                 ["set", "default"]];

    let backupValue = Prefs[prefName];
    try
    {
      await performStorageTests(prefName, prefKey, defaultValue, newValue,
                                tests);
    }
    finally
    {
      Prefs.set(prefName, backupValue);
    }
  }

  it("stores numerical preferences", async() =>
  {
    await testPrefStorage("patternsbackups", 0, 12);
  });

  it("stores boolean preferences", async() =>
  {
    await testPrefStorage("savestats", false, true);
  });

  it("stores string preferences", async() =>
  {
    let defaultValue = "https://notification.adblockplus.org/notification.json";
    let newValue = "https://notification.adblockplus.org/foo\u1234bar.json";

    await testPrefStorage("notificationurl", defaultValue, newValue);
  });

  it("stores object preferences", async() =>
  {
    await testPrefStorage("notificationdata", {}, {foo: 1, bar: 2});
  });
});
