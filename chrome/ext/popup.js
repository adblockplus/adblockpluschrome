(function()
{
  var backgroundPage = chrome.extension.getBackgroundPage();
  window.ext = Object.create(backgroundPage.ext);

  ext.closePopup = function()
  {
    window.close();
  };

  // We have to override ext.backgroundPage, because in order
  // to send messages the local "chrome" namespace must be used.
  ext.backgroundPage = {
    sendMessage: chrome.runtime.sendMessage,

    getWindow: function()
    {
      return backgroundPage;
    }
  };
})();
