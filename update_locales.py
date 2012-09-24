#!/usr/bin/env python
# coding: utf-8

# This Source Code is subject to the terms of the Mozilla Public License
# version 2.0 (the "License"). You can obtain a copy of the License at
# http://mozilla.org/MPL/2.0/.

import sys, os, json, re, codecs
import buildtools.localeTools as localeTools

def updateLocales(sourceDir, targetDir, localeMap, removed, imported):
  for source, target in localeMap.iteritems():
    targetFile = os.path.join(targetDir, target, 'messages.json')
    hasSource = os.path.exists(os.path.join(sourceDir, source))
    if hasSource and os.path.exists(os.path.join(sourceDir, source, '.incomplete')):
      hasSource = False
    if not hasSource and not os.path.exists(targetFile):
      continue

    data = {}
    if os.path.exists(targetFile):
      file = codecs.open(targetFile, 'rb', encoding='utf-8')
      data = json.load(file)
      file.close()

    for entry in removed:
      if entry in data:
        del data[entry]

    if hasSource:
      for entry in imported:
        fileName, stringID = entry.split(' ', 1)
        sourceFile = os.path.join(sourceDir, source, fileName)
        try:
          sourceData = localeTools.readFile(sourceFile)
          if stringID in sourceData:
            key = re.sub(r'\..*', '', fileName) + '_' + re.sub(r'\W', '_', stringID)
            data[key] = {'message': sourceData[stringID]}
        except:
          pass

      sourceFile = os.path.join(sourceDir, source, 'meta.properties')
      try:
        sourceData = localeTools.readFile(sourceFile)
        if 'name' in sourceData:
          data['name'] = {'message': sourceData['name'] + ' (Beta)'}
      except:
        pass

    try:
      os.makedirs(os.path.dirname(targetFile))
    except:
      pass
    file = codecs.open(targetFile, 'wb', encoding='utf-8')
    json.dump(data, file, ensure_ascii=False, sort_keys=True, indent=2)
    print >>file
    file.close()

if __name__ == '__main__':
  sourceDir = os.path.join('..', 'adblockplus', 'chrome', 'locale')
  targetDir = os.path.join('_locales')
  localeMap = {
    'ar': 'ar',
    'bg': 'bg',
    'ca': 'ca',
    'cs': 'cs',
    'da': 'da',
    'de': 'de',
    'el': 'el',
    'en-US': 'en',
    'en-GB': 'en_GB',
    'es-ES': 'es',
    'es-AR': 'es_419',
    'et': 'et',
    'fi': 'fi',
#   '': 'fil', ???
    'fr': 'fr',
    'he': 'he',
    'hi-IN': 'hi',
    'hr': 'hr',
    'hu': 'hu',
    'id': 'id',
    'it': 'it',
    'ja': 'ja',
    'ko': 'ko',
    'lt': 'lt',
    'lv': 'lv',
    'nl': 'nl',
#    'nb-NO': 'no', ???
    'pl': 'pl',
    'pt-BR': 'pt_BR',
    'pt-PT': 'pt_PT',
    'ro': 'ro',
    'ru': 'ru',
    'sk': 'sk',
    'sl': 'sl',
    'sr': 'sr',
    'sv-SE': 'sv',
    'th': 'th',
    'tr': 'tr',
    'uk': 'uk',
    'vi': 'vi',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
  }
  removed = [
    'not_a_filter_list',
    'not_found_on_server',
    'filter_list_desc',
    'add_url_button',
    'delete',
    'add_a_filter_list',
    'hovercraft',
    'global_subscription_status_lastdownload_inprogress',
    'global_synchronize_invalid_url',
    'global_synchronize_connection_error',
    'global_synchronize_invalid_data',
    'global_synchronize_checksum_mismatch',
    'settings_enabled_column',
    'settings_remove_label',
    'settings_addsubscription_label',
    'subscriptionSelection_addSubscription_label',
    'subscriptionSelection_other_label',
    'hide_placeholders',
    'block_youtube',
  ]
  imported = [
    'global.properties subscription_invalid_location',
    'global.properties remove_subscription_warning',
    'overlay.dtd hideplaceholders.label',
    'filters.dtd subscription.lastDownload.inProgress',
    'filters.dtd subscription.lastDownload.invalidURL',
    'filters.dtd subscription.lastDownload.connectionError',
    'filters.dtd subscription.lastDownload.invalidData',
    'filters.dtd subscription.lastDownload.checksumMismatch',
    'filters.dtd subscription.enabled.label',
    'filters.dtd subscription.delete.label',
    'filters.dtd addSubscription.label',
    'filters.dtd addSubscriptionAdd.label',
    'filters.dtd addSubscriptionOther.label',
    'filters.dtd acceptableAds2.label',
    'filters.dtd viewList.label',
    'filters.dtd readMore.label',
    'subscriptionSelection.dtd subscriptionSelector.label',
    'subscriptionSelection.dtd title.label',
    'subscriptionSelection.dtd location.label',
  ]
  updateLocales(sourceDir, targetDir, localeMap, removed, imported)
