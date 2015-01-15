#!/usr/bin/env python
# coding: utf-8

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import sys
import os
import posixpath
import re
import io
import errno
import logging
import subprocess
import urlparse
import argparse

from collections import OrderedDict
from ConfigParser import RawConfigParser

USAGE = """
A dependencies file should look like this:

  # VCS-specific root URLs for the repositories
  _root = hg:https://hg.adblockplus.org/ git:https://github.com/adblockplus/
  # File to update this script from (optional)
  _self = buildtools/ensure_dependencies.py
  # Check out elemhidehelper repository into extensions/elemhidehelper directory
  # at tag "1.2".
  extensions/elemhidehelper = elemhidehelper 1.2
  # Check out buildtools repository into buildtools directory at VCS-specific
  # revision IDs.
  buildtools = buildtools hg:016d16f7137b git:f3f8692f82e5
"""

class Mercurial():
  def istype(self, repodir):
    return os.path.exists(os.path.join(repodir, ".hg"))

  def clone(self, source, target):
    if not source.endswith("/"):
      source += "/"
    subprocess.check_call(["hg", "clone", "--quiet", "--noupdate", source, target])

  def get_revision_id(self, repo, rev=None):
    command = ["hg", "id", "--repository", repo, "--id"]
    if rev:
      command.extend(["--rev", rev])

    # Ignore stderr output and return code here: if revision lookup failed we
    # should simply return an empty string.
    result = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE).communicate()[0]
    return result.strip()

  def pull(self, repo):
    subprocess.check_call(["hg", "pull", "--repository", repo, "--quiet"])

  def update(self, repo, rev):
    subprocess.check_call(["hg", "update", "--repository", repo, "--quiet", "--check", "--rev", rev])

  def ignore(self, target, repo):

    if not self.istype(target):

      config_path = os.path.join(repo, ".hg", "hgrc")
      ignore_path = os.path.abspath(os.path.join(repo, ".hg", "dependencies"))

      config = RawConfigParser()
      config.read(config_path)

      if not config.has_section("ui"):
        config.add_section("ui")

      config.set("ui", "ignore.dependencies", ignore_path)
      with open(config_path, "w") as stream:
        config.write(stream)

      module = os.path.relpath(target, repo)
      _ensure_line_exists(ignore_path, module)

class Git():
  def istype(self, repodir):
    return os.path.exists(os.path.join(repodir, ".git"))

  def clone(self, source, target):
    source = source.rstrip("/")
    if not source.endswith(".git"):
      source += ".git"
    subprocess.check_call(["git", "clone", "--quiet", source, target])

  def get_revision_id(self, repo, rev="HEAD"):
    command = ["git", "rev-parse", "--revs-only", rev + '^{commit}']
    return subprocess.check_output(command, cwd=repo).strip()

  def pull(self, repo):
    subprocess.check_call(["git", "fetch", "--quiet", "--all", "--tags"], cwd=repo)

  def update(self, repo, rev):
    subprocess.check_call(["git", "checkout", "--quiet", rev], cwd=repo)

  def ignore(self, target, repo):
    module = os.path.relpath(target, repo)
    exclude_file = os.path.join(repo, ".git", "info", "exclude")
    _ensure_line_exists(exclude_file, module)

repo_types = OrderedDict((
  ("hg", Mercurial()),
  ("git", Git()),
))

def parse_spec(path, line):
  if "=" not in line:
    logging.warning("Invalid line in file %s: %s" % (path, line))
    return None, None

  key, value = line.split("=", 1)
  key = key.strip()
  items = value.split()
  if not len(items):
    logging.warning("No value specified for key %s in file %s" % (key, path))
    return key, None

  result = OrderedDict()
  if not key.startswith("_"):
    result["_source"] = items.pop(0)

  for item in items:
    if ":" in item:
      type, value = item.split(":", 1)
    else:
      type, value = ("*", item)
    if type in result:
      logging.warning("Ignoring duplicate value for type %s (key %s in file %s)" % (type, key, path))
    else:
      result[type] = value
  return key, result

def read_deps(repodir):
  result = {}
  deps_path = os.path.join(repodir, "dependencies")
  try:
    with io.open(deps_path, "rt", encoding="utf-8") as handle:
      for line in handle:
        # Remove comments and whitespace
        line = re.sub(r"#.*", "", line).strip()
        if not line:
          continue

        key, spec = parse_spec(deps_path, line)
        if spec:
          result[key] = spec
    return result
  except IOError, e:
    if e.errno != errno.ENOENT:
      raise
    return None

