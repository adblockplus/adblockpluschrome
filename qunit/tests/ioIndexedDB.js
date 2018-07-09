"use strict";

{
  const {IO} = require("io");
  const info = require("info");

  const testFileNames = {
    testData: "testData",
    simpleCheck: "simpleCheck",
    write: "writeCheck",
    read: "readCheck",
    rename: "renameCheck"
  };
  const testData = {
    fileName: "file:" + testFileNames.testData,
    content: [1, 2, 3],
    lastModified: Date.now()
  };

  let testEdge = info.platform == "edgehtml" ? QUnit.test : QUnit.skip;

  QUnit.module("Microsoft Edge filter storage", {
    beforeEach()
    {
      return prePopulateStorage();
    },
    afterEach()
    {
      return clearStorage();
    }
  });

  testEdge("statFile", assert =>
  {
    const noFileMsg = "returns correct value if file doesn't exist";
    const fileExistsMsg = "returns correct value if file exists";

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
    const noFileMsg = "returns correct value if file doesn't exist";

    ok(IO.readFromFile(testFileNames.simpleCheck) instanceof Promise,
    "returns a promise");

    asyncReadHelper(
      IO.readFromFile,
      testFileNames.read,
      {type: "NoSuchFile"},
      noFileMsg,
      assert
    );

    callsListeners(assert);
  });

  function callsListeners(assert)
  {
    let done = assert.async();
    let called = [];

    IO.readFromFile(testFileNames.testData, (entry) => called.push(entry))
      .then(() =>
      {
        deepEqual(
          called,
          testData.content,
          "calls listeners with the correct values");
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
      req.onsuccess = (event) =>
      {
        db = event.currentTarget.result;
        let store = db
          .transaction(["file"], "readwrite")
          .objectStore("file");

        store.get(fileName).onsuccess = (evt =>
          resolve(evt.currentTarget.result)
        );
      };
    });
  }

  function prePopulateStorage()
  {
    return new Promise(resolve =>
    {
      let db;
      let req = indexedDB.open("adblockplus", 1);

      req.onsuccess = (event) =>
      {
        db = event.currentTarget.result;
        let store = db
          .transaction(["file"], "readwrite")
          .objectStore("file");

        store.put(testData).onsuccess = resolve;
      };
    });
  }

  function clearStorage()
  {
    return new Promise(resolve =>
      {
      let db;
      let req = indexedDB.open("adblockplus", 1);

      req.onsuccess = (event) =>
      {
        db = event.currentTarget.result;
        let files = Object.keys(testFileNames)
          .map(fileName => new Promise((resolveFile, reject) =>
          {
            let store = db
              .transaction(["file"], "readwrite")
              .objectStore("file");

            store.delete("file:" + fileName).onsuccess = resolveFile;
          }));

        Promise.all(files).then(resolve);
      };
    });
  }
}

