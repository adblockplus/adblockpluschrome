chrome.runtime.onMessage.addListener(function(message, sender, sendResponse)
{
  return ext.onMessage._dispatch(message, {}, sendResponse).indexOf(true) != -1;
});

ext.onExtensionUnloaded = (function()
{
  var port = null;

  return {
    addListener: function(listener)
    {
      if (!port)
        port = chrome.runtime.connect();

      // When the extension is reloaded, disabled or uninstalled the
      // background page dies and automatically disconnects all ports
      port.onDisconnect.addListener(listener);
    },
    removeListener: function(listener)
    {
      if (port)
      {
        port.onDisconnect.removeListener(listener);

        if (!port.onDisconnect.hasListeners())
        {
          port.disconnect();
          port = null;
        }
      }
    }
  };
})();
