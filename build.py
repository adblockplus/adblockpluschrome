#!/usr/bin/env python
# coding: utf-8

import sys, os, subprocess, re, json
from getopt import getopt, GetoptError
from StringIO import StringIO
from zipfile import ZipFile, ZIP_DEFLATED
from struct import pack

def usage():
  print '''Usage: %s outputfile

Options:
  -h      --help        Print this message and exit
  -i dir  --input=dir   Directory to be packaged
  -k file --key=file    File containing the private key
  -b num  --build=num   Use given build number (if omitted the build
                        number will be retrieved from Mercurial)
          --release     Create a release build, not a development build
''' % os.path.basename(sys.argv[0])

def removeUpdateURL(zip, dir, fileName, fileData):
  if fileName == 'manifest.json':
    data = json.loads(fileData)
    del data['update_url']
    return json.dumps(data)
  return fileData

def addBuildNumber(revision, zip, dir, fileName, fileData):
  if fileName == 'manifest.json':
    if not revision:
      revision, dummy = subprocess.Popen(['hg', '-R', dir, 'id', '-n'], stdin=subprocess.PIPE, stdout=subprocess.PIPE).communicate()
      revision = re.sub(r'\D', '', revision)
    if len(revision) > 0:
      data = json.loads(fileData)
      while data['version'].count('.') < 2:
        data['version'] += '.0'
      data['version'] += '.' + revision
      return json.dumps(data)
  return fileData

def mergeContentScripts(zip, dir, fileName, fileData):
  if fileName == 'manifest.json':
    data = json.loads(fileData)
    if 'content_scripts' in data:
      scriptIndex = 1
      for contentScript in data['content_scripts']:
        if 'js' in contentScript:
          scriptData = ''
          for scriptFile in contentScript['js']:
            parts = [dir] + scriptFile.split('/')
            scriptPath = os.path.join(*parts)
            handle = open(scriptPath, 'rb')
            scriptData += handle.read()
            handle.close()
          contentScript['js'] = ['contentScript' + str(scriptIndex) + '.js']
          zip.writestr('contentScript' + str(scriptIndex) + '.js', scriptData)
          scriptIndex += 1
    return json.dumps(data)
  return fileData

def addToZip(zip, filters, dir, baseName):
  for file in os.listdir(dir):
    filelc = file.lower()
    if (file.startswith('.') or
        file == 'buildtools' or
        filelc.endswith('.py') or filelc.endswith('.pyc') or
        filelc.endswith('.crx') or filelc.endswith('.zip') or
        filelc.endswith('.sh') or filelc.endswith('.bat')):
      # skip special files, scripts, existing archives
      continue
    if file.startswith('include.'):
      # skip includes, they will be added by other means
      continue

    filePath = os.path.join(dir, file)
    if os.path.isdir(filePath):
      addToZip(zip, filters, filePath, baseName + file + '/')
    else:
      handle = open(filePath, 'rb')
      fileData = handle.read()
      handle.close()

      for filter in filters:
        fileData = filter(zip, dir, baseName + file, fileData)
      zip.writestr(baseName + file, fileData)

def packDirectory(dir, filters):
  buffer = StringIO()
  zip = ZipFile(buffer, 'w', ZIP_DEFLATED)
  addToZip(zip, filters, dir, '')
  zip.close()
  return buffer.getvalue()

def signBinary(zipdata, keyFile):
  import M2Crypto
  if not os.path.exists(keyFile):
    M2Crypto.RSA.gen_key(1024, 65537, callback=lambda x: None).save_key(keyFile, cipher=None)
  key = M2Crypto.EVP.load_key(keyFile)
  key.sign_init()
  key.sign_update(zipdata)
  return key.final()

def getPublicKey(keyFile):
  import M2Crypto
  return M2Crypto.EVP.load_key(keyFile).as_der()

def writePackage(outputFile, pubkey, signature, zipdata):
  file = open(outputFile, 'wb')
  if pubkey != None and signature != None:
    file.write(pack('<4sIII', 'Cr24', 2, len(pubkey), len(signature)))
    file.write(pubkey)
    file.write(signature)
  file.write(zipdata)
  file.close()

if __name__ == '__main__':
  try:
    opts, args = getopt(sys.argv[1:], 'hi:b:k:', ['help', 'inputdir=', 'build=', 'key=', 'release'])
    if len(args) != 1:
      raise GetoptError('Need exactly one output file name')
  except GetoptError, e:
    print str(e)
    usage()
    sys.exit(2)

  inputdir = os.path.dirname(os.path.abspath(sys.argv[0]))
  buildNum = None
  keyfile = None
  isRelease = False
  for option, value in opts:
    if option in ('-h', '--help'):
      usage()
      sys.exit()
    elif option in ('-i', '--inputdir'):
      inputdir = value
    elif option in ('-b', '--build'):
      buildNum = value
    elif option in ('-k', '--key'):
      keyfile = value
    elif option in ('--release'):
      isRelease = True

  filters = []
  if isRelease:
    filters.append(removeUpdateURL)
  else:
    filters.append(lambda zip, dir, fileName, fileData: addBuildNumber(buildNum, zip, dir, fileName, fileData))
  filters.append(mergeContentScripts)

  zipdata = packDirectory(inputdir, filters)
  signature = None
  pubkey = None
  if keyfile != None:
    signature = signBinary(zipdata, keyfile)
    pubkey = getPublicKey(keyfile)
  writePackage(args[0], pubkey, signature, zipdata)
