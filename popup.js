var backgroundPage = chrome.extension.getBackgroundPage();
var imports = ["FilterStorage", "Filter", "isWhitelisted", "extractHostFromURL", "refreshIconAndContextMenu"];
for (var i = 0; i < imports.length; i++)
  window[imports[i]] = backgroundPage[imports[i]];

var tab = null;

function init()
{
  // Attach event listeners
  $("#enabled").click(toggleEnabled);
  $("#clickHideButton").click(activateClickHide);
  $("#cancelButton").click(cancelClickHide);

  // Ask content script whether clickhide is active. If so, show cancel button.
  // If that isn't the case, ask background.html whether it has cached filters. If so,
  // ask the user whether she wants those filters.
  // Otherwise, we are in default state.
  chrome.windows.getCurrent(function(w)
  {
    chrome.tabs.getSelected(w.id, function(t)
    {
      tab = t;
      document.getElementById("enabled").checked = !isWhitelisted(tab.url);
      document.getElementById("enabledCheckboxAndLabel").style.display = "block";

      chrome.tabs.sendRequest(tab.id, {reqtype: "get-clickhide-state"}, function(response)
      {
        if(response.active)
          clickHideActiveStuff();
        else
          clickHideInactiveStuff();
      });
    });
  });
}
$(init);

function toggleEnabled()
{
  var checked = document.getElementById("enabled").checked;
  if (checked)
  {
    // Remove any exception rules applying to this URL
    var filter = isWhitelisted(tab.url);
    while (filter)
    {
      FilterStorage.removeFilter(filter);
      if (filter.subscriptions.length)
        filter.disabled = true;
      filter = isWhitelisted(tab.url);
    }
  }
  else
  {
    var host = extractHostFromURL(tab.url).replace(/^www\./, "");
    var filter = Filter.fromText("@@||" + host + "^$document");
    if (filter.subscriptions.length && filter.disabled)
      filter.disabled = false;
    else
    {
      filter.disabled = false;
      FilterStorage.addFilter(filter);
    }
  }

  refreshIconAndContextMenu(tab);
}

function activateClickHide()
{
  clickHideActiveStuff();
  chrome.tabs.sendRequest(tab.id, {reqtype: "clickhide-activate"});

  // Close the popup after a few seconds, so user doesn't have to
  activateClickHide.timeout = window.setTimeout(window.close, 5000);
}

function cancelClickHide()
{
  if (activateClickHide.timeout)
  {
    window.clearTimeout(activateClickHide.timeout);
    activateClickHide.timeout = null;
  }
  clickHideInactiveStuff();
  chrome.tabs.sendRequest(tab.id, {reqtype: "clickhide-deactivate"});
}

function clickHideActiveStuff()
{
  document.getElementById("enabledCheckboxAndLabel").style.display = "none";
  document.getElementById("clickHideInactiveStuff").style.display = "none";
  document.getElementById("clickHideActiveStuff").style.display = "inherit";
}

function clickHideInactiveStuff()
{
  document.getElementById("enabledCheckboxAndLabel").style.display = "block";
  document.getElementById("clickHideActiveStuff").style.display = "none";
  document.getElementById("clickHideInactiveStuff").style.display = "inherit";
}
