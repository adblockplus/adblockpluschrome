(function()
{
  // Safari will load the popover once, and then show it everytime the icon is
  // clicked. While Chrome loads it everytime you click the icon. So in order to
  // make the popover show the right state and details we have to reload it
  // everytime it is shown for a different tab. Also we have to reload the
  // popover when the background page wasn't ready yet, since we have to access
  // the background page in the popover.
  var backgroundPage = safari.extension.globalPage.contentWindow;
  var readyState = backgroundPage.document.readyState;
  var activeTab = safari.application.activeBrowserWindow.activeTab;

  safari.self.addEventListener("popover", function()
  {
    if (activeTab != safari.application.activeBrowserWindow.activeTab || readyState != "complete")
    {
      document.documentElement.style.display = "none";
      document.location.reload();
    }
  });


  // Safari doesn't adjust the size of the popover automatically to the size
  // of its content, like when the ad counter is expanded/collapsed. So we add
  // event listeners to do so.
  var updateSize = function()
  {
    safari.self.width = document.body.offsetWidth;
    safari.self.height = document.body.offsetHeight;
  };

  window.addEventListener("load", function()
  {
    updateSize();

    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
    if (MutationObserver)
    {
      new MutationObserver(updateSize).observe(document, {
        childList: true, attributes: true,
        characterData: true, subtree: true
      });
    }
    else
      document.addEventListener("DOMSubtreeModified", updateSize);
  });


  // Safari doesn't hide popovers automatically, when we change the active tab
  // programmatically, like when the options link is clicked. So we add an event
  // listener to do so.
  safari.application.addEventListener("activate", function()
  {
    safari.self.hide();
  }, true);


  // import ext into the javascript context of the popover. This code might fail,
  // when the background page isn't ready yet. So it is important to put it below
  // the reloading code above.
  window.ext = {
    __proto__: backgroundPage.ext,
    closePopup: function()
    {
      safari.self.hide();
    }
  };
  window.TabMap = backgroundPage.TabMap;
})();
