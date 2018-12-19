"use strict";

{
  const {IndexedDBBackup} = require("../../lib/indexedDBBackup");
  const info = require("info");
  const {filterStorage} = require("../../adblockpluscore/lib/filterStorage");
  const {Filter} = require("../../adblockpluscore/lib/filterClasses");
  const {Subscription, SpecialSubscription} =
    require("../../adblockpluscore/lib/subscriptionClasses");

  let backupDelay = 100;
  let subscription = Subscription.fromObject({
    title: "test",
    url: "test.com",
    homepage: "example.com",
    lastSuccess: 8,
    disabled: false,
    lastDownload: 12,
    lastCheck: 16,
    softExpiration: 18,
    expires: 20,
    downloadStatus: "done",
    errors: 3,
    version: 24,
    downloadCount: 1,
    requiredVersion: "0.6"
  });
  let filter = Filter.fromText("example.com");
  let specialSubscription = SpecialSubscription.createForFilter(filter);

  let testEdge = info.platform == "edgehtml" ? QUnit.test : QUnit.skip;

  QUnit.module("Microsoft Edge indexedDB backup", {
    beforeEach()
    {
      this._storageLocalSet = browser.storage.local.set;
      IndexedDBBackup.setBackupInterval(backupDelay);
    },
    afterEach()
    {
      Object.defineProperty(
        browser.storage.local, "set",
        {value: this._storageLocalSet, enumerable: true}
      );
      IndexedDBBackup.setBackupInterval();
    }
  });

  testEdge("Backup creation", assert =>
  {
    testSaveSteps(assert);
  });

  function testSaveSteps(assert)
  {
    let start = performance.now();
    let saveTimes = [];

    let steps = [
      {
        done: assert.async(),
        check(data)
        {
          let expectedFormat = [
            "[Subscription]",
            `url=${specialSubscription.url}`,
            "defaults=blocking",
            "[Subscription filters]",
            "example.com",
            "[Subscription]",
            "homepage=example.com",
            "title=test",
            "url=test.com",
            "disabled=false"
          ];

          ok(
            saveTimes[0] - start >= backupDelay,
            "first write is deferred"
          );
          deepEqual(
            data.content,
            expectedFormat,
            "saved data has the correct information"
          );

          filterStorage.removeSubscription(subscription);
          filterStorage.removeSubscription(specialSubscription);
        }
      },
      {
        done: assert.async(),
        check(data)
        {
          ok(
            saveTimes[1] - saveTimes[0] >= backupDelay,
            "next changes are saved after the write delay"
          );
          deepEqual(
            data.content, [], "saved data has the correct information"
          );
        }
      }
    ];
    let mockSave = data =>
    {
      let step = steps.shift();

      saveTimes.push(performance.now());

      setTimeout(() =>
      {
        step.check(data["file:indexedDB-backup"]);
        step.done();
      }, 0);
    };

    Object.defineProperty(
      browser.storage.local, "set",
      {value: mockSave, enumerable: true}
    );

    filterStorage.addSubscription(specialSubscription);
    filterStorage.addSubscription(subscription);
  }
}
