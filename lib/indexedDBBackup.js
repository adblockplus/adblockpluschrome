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

"use strict";

const {FilterNotifier} = require("../adblockpluscore/lib/filterNotifier");
const {FilterStorage} = require("../adblockpluscore/lib/filterStorage");
const {DownloadableSubscription, SpecialSubscription} =
  require("../adblockpluscore/lib/subscriptionClasses");

const BACKUP_NAME = "file:indexedDB-backup";

let backupDelay;
let pendingBackup = false;

function setBackupInterval(backupInterval = 60 * 1000)
{
  backupDelay = backupInterval;
}

setBackupInterval();

function scheduleBackup()
{
  if (!pendingBackup)
  {
    pendingBackup = true;

    setTimeout(
      () =>
      {
        saveToStorage();
        pendingBackup = false;
      },
      backupDelay
    );
  }
}

function saveToStorage()
{
  browser.storage.local.set({
    [BACKUP_NAME]: {
      content: serialize(),
      lastModified: Date.now()
    }
  });
}

function serialize()
{
  let buffer = [];

  for (let subscription of FilterStorage.subscriptions)
  {
    if (subscription instanceof SpecialSubscription)
    {
      subscription.serialize(buffer);
      buffer.push("[Subscription filters]");
      subscription.serializeFilters(buffer);
    }
    else if (subscription instanceof DownloadableSubscription)
    {
      let {homepage, title, url, disabled} = subscription;

      buffer.push(
        "[Subscription]",
        `homepage=${homepage}`,
        `title=${title}`,
        `url=${url}`,
        `disabled=${disabled}`
      );
    }
  }
  return buffer;
}

function getBackupData()
{
  return browser.storage.local.get(BACKUP_NAME).then(items =>
  {
    let entry = items[BACKUP_NAME];
    if (entry)
      return entry;

    throw {type: "NoSuchFile"};
  });
}

FilterNotifier.on("load", scheduleBackup);
FilterNotifier.on("subscription.updated", scheduleBackup);
FilterNotifier.on("subscription.added", scheduleBackup);
FilterNotifier.on("subscription.removed", scheduleBackup);
FilterNotifier.on("subscription.disabled", scheduleBackup);
FilterNotifier.on("filter.added", scheduleBackup);
FilterNotifier.on("filter.removed", scheduleBackup);
FilterNotifier.on("filter.moved", scheduleBackup);
FilterNotifier.on("filter.disabled", scheduleBackup);

exports.IndexedDBBackup =
{
  getBackupData,
  // Non-public API, just for tests.
  setBackupInterval
};
