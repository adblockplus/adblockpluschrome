"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
  return ext.onMessage._dispatch(message, {}, sendResponse).indexOf(true) != -1;
});

{
  let port = null;

  ext.onExtensionUnloaded = {
    addListener(listener)
    {
      if (!port)
        port = chrome.runtime.connect();

      // When the extension is reloaded, disabled or uninstalled the
      // background page dies and automatically disconnects all ports
      port.onDisconnect.addListener(listener);
    },
    removeListener(listener)
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
}
