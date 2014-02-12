(function()
{
  // Safari doesn't adjust the size of the popover automatically to the size
  // of its content, like when the ad counter is expanded/collapsed. So we add
  // event listeners to do so.
  var mayResize = true;
  var resizingScheduled = false;

  var updateSize = function()
  {
    if (mayResize && !resizingScheduled)
    {
      setTimeout(function()
      {
        safari.self.width = document.body.offsetWidth;
        safari.self.height = document.body.offsetHeight;

        resizingScheduled = false;
      }, 0);

      resizingScheduled = true;
    }
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


  // Safari will load the popover once, and then show it everytime the icon is
  // clicked. While Chrome loads it everytime you click the icon. So in order to
  // make the popover show the right state and details, we have to emulate the
  // same behavior as on Chrome, by reloading the popover every time it is shown.
  safari.self.addEventListener("popover", function()
  {
    mayResize = false;
    document.documentElement.style.display = "none";
    document.location.reload();
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
    __proto__: safari.extension.globalPage.contentWindow.ext,

    closePopup: function()
    {
      safari.self.hide();
    }
  };
})();
