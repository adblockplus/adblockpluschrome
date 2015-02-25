#!/usr/bin/env python
# coding: utf-8

import os, sys, subprocess

BASE_DIR = os.path.dirname(__file__)
DEPENDENCY_SCRIPT = os.path.join(BASE_DIR, "ensure_dependencies.py")

try:
  subprocess.check_call([sys.executable, DEPENDENCY_SCRIPT, BASE_DIR])
except subprocess.CalledProcessError as e:
  print >>sys.stderr, e
  print >>sys.stderr, "Failed to ensure dependencies being up-to-date!"

import buildtools.build
buildtools.build.processArgs(BASE_DIR, sys.argv)
