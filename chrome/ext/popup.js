"use strict";

{
  const backgroundPage = chrome.extension.getBackgroundPage();
  var ext = Object.create(backgroundPage.ext);

  ext.closePopup = () =>
  {
    window.close();
  };

  // We have to override ext.backgroundPage, because in order
  // to send messages the local "chrome" namespace must be used.
  ext.backgroundPage = {
    sendMessage: chrome.runtime.sendMessage,

    getWindow()
    {
      return backgroundPage;
    }
  };
}
