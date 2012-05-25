(function() {
  var compare = Utils.versionComparator.compare;

  function allPairs(array) {
    var pairs = [];
    for (var i = 0; i < array.length - 1; i++)
      for (var j = i + 1; j < array.length; j++)
        pairs.push([array[i], array[j]]);
    return pairs;
  }

  module("Test utilities");
  test("allPairs", 1, function() {
    deepEqual(allPairs([1, 2, 3]), [[1, 2], [1, 3], [2, 3]]);
  });

  module("versionComparator");
  test("Equal versions", 6, function() {
    var versions = ["1", "1.0", "1.0.0", "1.0.0.0"];
    allPairs(versions).forEach(function(pair) {
      var v1 = pair[0];
      var v2 = pair[1];
      equal(compare(v1, v2), 0, "'" + v1 + "' should be equal to '" + v2 + "'");
    });
  });
})();
