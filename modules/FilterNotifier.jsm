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

(function (_patchFunc1) {
  var listeners = [];
  var FilterNotifier = {
    addListener: function (listener) {
      if (listeners.indexOf(listener) >= 0)
        return ;
      listeners.push(listener);
    }
    ,
    removeListener: function (listener) {
      var index = listeners.indexOf(listener);
      if (index >= 0)
        listeners.splice(index, 1);
    }
    ,
    triggerListeners: function (action, item, param1, param2, param3) {
      for (var _loopIndex0 = 0;
      _loopIndex0 < listeners.length; ++ _loopIndex0) {
        var listener = listeners[_loopIndex0];
        listener(action, item, param1, param2, param3);
      }
    }
    
  };
  if (typeof _patchFunc1 != "undefined")
    eval("(" + _patchFunc1.toString() + ")()");
  window.FilterNotifier = FilterNotifier;
}
)(window.FilterNotifierPatch);
