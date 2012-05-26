(function()
{
  var compare = Utils.versionComparator.compare;

  function allPairs(array)
  {
    var pairs = [];
    for (var i = 0; i < array.length - 1; i++)
      for (var j = i + 1; j < array.length; j++)
        pairs.push([array[i], array[j]]);
    return pairs;
  }

  module("Test utilities");
  test("allPairs", 1, function()
  {
    deepEqual(allPairs([1, 2, 3]), [[1, 2], [1, 3], [2, 3]]);
  });

  module("versionComparator");

  test("Equal versions", 6, function()
  {
    var versions = ["1", "1.0", "1.0.0", "1.0.0.0"];
    allPairs(versions).forEach(function(pair)
    {
      var v1 = pair[0];
      var v2 = pair[1];
      equal(compare(v1, v2), 0, "'" + v1 + "' should be equal to '" + v2 + "'");
    });
  });

  test("Examples", 30, function()
  {
    var examples = [
      "1.0pre1",
      "1.0pre2",
      ["1.0", "1.0.0", "1.0.0.0"],
      ["1.1pre", "1.1pre0", "1.0+"],
      "1.1pre1a",
      "1.1pre1",
      "1.1pre10a",
      "1.1pre10"
    ];

    // TODO: Compare all values in arrays for equality

    allPairs(examples).forEach(function(pair)
    {
      var v1 = pair[0];
      var v2 = pair[1];
      // TODO: Compare against each element of the array
      if (v1 instanceof Array || v2 instanceof Array)
        return;
      equal(compare(v1, v2), -1,
            "'" + v1 + "' should be smaller than '" + v2 + "'");
      equal(compare(v2, v1), 1,
            "'" + v2 + "' should be larger than '" + v1 + "'");
    });
  });
})();
