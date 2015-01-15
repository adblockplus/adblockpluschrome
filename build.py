#!/usr/bin/env python
# coding: utf-8

import os, sys, subprocess

DEPENDENCY_SCRIPT = os.path.join(os.path.dirname(__file__), "ensure_dependencies.py")

try:
  subprocess.check_call([sys.executable, DEPENDENCY_SCRIPT])
except subprocess.CalledProcessError as e:
  print >>sys.stderr, e
  print >>sys.stderr, "Failed to ensure dependencies being up-to-date!"

import buildtools.build
buildtools.build.processArgs('.', sys.argv)
