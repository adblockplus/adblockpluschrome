/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

/* eslint-env jquery */

"use strict";

let targetPageId = null;

function onKeyDown(event)
{
  if (event.keyCode == 27)
  {
    event.preventDefault();
    closeDialog();
  }
  else if (event.keyCode == 13 && !event.shiftKey && !event.ctrlKey)
  {
    event.preventDefault();
    addFilters();
  }
}

function addFilters()
{
  browser.runtime.sendMessage({
    type: "filters.importRaw",
    text: document.getElementById("filters").value
  },
  errors =>
  {
    if (errors.length > 0)
      alert(errors.join("\n"));
    else
      closeDialog(true);
  });
}

// We'd rather just call window.close, but that isn't working consistently with
// Firefox 57, even when allowScriptsToClose is passed to browser.windows.create
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1418394
function closeMe()
{
  browser.runtime.sendMessage({
    type: "app.get",
    what: "senderId"
  }).then(tabId => browser.tabs.remove(tabId));
}

function closeDialog(success)
{
  browser.runtime.sendMessage({
    type: "composer.forward",
    targetPageId,
    payload:
    {
      type: "composer.content.finished",
      popupAlreadyClosed: true,
      remove: (typeof success == "boolean" ? success : false)
    }
  });
  closeMe();
}

function init()
{
  // Attach event listeners
  window.addEventListener("keydown", onKeyDown, false);

  document.getElementById("addButton").addEventListener("click", addFilters);
  document.getElementById("cancelButton").addEventListener(
    "click", closeDialog.bind(null, false)
  );

  // Apply jQuery UI styles
  $("button").button();

  document.getElementById("filters").focus();

  ext.onMessage.addListener((msg, sender, sendResponse) =>
  {
    switch (msg.type)
    {
      case "composer.dialog.init":
        targetPageId = msg.sender;
        let filtersTextArea = document.getElementById("filters");
        filtersTextArea.value = msg.filters.join("\n");
        filtersTextArea.disabled = false;
        $("#addButton").button("option", "disabled", false);

        // Firefox sometimes tells us this window had loaded before it has[1],
        // to work around that we send the "composer.dialog.init" message again
        // when sending failed. Unfortunately sometimes sending is reported as
        // successful when it's not, but with the response of `undefined`. We
        // therefore send a response here, and check for it to see if the
        // message really was sent successfully.
        // [1] - https://bugzilla.mozilla.org/show_bug.cgi?id=1418655
        sendResponse(true);
        break;
      case "composer.dialog.close":
        closeMe();
        break;
    }
  });

  window.removeEventListener("load", init);
}
window.addEventListener("load", init, false);
