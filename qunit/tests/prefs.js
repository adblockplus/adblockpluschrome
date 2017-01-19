"use strict";

{
  module("Preferences",
  {
    setup()
    {
      preparePrefs.call(this);
    },

    teardown()
    {
      restorePrefs.call(this);
    }
  });

  function checkPrefExists(name, expectedValue, description, assert)
  {
    let done = assert.async();
    let key = "pref:" + name;
    chrome.storage.local.get(key, items =>
    {
      equal(key in items, expectedValue, description);
      done();
    });
  }

  function checkPref(name, expectedValue, description, assert)
  {
    let done = assert.async();
    let key = "pref:" + name;
    chrome.storage.local.get(key, items =>
    {
      deepEqual(items[key], expectedValue, description);
      done();
    });
  }

  test("Numerical pref", assert =>
  {
    Prefs.patternsbackups = 5;
    equal(Prefs.patternsbackups, 5, "Prefs object returns the correct value after setting pref to default value");
    checkPrefExists("patternsbackups", false, "User-defined pref has been removed", assert);
    Prefs.patternsbackups = 12;
    equal(Prefs.patternsbackups, 12, "Prefs object returns the correct value after setting pref to non-default value");
    checkPrefExists("patternsbackups", true, "User-defined pref has been created", assert);
    checkPref("patternsbackups", 12, "Value has been written", assert);
  });

  test("Boolean pref", assert =>
  {
    Prefs.enabled = true;
    equal(Prefs.enabled, true, "Prefs object returns the correct value after setting pref to default value");
    checkPrefExists("enabled", false, "User-defined pref has been removed", assert);
    Prefs.enabled = false;
    equal(Prefs.enabled, false, "Prefs object returns the correct value after setting pref to non-default value");
    checkPrefExists("enabled", true, "User-defined pref has been created", assert);
    checkPref("enabled", false, "Value has been written", assert);
  });

  test("String pref", assert =>
  {
    let defaultValue = "https://notification.adblockplus.org/notification.json";
    Prefs.notificationurl = defaultValue;
    equal(Prefs.notificationurl, defaultValue, "Prefs object returns the correct value after setting pref to default value");
    checkPrefExists("notificationurl", false, "User-defined pref has been removed", assert);

    let newValue = "https://notification.adblockplus.org/foo\u1234bar.json";
    Prefs.notificationurl = newValue;
    equal(Prefs.notificationurl, newValue, "Prefs object returns the correct value after setting pref to non-default value");
    checkPrefExists("notificationurl", true, "User-defined pref has been created", assert);
    checkPref("notificationurl", newValue, "Value has been written", assert);
  });

  test("Object pref (complete replacement)", assert =>
  {
    Prefs.notificationdata = {};
    deepEqual(Prefs.notificationdata, {}, "Prefs object returns the correct value after setting pref to default value");

    let newValue = {foo:1, bar: "adsf\u1234"};
    Prefs.notificationdata = newValue;
    equal(Prefs.notificationdata, newValue, "Prefs object returns the correct value after setting pref to non-default value");
    checkPrefExists("notificationdata", true, "User-defined pref has been created", assert);
    checkPref("notificationdata", newValue, "Value has been written", assert);
  });

  test("Property-wise modification", assert =>
  {
    Prefs.notificationdata = {};

    Prefs.notificationdata.foo = 1;
    Prefs.notificationdata.bar = 2;
    Prefs.notificationdata = JSON.parse(JSON.stringify(Prefs.notificationdata));
    deepEqual(Prefs.notificationdata, {foo:1, bar: 2}, "Prefs object returns the correct value after setting pref to non-default value");
    checkPrefExists("notificationdata", true, "User-defined pref has been created", assert);
    checkPref("notificationdata", {foo:1, bar: 2}, "Value has been written", assert);

    delete Prefs.notificationdata.foo;
    delete Prefs.notificationdata.bar;
    Prefs.notificationdata = JSON.parse(JSON.stringify(Prefs.notificationdata));
    deepEqual(Prefs.notificationdata, {}, "Prefs object returns the correct value after setting pref to default value");
  });
}
