#!/usr/bin/env python
# coding: utf-8

import sys, os, subprocess
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
''' % os.path.basename(sys.argv[0])

def addToZip(zip, dir, baseName):
  for file in os.listdir(dir):
    filelc = file.lower()
    if file.startswith('.') or filelc.endswith('.py') or filelc.endswith('.crx') or filelc.endswith('.zip'):
      # skip special files, Python scripts, existing archives
      continue
    filePath = os.path.join(dir, file)
    if os.path.isdir(filePath):
      addToZip(zip, filePath, baseName + file + '/')
    else:
      zip.write(filePath, baseName + file)

def packDirectory(dir):
  buffer = StringIO()
  zip = ZipFile(buffer, 'w', ZIP_DEFLATED)
  addToZip(zip, dir, '')
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
    opts, args = getopt(sys.argv[1:], 'hi:k:', ['help', 'inputdir=', 'key='])
  except GetoptError, e:
    print str(e)
    usage()
    sys.exit(2)

  if len(args) != 1 or '-h' in opts or '--help' in opts:
    usage()
    sys.exit()

  inputdir = os.path.dirname(os.path.abspath(sys.argv[0]))
  keyfile = None
  for option, value in opts:
    if option in ('-i', '--inputdir'):
      inputdir = value
    elif option in ('-k', '--key'):
      keyfile = value

  zipdata = packDirectory(inputdir)
  signature = None
  pubkey = None
  if keyfile != None:
    signature = signBinary(zipdata, keyfile)
    pubkey = getPublicKey(keyfile)
  writePackage(args[0], pubkey, signature, zipdata)
