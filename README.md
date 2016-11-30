Adblock Plus for Chrome and Opera
=================================

This repository contains the platform-specific Adblock Plus source code for
Chrome and Opera. It can be used to build Adblock Plus for these platforms,
generic Adblock Plus code will be extracted from other repositories
automatically (see _dependencies_ file).

Building
---------

### Requirements

- [Mercurial](https://www.mercurial-scm.org/) or [Git](https://git-scm.com/) (whichever you used to clone this repository)
- [Python 2.7](https://www.python.org)
- [The Jinja2 module](http://jinja.pocoo.org/docs) (>= 2.8)
- [The PIL module](http://www.pythonware.com/products/pil/)
- For signed builds: [PyCrypto module](https://www.dlitz.net/software/pycrypto/)

### Building the extension

Run the following command in the project directory:

    ./build.py -t chrome build -k adblockpluschrome.pem

This will create a build with a name in the form
_adblockpluschrome-1.2.3.nnnn.crx_
Note that you don't need an existing signing key for Chrome, a new key
will be created automatically if the file doesn't exist.

### Development environment

To simplify the process of testing your changes you can create an unpacked
development environment. For that run the following command:

    ./build.py -t chrome devenv

This will create a _devenv.chrome_ directory in the repository. In Chrome you
should load the directory as an unpacked extension. After making changes to the
source code re-run the command to update the development environment, the
extension should reload automatically after a few seconds.

Running the unit tests
----------------------

To verify your changes you can use the unit test suite located in the _qunit_
directory of the repository. In order to run the unit tests go to the
extension's Options page, open the JavaScript Console and type in:

    location.href = "qunit/index.html";

The unit tests will run automatically once the page loads.
