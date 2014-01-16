(function()
{
  // Safari will load the popover once, and then show it everytime the icon is
  // clicked. While Chrome loads it everytime you click the icon. So in order to
  // force the same behavior in Safari, we are going to reload the page of the
  // bubble everytime it is shown.
  safari.application.addEventListener("popover", function()
  {
    document.documentElement.style.display = "none";
    document.location.reload();
  }, true);


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
  var backgroundPage = safari.extension.globalPage.contentWindow;
  window.ext = backgroundPage.ext;
  window.TabMap = backgroundPage.TabMap;
})();
