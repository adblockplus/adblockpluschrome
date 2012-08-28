importAll("filterClasses", this);
importAll("subscriptionClasses", this);
importAll("matcher", this);
importAll("filterStorage", this);
importAll("filterNotifier", this);
importAll("elemHide", this);
importAll("prefs", this);
importAll("utils", this);

function prepareFilterComponents(keepListeners)
{
  FilterStorage.subscriptions = [];
  FilterStorage.knownSubscriptions = {__proto__: null};
  Subscription.knownSubscriptions = {__proto__: null};
  Filter.knownFilters = {__proto__: null};

  defaultMatcher.clear();
  ElemHide.clear();
}

function restoreFilterComponents()
{
}

function preparePrefs()
{
  this._pbackup = {__proto__: null};
  for (var pref in Prefs)
    if (Prefs.hasOwnProperty(pref))
      this._pbackup[pref] = Prefs[pref];
  Prefs.enabled = true;
}

function restorePrefs()
{
  for (var pref in this._pbackup)
    Prefs[pref] = this._pbackup[pref];
}

function executeFirstRunActions()
{
}
