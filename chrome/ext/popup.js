window.ext = {
  __proto__: chrome.extension.getBackgroundPage().ext,

  closePopup: function()
  {
    window.close();
  }
};
