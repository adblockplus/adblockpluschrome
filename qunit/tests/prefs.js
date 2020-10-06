"use strict";

const {Prefs} = require("../../lib/prefs");

QUnit.module("Preferences", () =>
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
      // We take care to timeout after 500ms in case the onChange event doesn't
      // fire when we expect it to. For example, Firefox 66 has a bug[1] whereby
      // the event doesn't fire for falsey values.
      // 1 - https://bugzilla.mozilla.org/show_bug.cgi?id=1541449
      new Promise((resolve, reject) =>
      {
        setTimeout(() => { resolve(); }, 500);
      })
    ]);
  }

  function performStorageTests(prefName, prefKey, defaultValue, newValue, tests,
                               assert)
  {
    let [method, whichValue] = tests.shift();
    let value = whichValue == "default" ? defaultValue : newValue;

    return browser.storage.local.get(prefKey)
    .then(items =>
    {
      let expectingWrite = typeof defaultValue == "object" ||
                           prefKey in items ||
                           whichValue == "new";
      let promise = expectingWrite ? afterWrite(prefKey) : Promise.resolve();

      if (method == "property")
        Prefs[prefName] = value;
      else
        Prefs.set(prefName, value);

      assert.deepEqual(Prefs[prefName], value,
                       `Assigned Prefs['${prefName}'] ${whichValue} value`);

      return promise;
    }).then(() =>
      browser.storage.local.get(prefKey)
    ).then(items =>
    {
      if (whichValue == "default" && typeof defaultValue != "object")
      {
        assert.equal(prefKey in items, false,
                     prefKey + " shouldn't be present in stoage.local");
      }
      else
      {
        assert.equal(prefKey in items, true,
                     prefKey + " should be present in stoage.local");

        assert.deepEqual(items[prefKey], value,
                         prefKey + " in storage.local should have the value " +
                         JSON.stringify(value));
      }

      if (tests.length)
      {
        return performStorageTests(prefName, prefKey,
                                   defaultValue, newValue, tests, assert);
      }
    });
  }

  function testPrefStorage(prefName, defaultValue, newValue, assert)
  {
    let prefKey = "pref:" + prefName;
    let tests = [["property", "default"],
                 ["property", "new"],
                 ["property", "default"],
                 ["set", "new"],
                 ["set", "default"]];

    let backupValue = Prefs[prefName];
    return performStorageTests(prefName, prefKey, defaultValue, newValue, tests,
                               assert)
      .catch(exception => { assert.ok(false, exception); })
      .then(() => Prefs.set(prefName, backupValue));
  }

  QUnit.test("Numerical preference", assert =>
  {
    let done = assert.async();

    testPrefStorage("patternsbackups", 0, 12, assert).then(done);
  });

  QUnit.test("Boolean preference", assert =>
  {
    let done = assert.async();

    testPrefStorage("savestats", false, true, assert).then(done);
  });

  QUnit.test("String preference", assert =>
  {
    let done = assert.async();

    let defaultValue = "https://notification.adblockplus.org/notification.json";
    let newValue = "https://notification.adblockplus.org/foo\u1234bar.json";

    testPrefStorage("notificationurl", defaultValue, newValue, assert)
      .then(done);
  });

  QUnit.test("Object preference", assert =>
  {
    let done = assert.async();

    testPrefStorage("notificationdata", {}, {foo: 1, bar: 2}, assert)
      .then(done);
  });
});
