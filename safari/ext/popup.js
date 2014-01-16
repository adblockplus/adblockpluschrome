(function()
{
  // Safari will load the popover once, and then show it everytime the icon is
  // clicked. While Chrome loads it everytime you click the icon. So in order to
  // force the same behavior in Safari, we are going to reload the page of the
  // bubble everytime it is shown.
  safari.application.addEventListener("popover", function()
  {
    document.documentElement.style.display = "none";
    document.location.reload();
  }, true);

  // import ext into the javascript context of the popover. This code might fail,
  // when the background page isn't ready yet. So it is important to put it below
  // the reloading code above.
  var backgroundPage = safari.extension.globalPage.contentWindow;
  window.ext = backgroundPage.ext;
  window.TabMap = backgroundPage.TabMap;
})();
