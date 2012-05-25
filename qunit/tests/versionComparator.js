(function() {
    var compare = Utils.versionComparator.compare;

    test("Equal versions", 1, function() {
        equal(compare("1", "1"), 0);
    });
})();
