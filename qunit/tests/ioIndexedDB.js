"use strict";

{
  const {IO} = require("io");
  const info = require("info");
  const {IndexedDBBackup} = require("../../lib/indexedDBBackup");

  const testFileNames = {
    testData: "testData",
    stat: "stat",
    simpleCheck: "simpleCheck",
    write: "writeCheck",
    read: "readCheck",
    readBackup: "readBackup",
    rename: "renameCheck"
  };
  const testData = {
    fileName: "file:" + testFileNames.testData,
    content: [1, 2, 3],
    lastModified: Date.now()
  };

  let _backupName = "test";
  let _storageData = new Map();

  IndexedDBBackup.getBackupData = () =>
  {
    return new Promise((resolve, reject) =>
    {
      if (_storageData.size)
      {
        resolve(_storageData.get(_backupName));
      }
      else
        reject({type: "NoSuchFile"});
    });
  };

  let testEdge = info.platform == "edgehtml" ? QUnit.test : QUnit.skip;

  QUnit.module("Microsoft Edge filter storage", {
    beforeEach(assert)
    {
      prePopulateStorage(assert);
    },
    afterEach(assert)
    {
      _storageData.clear();
      clearStorage(assert);
    }
  });

  testEdge("statFile", assert =>
  {
    const noFileMsg = "returns correct value if file doesn't exist" +
      " and there is no backup";
    const fileExistsMsg = "returns correct value if file exists in indexedDB";

    ok(IO.statFile(testFileNames.simpleCheck) instanceof Promise,
      "returns a promise");

    asyncReadHelper(
      IO.statFile,
      testFileNames.testData,
      {exists: true, lastModified: testData.lastModified},
      fileExistsMsg,
      assert);

    asyncReadHelper(
      IO.statFile,
      testFileNames.simpleCheck,
      {exists: false},
      noFileMsg,
      assert);
  });

  testEdge("restore backup", assert =>
  {
    let backupData = {
      content: ["backup data"],
      lastModified: Date.now()
    };
    let readFromFileMessage = "readFromFile return correct value," +
      " if a data restore is performed";
    _storageData.set(_backupName, backupData);

    asyncReadHelper(
      IO.statFile,
      testFileNames.readBackup,
      {exists: true, lastModified: backupData.lastModified},
      "statFile return correct value, if a data restore is performed",
      assert);

    callsListeners(
      testFileNames.readBackup,
      assert, backupData.content,
      readFromFileMessage);
  });

  testEdge("writeToFile", assert =>
  {
    ok(IO.writeToFile(testFileNames.simpleCheck, ["test"]) instanceof Promise,
      "returns a promise");

    writesCorrectValue(assert);
  });

  function writesCorrectValue(assert)
  {
    const writeCheck = {
      fileName: "file:writeCheck",
      content: [1, 2, 3],
      lastModified: Date.now()
    };
    let done = assert.async();

    IO.writeToFile(testFileNames.write, writeCheck.content)
      .then(() => readFromStorage(writeCheck.fileName))
      .then(result =>
      {
        deepEqual(
          Object.keys(writeCheck),
          Object.keys(result),
          "data is written in the correct format");

        deepEqual(
          writeCheck.content,
          result.content,
          "data has the correct content");
        done();
      });
  }

  testEdge("readFromFile", assert =>
  {
    const noFileMsg = "returns correct value if file doesn't exist" +
      " and there is no backup";
    const fileExistsMsg = "calls listeners with the correct values";

    ok(IO.readFromFile(testFileNames.simpleCheck) instanceof Promise,
    "returns a promise");

    asyncReadHelper(
      IO.readFromFile,
      testFileNames.read,
      {type: "NoSuchFile"},
      noFileMsg,
      assert
    );

    callsListeners(
      testFileNames.testData,
      assert,
      testData.content,
      fileExistsMsg);
  });

  function callsListeners(fileName, assert, expected, message)
  {
    let done = assert.async();
    let called = [];

    IO.readFromFile(fileName, entry => called.push(entry))
      .then(() =>
      {
        deepEqual(called, expected, message);
        done();
      });
  }

  testEdge("renameFile", assert =>
  {
    ok(IO.renameFile(testFileNames.simpleCheck) instanceof Promise,
      "returns a promise");

    checkRename(assert);
  });

  function checkRename(assert)
  {
    let done = assert.async();
    const expected = {
      fileName: "file:" + testFileNames.rename,
      content: testData.content,
      lastModified: testData.lastModified
    };

    IO.renameFile(testFileNames.testData, testFileNames.rename)
      .then(() => readFromStorage("file:" + testFileNames.rename))
      .then(result =>
      {
        deepEqual(result, expected, "overrites file");
        done();
      });
  }

  function asyncReadHelper(method, fileName, expectedValue, description, assert)
  {
    let done = assert.async();
    method(fileName)
    .then(result =>
    {
      deepEqual(result, expectedValue, description);
      done();
    })
    .catch(error =>
    {
      deepEqual(error, expectedValue, description);
      done();
    });
  }

  function readFromStorage(fileName)
  {
    return new Promise(resolve =>
    {
      let db;
      let req = indexedDB.open("adblockplus", 1);
      req.onsuccess = event =>
      {
        db = event.currentTarget.result;
        let store = db
          .transaction(["file"], "readwrite")
          .objectStore("file");

        store.get(fileName).onsuccess = evt =>
          resolve(evt.currentTarget.result);
      };
    });
  }

  function prePopulateStorage(assert)
  {
    let done = assert.async();
    let db;
    let req = indexedDB.open("adblockplus", 1);

    req.onsuccess = event =>
    {
      db = event.currentTarget.result;
      let store = db
        .transaction(["file"], "readwrite")
        .objectStore("file");

      store.put(testData).onsuccess = done;
    };
  }

  function clearStorage(assert)
  {
    let done = assert.async();
    let db;
    let req = indexedDB.open("adblockplus", 1);
    req.onsuccess = event =>
    {
      db = event.currentTarget.result;
      Promise.all(Object.values(testFileNames)
      .map(fileName => new Promise(resolveFile =>
      {
        let store = db
          .transaction(["file"], "readwrite")
          .objectStore("file");

        store.delete("file:" + fileName).onsuccess = resolveFile;
      })))
      .then(() => done());
    };
  }
}

