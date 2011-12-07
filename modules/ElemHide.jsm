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
 * Portions created by the Initial Developer are Copyright (C) 2006-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

//
// This file has been generated automatically from Adblock Plus source code
//

(function (_patchFunc0) {
  var filterByKey = {
    __proto__: null
  };
  var styleURL = null;
  var ElemHide = {
    isDirty: false,
    applied: false,
    keyByFilter: {
      __proto__: null
    },
    init: function () {
      Prefs.addListener(function (name) {
        if (name == "enabled")
          ElemHide.apply();
      }
      );
      var styleFile = Utils.resolveFilePath(Prefs.data_directory);
      styleFile.append("elemhide.css");
      styleURL = Utils.ioService.newFileURI(styleFile).QueryInterface(Ci.nsIFileURL);
      var registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
      registrar.registerFactory(ElemHidePrivate.classID, ElemHidePrivate.classDescription, "@mozilla.org/network/protocol/about;1?what=" + ElemHidePrivate.aboutPrefix, ElemHidePrivate);
    }
    ,
    clear: function () {
      filterByKey = {
        __proto__: null
      };
      ElemHide.keyByFilter = {
        __proto__: null
      };
      ElemHide.isDirty = false;
      ElemHide.unapply();
    }
    ,
    add: function (filter) {
      if (filter.text in ElemHide.keyByFilter)
        return ;
      var key;
      do {
        key = Math.random().toFixed(15).substr(5);
      }
      while (key in filterByKey);
      filterByKey[key] = filter.text;
      ElemHide.keyByFilter[filter.text] = key;
      ElemHide.isDirty = true;
    }
    ,
    remove: function (filter) {
      if (!(filter.text in ElemHide.keyByFilter))
        return ;
      var key = ElemHide.keyByFilter[filter.text];
      delete filterByKey[key];
      delete ElemHide.keyByFilter[filter.text];
      ElemHide.isDirty = true;
    }
    ,
    apply: function () {
      if (ElemHide.applied)
        ElemHide.unapply();
      try {
        if (!Prefs.enabled) {
          return ;
        }
        if (ElemHide.isDirty) {
          ElemHide.isDirty = false;
          var domains = {
            __proto__: null
          };
          var hasFilters = false;
          for (var key in filterByKey) {
            var filter = Filter.knownFilters[filterByKey[key]];
            if (!filter) {
              delete filterByKey[key];
              continue;
            }
            var domain = filter.selectorDomain || "";
            var list;
            if (domain in domains)
              list = domains[domain];
             else {
              list = {
                __proto__: null
              };
              domains[domain] = list;
            }
            list[filter.selector] = key;
            hasFilters = true;
          }
          if (!hasFilters) {
            return ;
          }
          try {
            styleURL.file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 493);
          }
          catch (e){}
          var stream;
          try {
            stream = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
            stream.init(styleURL.file, 2 | 8 | 32, 420, 0);
          }
          catch (e){
            Cu.reportError(e);
            return ;
          }
          var buf = [];
          var maxBufLen = 1024;
          function escapeChar(match) {
            return "\\" + match.charCodeAt(0).toString(16) + " ";
          }
          function writeString(str, forceWrite) {
            buf.push(str);
            if (buf.length >= maxBufLen || forceWrite) {
              var output = buf.join("").replace(/[^\x01-\x7F]/g, escapeChar);
              stream.write(output, output.length);
              buf.splice(0, buf.length);
            }
          }
          var cssTemplate = "-moz-binding: url(about:" + ElemHidePrivate.aboutPrefix + "?%ID%#dummy) !important;";
          for (var domain in domains) {
            var rules = [];
            var list = domains[domain];
            if (domain)
              writeString("@-moz-document domain(\"" + domain.split(",").join("\"),domain(\"") + "\"){\n");
             else {
              writeString("@-moz-document url-prefix(\"http://\"),url-prefix(\"https://\"),url-prefix(\"mailbox://\"),url-prefix(\"imap://\"),url-prefix(\"news://\"),url-prefix(\"snews://\"){\n");
            }
            for (var selector in list)
              writeString(selector + "{" + cssTemplate.replace("%ID%", list[selector]) + "}\n");
            writeString("}\n");
          }
          writeString("", true);
          try {
            stream.QueryInterface(Ci.nsISafeOutputStream).finish();
          }
          catch (e){
            Cu.reportError(e);
            return ;
          }
        }
        try {
          Utils.styleService.loadAndRegisterSheet(styleURL, Ci.nsIStyleSheetService.USER_SHEET);
          ElemHide.applied = true;
        }
        catch (e){
          Cu.reportError(e);
        }
      }
      finally {
        FilterNotifier.triggerListeners("elemhideupdate");
      }
    }
    ,
    unapply: function () {
      if (ElemHide.applied) {
        try {
          Utils.styleService.unregisterSheet(styleURL, Ci.nsIStyleSheetService.USER_SHEET);
        }
        catch (e){
          Cu.reportError(e);
        }
        ElemHide.applied = false;
      }
    }
    ,
    get styleURL() {
      return ElemHide.applied ? styleURL.spec : null;
    },
    getFilterByKey: function (key) {
      return (key in filterByKey ? Filter.knownFilters[filterByKey[key]] : null);
    }
    ,
    toCache: function (cache) {
      cache.elemhide = {
        filterByKey: filterByKey
      };
    }
    ,
    fromCache: function (cache) {
      filterByKey = cache.elemhide.filterByKey;
      filterByKey.__proto__ = null;
      delete ElemHide.keyByFilter;
      ElemHide.__defineGetter__("keyByFilter", function () {
        var result = {
          __proto__: null
        };
        for (var k in filterByKey)
          result[filterByKey[k]] = k;
        return ElemHide.keyByFilter = result;
      }
      );
      ElemHide.__defineSetter__("keyByFilter", function (value) {
        delete ElemHide.keyByFilter;
        return ElemHide.keyByFilter = value;
      }
      );
    }
    
  };
  var ElemHidePrivate = {
    classID: Components.ID("{55fb7be0-1dd2-11b2-98e6-9e97caf8ba67}"),
    classDescription: "Element hiding hit registration protocol handler",
    aboutPrefix: "abp-elemhidehit",
    createInstance: function (outer, iid) {
      if (outer != null)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      return this.QueryInterface(iid);
    }
    ,
    getURIFlags: function (uri) {
      return ("HIDE_FROM_ABOUTABOUT" in Ci.nsIAboutModule ? Ci.nsIAboutModule.HIDE_FROM_ABOUTABOUT : 0);
    }
    ,
    newChannel: function (uri) {
      if (!/\?(\d+)/.test(uri.path))
        throw Cr.NS_ERROR_FAILURE;
      return new HitRegistrationChannel(uri, RegExp["$1"]);
    }
    ,
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory, Ci.nsIAboutModule])
  };
  function HitRegistrationChannel(uri, key) {
    this.key = key;
    this.URI = this.originalURI = uri;
  }
  HitRegistrationChannel.prototype = {
    key: null,
    URI: null,
    originalURI: null,
    contentCharset: "utf-8",
    contentLength: 0,
    contentType: "text/xml",
    owner: Utils.systemPrincipal,
    securityInfo: null,
    notificationCallbacks: null,
    loadFlags: 0,
    loadGroup: null,
    name: null,
    status: Cr.NS_OK,
    asyncOpen: function (listener, context) {
      var stream = this.open();
      Utils.runAsync(function () {
        try {
          listener.onStartRequest(this, context);
        }
        catch (e){}
        try {
          listener.onDataAvailable(this, context, stream, 0, stream.available());
        }
        catch (e){}
        try {
          listener.onStopRequest(this, context, Cr.NS_OK);
        }
        catch (e){}
      }
      , this);
    }
    ,
    open: function () {
      var data = "<bindings xmlns='http://www.mozilla.org/xbl'><binding id='dummy'/></bindings>";
      if (this.key in filterByKey) {
        var wnd = Utils.getRequestWindow(this);
        if (wnd && wnd.document && !Policy.processNode(wnd, wnd.document, Policy.type.ELEMHIDE, Filter.knownFilters[filterByKey[this.key]]))
          data = "<bindings xmlns='http://www.mozilla.org/xbl'/>";
      }
      var stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      stream.setData(data, data.length);
      return stream;
    }
    ,
    isPending: function () {
      return false;
    }
    ,
    cancel: function () {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }
    ,
    suspend: function () {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }
    ,
    resume: function () {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    }
    ,
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIChannel, Ci.nsIRequest])
  };
  if (typeof _patchFunc0 != "undefined")
    eval("(" + _patchFunc0.toString() + ")()");
  window.ElemHide = ElemHide;
}
)(window.ElemHidePatch);
