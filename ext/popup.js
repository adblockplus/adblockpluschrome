"use strict";

(function()
{
  if (typeof chrome == "undefined" || typeof chrome.extension == "undefined")
    window.chrome = browser;
  const backgroundPage = chrome.extension.getBackgroundPage();
  window.ext = Object.create(backgroundPage.ext);

  // We have to override ext.backgroundPage, because in order
  // to send messages the local "chrome" namespace must be used.
  window.ext.backgroundPage = {
    sendMessage: chrome.runtime.sendMessage,

    getWindow()
    {
      return backgroundPage;
    }
  };
}());
