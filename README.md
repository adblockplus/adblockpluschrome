Adblock Plus for Chrome, Opera and Firefox
==========================================

This repository contains the platform-specific Adblock Plus source code for
Chrome, Opera and Firefox. It can be used to build Adblock Plus for these
platforms, generic Adblock Plus code will be extracted from other repositories
automatically (see _dependencies_ file).

Note that the Firefox extension built from this repository is the new
[WebExtension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).
The source code of the legacy Adblock Plus extension
can be found [here](https://hg.adblockplus.org/adblockplus).

Building
---------

### Requirements

- [Mercurial](https://www.mercurial-scm.org/) or [Git](https://git-scm.com/) (whichever you used to clone this repository)
- [Python 2.7](https://www.python.org)
- [The Jinja2 module](http://jinja.pocoo.org/docs) (>= 2.8)
- [The PIL module](http://www.pythonware.com/products/pil/)
- For signed builds: [PyCrypto module](https://www.dlitz.net/software/pycrypto/)

### Building the extension

Run one of the following commands in the project directory, depending on your
target platform:

    ./build.py -t chrome build -k adblockpluschrome.pem
    ./build.py -t gecko-webext build

This will create a build with a name in the form
_adblockpluschrome-1.2.3.nnnn.crx_ or _adblockplusfirefox-1.2.3.nnnn.xpi_

Note that you don't need an existing signing key for Chrome, a new key
will be created automatically if the file doesn't exist.

The Firefox extension will be unsigned, and therefore is mostly only useful for
upload to Mozilla Add-ons. You can also also load it for testing purposes under
_about:debugging_ or by disabling signature enforcement in Firefox Nightly.

### Development environment

To simplify the process of testing your changes you can create an unpacked
development environment. For that run one of the following commands:

    ./build.py -t chrome devenv
    ./build.py -t gecko-webext devenv

This will create a _devenv.*_ directory in the repository. You can load the
directory as an unpacked extension, under _chrome://extensions_ in Chrome,
or under _about:debugging_ in Firefox. After making changes to the
source code re-run the command to update the development environment, the
extension should reload automatically after a few seconds.

Running the unit tests
----------------------

To verify your changes you can use the unit test suite located in the _qunit_
directory of the repository. In order to run the unit tests go to the
extension's Options page, open the JavaScript Console and type in:

    location.href = "qunit/index.html";

The unit tests will run automatically once the page loads.

Linting
-------

You can lint the code using [ESLint](http://eslint.org).

    eslint *.js lib/ qunit/ ext/ chrome/

You will need to set up ESLint and our configuration first, see
[eslint-config-eyeo](https://hg.adblockplus.org/codingtools/file/tip/eslint-config-eyeo)
for more information.
