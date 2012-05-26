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

  function versionsEqual(versions)
  {
    allPairs(versions).forEach(function(pair)
    {
      var v1 = pair[0];
      var v2 = pair[1];
      equal(compare(v1, v2), 0, "'" + v1 + "' should be equal to '" + v2 + "'");
    });
  }

  function versionLarger(v1, v2)
  {
    equal(compare(v1, v2), -1,
          "'" + v1 + "' should be smaller than '" + v2 + "'");
    equal(compare(v2, v1), 1,
          "'" + v2 + "' should be larger than '" + v1 + "'");
  }

  module("Test utilities");
  test("allPairs", 1, function()
  {
    deepEqual(allPairs([1, 2, 3]), [[1, 2], [1, 3], [2, 3]]);
  });

  module("versionComparator");

  test("Optional zero", 6, function() {
    versionsEqual(["1", "1.0", "1.0.0", "1.0.0.0"]);
  });

  test("Examples", 106, function()
  {
    var examples = [
      "1.0pre1",
      "1.0pre2",
      ["1.0", "1.0.0", "1.0.0.0"],
      ["1.1pre", "1.1pre0"/*, "1.0+"*/], // TODO: Support +
      "1.1pre1a",
      "1.1pre1",
      "1.1pre10a",
      "1.1pre10"
    ];

    examples.forEach(function(example)
    {
      if (example instanceof Array)
        versionsEqual(example);
    });

    allPairs(examples).forEach(function(pair)
    {
      var v1 = [].concat(pair[0]);
      var v2 = [].concat(pair[1]);
      for (var i = 0; i < v1.length; i++)
        for (var j = 0; j < v2.length; j++)
          versionLarger(v1[i], v2[j]);
    });
  });
})();
