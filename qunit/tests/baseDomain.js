(function()
{
  var tests = [
    ["com", "com"],
    ["example.com", "example.com"],
    ["www.example.com", "example.com"],
    ["www.example.com.", "example.com"],
    ["www.example.co.uk", "example.co.uk"],
    ["www.example.co.uk.", "example.co.uk"],
    ["www.example.bl.uk", "bl.uk"],
    ["foo.bar.example.co.uk", "example.co.uk"],
    ["1.2.3.4.com", "4.com"],
    ["1.2.3.4.bg", "3.4.bg"],
    ["1.2.3.4", "1.2.3.4"],
    ["1.2.0x3.0x4", "1.2.0x3.0x4"],
    ["1.2.3", "2.3"],
    ["1.2.0x3g.0x4", "0x3g.0x4"],
    ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"],
    ["2001::7334", "2001::7334"],
    ["::ffff:1.2.3.4", "::ffff:1.2.3.4"],
    ["foo.bar.2001::7334", "bar.2001::7334"],
    ["test.xn--e1aybc.xn--p1ai", "тест.рф"],
  ];

  module("Base domain extraction");

  test("Examples", function()
  {
    for (var i = 0; i < tests.length; i++)
      equal(getBaseDomain(tests[i][0]), tests[i][1], tests[i][0]);
  });
})();
