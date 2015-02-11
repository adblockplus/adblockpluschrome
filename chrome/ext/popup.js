window.ext = Object.create(chrome.extension.getBackgroundPage().ext);

ext.closePopup = function()
{
  window.close();
};
