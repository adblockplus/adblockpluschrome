/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

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
