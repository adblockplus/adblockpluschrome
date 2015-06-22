Adblock Plus for Chrome, Opera and Safari
=========================================

This repository contains the platform-specific Adblock Plus source code for
Chrome, Opera and Safari. It can be used to build Adblock Plus for these
platforms, generic Adblock Plus code will be extracted from other repositories
automatically (see _dependencies_ file).

Building
---------

### Requirements

- [Python 2.7](https://www.python.org)
- [The Jinja2 module](http://jinja.pocoo.org/docs)
- [The PIL module](http://www.pythonware.com/products/pil/)
- For signed Chrome and Opera builds: [M2Crypto module](https://github.com/martinpaljak/M2Crypto)
- For signed Safari builds: A [patched version of the xar command line tool](https://github.com/mackyle/xar/)

### Building the extension

Run one of the following commands in the project directory, depending on your
target platform:

    ./build.py -t chrome build -k adblockpluschrome.pem
    ./build.py -t opera build -k adblockplusopera.pem
    ./build.py -t safari build -k adblockplussafari.pem

This will create a build with a name in the form
_adblockpluschrome-1.2.3.nnnn.crx_ or _adblockplussafari-1.2.3.nnnn.safariextz_.
Note that you don't need an existing signing key for Chrome or Opera, a new key
will be created automatically if the file doesn't exist. Safari on the other
hand always requires a valid developer certificate, you need to get one in the
Apple Developer Center first. _adblockplussafari.pem_ should contain the private
key for your developer certificate, the developer certificate itself as well as
all the certificates it was signed with (Apple's root certificate and
intermediate certificates) in PEM format - in that order.

### Development environment

To simplify the process of testing your changes you can create an unpacked
development environment. For that run one of the following commands:

    ./build.py -t chrome devenv
    ./build.py -t opera devenv
    ./build.py -t safari devenv

This will create a _devenv_ directory in the repository. In Chrome and Opera you
should load it as an unpacked extension directory. After making changes to the
source code re-run the command to update the development environment, the
extension should reload automatically after a few seconds.

In Safari you should load _devenv/adblockplussafari.safariextension_ as unpacked
extension directory. After making changes to the source code re-run the command
to update the development environment. You will still need to reload the
extension explicitly in the Extension Builder, Safari currently doesn't allow
automating this action.

Running the unit tests
----------------------

To verify your changes you can use the unit test suite located in the _qunit_
directory of the repository. In order to run the unit tests go to the
extension's Options page, open the JavaScript Console and type in:

    location.href = "qunit/index.html";

The unit tests will run automatically once the page loads.
