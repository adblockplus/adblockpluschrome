#!/usr/bin/env python
# coding: utf-8

import sys, os, subprocess, re
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
          --release     Create a release build, not a development build
''' % os.path.basename(sys.argv[0])

def removeUpdateURL(fileName, fileData):
  if fileName == 'manifest.json':
    return re.sub(r'\s*"update_url"\s*:\s*"[^"]*",', '', fileData)
  else:
    return fileData

def addToZip(zip, filters, dir, baseName):
  for file in os.listdir(dir):
    filelc = file.lower()
    if (file.startswith('.') or filelc.endswith('.py') or
        filelc.endswith('.crx') or filelc.endswith('.zip') or
        filelc.endswith('.sh') or filelc.endswith('.bat')):
      # skip special files, scripts, existing archives
      continue
    filePath = os.path.join(dir, file)
    if os.path.isdir(filePath):
      addToZip(zip, filters, filePath, baseName + file + '/')
    else:
      handle = open(filePath, 'rb')
      fileData = handle.read()
      handle.close()

      for filter in filters:
        fileData = filter(baseName + file, fileData)
      zip.writestr(baseName + file, fileData)

def packDirectory(dir, filters):
  buffer = StringIO()
  zip = ZipFile(buffer, 'w', ZIP_DEFLATED)
  addToZip(zip, filters, dir, '')
  zip.close()
  return buffer.getvalue()

def signBinary(zipdata, keyFile):
  if not os.path.exists(keyFile):
    subprocess.Popen(['openssl', 'genrsa', '-out', keyFile, '1024'], stdout=subprocess.PIPE).communicate()
  signature, dummy = subprocess.Popen(['openssl', 'sha1', '-sha1', '-binary', '-sign', keyFile], stdin=subprocess.PIPE, stdout=subprocess.PIPE).communicate(zipdata)
  return signature

def getPublicKey(keyFile):
  pubkey, dummy = subprocess.Popen(['openssl', 'rsa', '-pubout', '-outform', 'DER', '-in', keyFile], stdout=subprocess.PIPE).communicate()
  return pubkey

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
    opts, args = getopt(sys.argv[1:], 'hi:k:', ['help', 'inputdir=', 'key=', 'release'])
    if len(args) != 1:
      raise GetoptError('Need exactly one output file name')
  except GetoptError, e:
    print str(e)
    usage()
    sys.exit(2)

  inputdir = os.path.dirname(os.path.abspath(sys.argv[0]))
  keyfile = None
  isRelease = False
  for option, value in opts:
    if option in ('-h', '--help'):
      usage()
      sys.exit()
    elif option in ('-i', '--inputdir'):
      inputdir = value
    elif option in ('-k', '--key'):
      keyfile = value
    elif option in ('--release'):
      isRelease = True

  filters = []
  if isRelease:
    filters.append(removeUpdateURL)

  zipdata = packDirectory(inputdir, filters)
  signature = None
  pubkey = None
  if keyfile != None:
    signature = signBinary(zipdata, keyfile)
    pubkey = getPublicKey(keyfile)
  writePackage(args[0], pubkey, signature, zipdata)
