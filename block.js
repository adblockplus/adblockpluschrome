/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-2015 Eyeo GmbH
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

function init()
{
  // Attach event listeners
  window.addEventListener("keydown", onKeyDown, false);
  window.addEventListener("dragstart", onDragStart, false);
  window.addEventListener("dragend", onDragEnd, false);

  $("#addButton").click(addFilters);
  $("#cancelButton").click(closeDialog.bind(null, false));

  // Apply jQuery UI styles
  $("button").button();

  ext.backgroundPage.sendMessage(
  {
    type: "forward",
    expectsResponse: true,
    payload:
    {
      type: "clickhide-init",
      width: Math.max(document.body.offsetWidth || document.body.scrollWidth),
      height: Math.max(document.body.offsetHeight || document.body.scrollHeight)
    }
  },
  function(response)
  {
    document.getElementById("filters").value = response.filters.join("\n");
  });

  document.getElementById("filters").focus();
}
window.addEventListener("load", init, false);

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
  ext.backgroundPage.sendMessage(
    {
      type: "add-filters",
      text: document.getElementById("filters").value
    },

    function(response)
    {
      if (response.status == "ok")
        closeDialog(true);
      else
        alert(response.error);
    }
  );
}

function closeDialog(success)
{
  ext.backgroundPage.sendMessage(
    {
      type: "forward",
      payload:
      {
        type: "clickhide-close",
        remove: (typeof success == "boolean" ? success : false)
      }
    }
  );
}

var dragStartX;
var dragStartY;
var dragEndX = null;
var dragEndY = null;

function onDragStart(event)
{
  var element = document.elementFromPoint(event.clientX, event.clientY);
  if (element && element.localName == "textarea")
  {
    // Don't drag the dialog when the user has clicked into the textarea.
    // Most likely the user just wants to focus it or select text there.
    event.preventDefault();
  }
  else
  {
    dragStartX = event.screenX;
    dragStartY = event.screenY;
  }
}

function onDragEnd(event)
{
  if (dragEndX == null)
    dragEndX = event.screenX;
  if (dragEndY == null)
    dragEndY = event.screenY;

  ext.backgroundPage.sendMessage({
    type: "forward",
    payload:
    {
      type: "clickhide-move",
      x: dragEndX - dragStartX,
      y: dragEndY - dragStartY
    }
  });

  dragStartX = null;
  dragStartY = null;
  dragEndX = null;
  dragEndY = null;
}

// The coordinates in the dragend event are unreliable on Safari. So we
// need to get the destination coordinates from the drag event instead.
// However on Chrome, the coordinates in the drag event are unreliable.
// So we need to get the coordinates from dragend event there.
if (navigator.userAgent.indexOf(" Version/") != -1)
{
  window.addEventListener("drag", function(event)
  {
    dragEndX = event.screenX;
    dragEndY = event.screenY;
  }, false);
}
