(function()
{
  var backgroundPage = chrome.extension.getBackgroundPage();
  window.ext = {
    __proto__: backgroundPage.ext,
    closePopup: function()
    {
      window.close();
    }
  };
  window.TabMap = backgroundPage.TabMap;
})();
