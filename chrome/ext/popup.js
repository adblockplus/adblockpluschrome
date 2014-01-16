(function()
{
  var backgroundPage = chrome.extension.getBackgroundPage();
  window.ext = backgroundPage.ext;
  window.TabMap = backgroundPage.TabMap;
})();
