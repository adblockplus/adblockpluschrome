"use strict";

const {require, Services} = ext.backgroundPage.getWindow();

const {Synchronizer} = require("synchronizer");
const {Utils} = require("utils");
const {Prefs} = require("prefs");
const {FilterStorage} = require("filterStorage");
const {FilterNotifier} = require("filterNotifier");

const {Subscription, DownloadableSubscription} = require("subscriptionClasses");
const {Filter, BlockingFilter} = require("filterClasses");
const {defaultMatcher} = require("matcher");

/**
 * Shortcut for document.getElementById(id)
 */
function E(id)
{
  return document.getElementById(id);
}
