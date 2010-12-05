/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * T. Joseph <tom@adblockplus.org>
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview Utility functions and classes.
 * This file is included from AdblockPlus.js.
 */

var threadManager = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager);

// String service
var stringService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
var strings = stringService.createBundle("chrome://adblockplus/locale/global.properties");
abp.getString = function(name) {
  return strings.GetStringFromName(name);
};

// Retrieves the window object for a node or returns null if it isn't possible
function getWindow(node) {
  if (node && node.nodeType != Node.DOCUMENT_NODE)
    node = node.ownerDocument;

  if (!node || node.nodeType != Node.DOCUMENT_NODE)
    return null;

  return node.defaultView;
}

// Unwraps jar:, view-source: and wyciwyg: URLs, returns the contained URL
function unwrapURL(url) {
  if (!(url instanceof Ci.nsIURI))
    url = makeURL(url);

  try
  {
    switch (url.scheme)
    {
      case "view-source":
        return unwrapURL(url.path);
      case "wyciwyg":
        return unwrapURL(url.path.replace(/^\/\/\d+\//, ""));
      case "jar":
        return unwrapURL(url.QueryInterface(Ci.nsIJARURI).JARFile);
      default:
        if (url instanceof Ci.nsIURL && url.ref)
          return makeURL(url.spec.replace(/#.*/, ""));
        else
          return url;
    }
  }
  catch (e) { return url; }
}
abp.unwrapURL = unwrapURL;

// Returns an nsIURI for given url
function makeURL(url) {
  try
  {
    return ioService.newURI(url, null, null);
  }
  catch (e) {
    return null;
  }
}
abp.makeURL = makeURL;

// Generates a click handler for object tabs
function generateClickHandler(wnd, data) {
  return function(event) {
    event.preventDefault();
    wnd.openDialog("chrome://adblockplus/content/ui/composer.xul", "_blank", "chrome,centerscreen,resizable,dialog=no,dependent", wnd, data); 
  }
}

// Creates a tab above/below the new object node
function addObjectTab(wnd, node, data, tab)
{
  if (!node.parentNode)
    return;

  // Click event handler
  tab.setAttribute("href", data.location);
  tab.setAttribute("class", policy.objtabClass);
  tab.addEventListener("click", generateClickHandler(wnd, data), false);

  // Insert tab into the document
  if (node.nextSibling)
    node.parentNode.insertBefore(tab, node.nextSibling);
  else
    node.parentNode.appendChild(tab);
}

/**
 * Posts an action to the event queue of the current thread to run it
 * asynchronously. Any additional parameters to this function are passed
 * as parameters to the callback.
 */
function runAsync(/**Function*/ callback, /**Object*/ thisPtr)
{
  let params = Array.prototype.slice.call(arguments, 2);
  let runnable = {
    run: function()
    {
      callback.apply(thisPtr, params);
    }
  };
  threadManager.currentThread.dispatch(runnable, Ci.nsIEventTarget.DISPATCH_NORMAL);
}
abp.runAsync = runAsync;

/**
 * Gets the DOM window associated with a particular request (if any).
 */
function getRequestWindow(/**nsIChannel*/ channel) /**nsIDOMWindow*/
{
  let callbacks = [];
  if (channel.notificationCallbacks)
    callbacks.push(channel.notificationCallbacks);
  if (channel.loadGroup && channel.loadGroup.notificationCallbacks)
    callbacks.push(channel.loadGroup.notificationCallbacks);

  for each (let callback in callbacks)
  {
    try {
      // For Gecko 1.9.1
      return callback.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}

    try {
      // For Gecko 1.9.0
      return callback.getInterface(Ci.nsIDOMWindow);
    } catch(e) {}
  }

  return null;
}

// Returns plattform dependent line break string
var lineBreak = null;
function getLineBreak() {
  if (lineBreak == null) {
    // HACKHACK: Gecko doesn't expose NS_LINEBREAK, try to determine
    // plattform's line breaks by reading prefs.js
    lineBreak = "\n";
    try {
      var dirService = Cc["@mozilla.org/file/directory_service;1"].createInstance(Ci.nsIProperties);
      var prefFile = dirService.get("PrefF", Ci.nsIFile);
      var inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      inputStream.init(prefFile, 0x01, 0444, 0);

      var scriptableStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      scriptableStream.init(inputStream);
      var data = scriptableStream.read(1024);
      scriptableStream.close();

      if (/(\r\n?|\n\r?)/.test(data))
        lineBreak = RegExp.$1;
    } catch (e) {}
  }
  return lineBreak;
}
abp.getLineBreak = getLineBreak;

// Removes unnecessary whitespaces from filter
function normalizeFilter(text) {
  if (!text)
    return text;

  // Remove line breaks and such
  text = text.replace(/[^\S ]/g, "");

  if (/^\s*!/.test(text)) {
    // Don't remove spaces inside comments
    return text.replace(/^\s+/, "").replace(/\s+$/, "");
  }
  else if (Filter.elemhideRegExp.test(text)) {
    // Special treatment for element hiding filters, right side is allowed to contain spaces
    /^(.*?)(#+)(.*)$/.test(text);   // .split(..., 2) will cut off the end of the string
    var domain = RegExp.$1;
    var separator = RegExp.$2;
    var selector = RegExp.$3;
    return domain.replace(/\s/g, "") + separator + selector.replace(/^\s+/, "").replace(/\s+$/, "");
  }
  else
    return text.replace(/\s/g, "");
}
abp.normalizeFilter = normalizeFilter;

/**
 * Generates filter subscription checksum.
 *
 * @param {Array of String} lines filter subscription lines (with checksum line removed)
 * @return {String} checksum or null
 */
function generateChecksum(lines)
{
  let stream = null;
  try
  {
    // Checksum is an MD5 checksum (base64-encoded without the trailing "=") of
    // all lines in UTF-8 without the checksum line, joined with "\n".

    let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    stream = converter.convertToInputStream(lines.join("\n"));

    let hashEngine = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
    hashEngine.init(hashEngine.MD5);
    hashEngine.updateFromStream(stream, stream.available());
    return hashEngine.finish(true).replace(/=+$/, "");
  }
  catch (e)
  {
    return null;
  }
  finally
  {
    if (stream)
      stream.close();
  }
}
abp.generateChecksum = generateChecksum;

let _wrapNodeArray = null;

/**
 * Forces XPCNativeWrapper on a DOM element. This is used only in tests.
 */
function wrapNode(node)
{
  if (!_wrapNodeArray)
    _wrapNodeArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

  _wrapNodeArray.appendElement(node, false);
  let result = _wrapNodeArray.queryElementAt(0, Ci.nsISupports);
  _wrapNodeArray.removeElementAt(0);
  return result;
}
abp.wrapNode = wrapNode;
