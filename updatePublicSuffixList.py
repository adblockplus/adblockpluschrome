# coding: utf-8
 
# The contents of this file are subject to the Mozilla Public License
# Version 1.1 (the "License"); you may not use this file except in
# compliance with the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/

"""
Update the public suffix list
==============================

  This script generates a js array of public suffixes (http://publicsuffix.org/)
"""

import urllib
import json

def urlopen(url, attempts=3):
  """
  Tries to open a particular URL, retries on failure.
  """
  for i in range(attempts):
    try:
      return urllib.urlopen(url)
    except IOError, e:
      error = e
      time.sleep(5)
  raise error

def getPublicSuffixList():
  """
  gets download link for a Gecko add-on from the Mozilla Addons site
  """
  suffixes = {};
  url = 'http://mxr.mozilla.org/mozilla-central/source/netwerk/dns/effective_tld_names.dat?raw=1'
  resource = urlopen(url)
  
  for line in resource:
  line = line.rstrip()
  if line.startswith("//") or "." not in line:
    continue
  if line.startswith('*.'):
    suffixes[line[2:]] = 2
  elif line.startswith('!'):
    suffixes[line[1:]] = 0
  else:
    suffixes[line] = 1
 
  return suffixes

def updatePSL():
  """
  writes the current public suffix list to js file in json format
  """

  psl = getPublicSuffixList()
  file = open('lib/publicSuffixList.js', 'w')
  file.write('var publicSuffixes = ' + json.dumps(psl, sort_keys=True, indent=4) + ';')
  file.close()

if __name__ == "__main__":
  updatePSL()
