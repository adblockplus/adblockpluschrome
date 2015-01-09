chrome.runtime.onMessage.addListener(function(message, sender, sendResponse)
{
  return ext.onMessage._dispatch(message, {}, sendResponse).indexOf(true) != -1;
});