def safe_join(path, subpath):
  # This has been inspired by Flask's safe_join() function
  forbidden = set([os.sep, os.altsep]) - set([posixpath.sep, None])
  if any(sep in subpath for sep in forbidden):
    raise Exception("Illegal directory separator in dependency path %s" % subpath)

  normpath = posixpath.normpath(subpath)
  if posixpath.isabs(normpath):
    raise Exception("Dependency path %s cannot be absolute" % subpath)
  if normpath == posixpath.pardir or normpath.startswith(posixpath.pardir + posixpath.sep):
    raise Exception("Dependency path %s has to be inside the repository" % subpath)
  return os.path.join(path, *normpath.split(posixpath.sep))

def get_repo_type(repo):
  for name, repotype in repo_types.iteritems():
    if repotype.istype(repo):
      return name
  return None

def ensure_repo(parentrepo, target, roots, sourcename):
  if os.path.exists(target):
    return

  parenttype = get_repo_type(parentrepo)
  type = None
  for key in roots:
    if key == parenttype or (key in repo_types and type is None):
      type = key
  if type is None:
    raise Exception("No valid source found to create %s" % target)

  if os.path.exists(roots[type]):
    url = os.path.join(roots[type], sourcename)
  else:
    url = urlparse.urljoin(roots[type], sourcename)

  logging.info("Cloning repository %s into %s" % (url, target))
  repo_types[type].clone(url, target)

  for repo in repo_types.itervalues():
    if repo.istype(parentrepo):
      repo.ignore(target, parentrepo)

def update_repo(target, revisions):
  type = get_repo_type(target)
  if type is None:
    logging.warning("Type of repository %s unknown, skipping update" % target)
    return

  if type in revisions:
    revision = revisions[type]
  elif "*" in revisions:
    revision = revisions["*"]
  else:
    logging.warning("No revision specified for repository %s (type %s), skipping update" % (target, type))
    return

  resolved_revision = repo_types[type].get_revision_id(target, revision)
  if not resolved_revision:
    logging.info("Revision %s is unknown, downloading remote changes" % revision)
    repo_types[type].pull(target)
    resolved_revision = repo_types[type].get_revision_id(target, revision)
    if not resolved_revision:
      raise Exception("Failed to resolve revision %s" % revision)

  current_revision = repo_types[type].get_revision_id(target)
  if resolved_revision != current_revision:
    logging.info("Updating repository %s to revision %s" % (target, resolved_revision))
    repo_types[type].update(target, resolved_revision)

def resolve_deps(repodir, level=0, self_update=True, overrideroots=None, skipdependencies=set()):
  config = read_deps(repodir)
  if config is None:
    if level == 0:
      logging.warning("No dependencies file in directory %s, nothing to do...\n%s" % (repodir, USAGE))
    return
  if level >= 10:
    logging.warning("Too much subrepository nesting, ignoring %s" % repo)

  if overrideroots is not None:
    config["_root"] = overrideroots

  for dir, revisions in config.iteritems():
    if dir.startswith("_") or revisions["_source"] in skipdependencies:
      continue
    target = safe_join(repodir, dir)
    ensure_repo(repodir, target, config.get("_root", {}), revisions["_source"])
    update_repo(target, revisions)
    resolve_deps(target, level + 1, self_update=False, overrideroots=overrideroots, skipdependencies=skipdependencies)

  if self_update and "_self" in config and "*" in config["_self"]:
    source = safe_join(repodir, config["_self"]["*"])
    try:
      with io.open(source, "rb") as handle:
        sourcedata = handle.read()
    except IOError, e:
      if e.errno != errno.ENOENT:
        raise
      logging.warning("File %s doesn't exist, skipping self-update" % source)
      return

    target = __file__
    with io.open(target, "rb") as handle:
      targetdata = handle.read()

    if sourcedata != targetdata:
      logging.info("Updating %s from %s, don't forget to commit" % (source, target))
      with io.open(target, "wb") as handle:
        handle.write(sourcedata)
      if __name__ == "__main__":
        logging.info("Restarting %s" % target)
        os.execv(sys.executable, [sys.executable, target] + sys.argv[1:])
      else:
        logging.warning("Cannot restart %s automatically, please rerun" % target)

def _ensure_line_exists(path, pattern):
  with open(path, 'a+') as f:
    file_content = [l.strip() for l in f.readlines()]
    if not pattern in file_content:
      file_content.append(pattern)
      f.seek(0, os.SEEK_SET)
      f.truncate()
      for l in file_content:
        print >>f, l

if __name__ == "__main__":
  logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.INFO)

  parser = argparse.ArgumentParser(description="Verify dependencies for a set of repositories, by default the repository of this script.")
  parser.add_argument("repos", metavar="repository", type=str, nargs="*", help="Repository path")
  parser.add_argument("-q", "--quiet", action="store_true", help="Suppress informational output")
  args = parser.parse_args()

  if args.quiet:
    logging.disable(logging.INFO)

  repos = args.repos
  if not len(repos):
    repos = [os.path.dirname(__file__)]
  for repo in repos:
    resolve_deps(repo)
