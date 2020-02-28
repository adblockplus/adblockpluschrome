#!/usr/bin/env python
# coding: utf-8

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEPENDENCY_SCRIPT = os.path.join(BASE_DIR, "ensure_dependencies.py")
UI_DIR = os.path.join(BASE_DIR, 'adblockplusui')
LAST_UI_BUILD_FILENAME = os.path.join(BASE_DIR, '.last_ui_build')


def must_build_ui():
    try:
        last_ui_build = os.stat(LAST_UI_BUILD_FILENAME).st_mtime
    except OSError:
        return True

    for root, _, files in os.walk(UI_DIR):
        for path in [root] + [os.path.join(root, f) for f in files]:
            if os.stat(path).st_mtime > last_ui_build:
                return True

    return False


try:
    subprocess.check_call([sys.executable, DEPENDENCY_SCRIPT, BASE_DIR])

    if must_build_ui():
        subprocess.check_call(['npm', 'run', 'dist'], cwd=UI_DIR)
        open(LAST_UI_BUILD_FILENAME, 'w').close()
except subprocess.CalledProcessError as e:
    print >>sys.stderr, e
    print >>sys.stderr, "Failed to ensure dependencies being up-to-date!"

import buildtools.build
buildtools.build.process_args(BASE_DIR)
