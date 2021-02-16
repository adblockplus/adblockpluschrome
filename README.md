Adblock Plus for Chrome, Opera, Microsoft Edge and Firefox (DEPRECATED!)
========================================================================

IMPORTANT: Deprecation notice
-----------------------------

This codebase is deprecated. As of Adblock Plus 3.11, Adblock Plus for Chrome,
Firefox, Microsoft Edge and Opera is based on the
[adblockplusui repository](https://gitlab.com/eyeo/adblockplus/abpui/adblockplusui/).

Development of the core ad blocking integration for web extensions has moved to
the [webext-sdk repository](https://gitlab.com/eyeo/adblockplus/webext-sdk).

---

This repository contains the platform-specific Adblock Plus source code for
Chrome, Opera, Microsoft Edge and Firefox. It can be used to build
Adblock Plus for these platforms.

Building
---------

### Requirements

- [Node.js](https://nodejs.org/) (>= 12.17.0)

### Building on Windows

On Windows, you need a [Linux environment running on WSL](https://docs.microsoft.com/windows/wsl/install-win10).
Then install the above requirements and run the commands below from within Bash.

### Updating the dependencies

Clone the external repositories:

    git submodule update --init --recursive

_Note: when building from a source archive, this step must be skipped._

Install the required npm packages:

    npm install

Rerun the above commands when the dependencies might have changed,
e.g. after checking out a new revison.

### Building the extension

Run the following command in the project directory:

    npx gulp build -t {chrome|firefox} [-c development]

This will create a build with a name in the form
_adblockpluschrome-n.n.n.zip_ or _adblockplusfirefox-n.n.n.xpi_. These builds
are unsigned. They can be submitted as-is to the extension stores, or if
unpacked loaded in development mode for testing (same as devenv builds below).

### Development environment

To simplify the process of testing your changes you can create an unpacked
development environment. For that run one of the following command:

    npx gulp devenv -t {chrome|firefox}

This will create a _devenv.*_ directory in the project directory. You can load
the directory as an unpacked extension under _chrome://extensions_ in
Chromium-based browsers, and under _about:debugging_ in Firefox. After making
changes to the source code re-run the command to update the development
environment, and the extension should reload automatically after a few seconds.

### Customization

If you wish to create an extension based on our code and use the same
build tools, we offer some customization options.

This can be done by:

 - Specifying a path to a new configuration file relative to `gulpfile.mjs`
(it should match the structure found in `build/config/`).

        npx gulp {build|devenv} -t {chrome|firefox} --config config.mjs

 - Specifying a path to a new `manifest.json` file relative to `gulpfile.mjs`.
You should check `build/manifest.json` and `build/tasks/manifest.mjs` to see
how we modify it.

        npx gulp {build|devenv} -t {chrome|firefox} -m manifest.json

Running tests
-------------

### Unit tests

To verify your changes you can use the unit test suite located in the _qunit_
directory of the repository. In order to run the unit tests go to the
extension's Options page, open the JavaScript Console and type in:

    location.href = "qunit/index.html";

The unit tests will run automatically once the page loads.

### External test runner

There is also an external test runner that can be invoked from the
command line in order to run the unit tests along some integration
tests on different browsers, and automatically run the linter as well.

On Windows, in order to use the test runner, in addition to setting up a Linux
environment as outlined above, you need to have Node.js installed in your native
Windows environment. Then run the commands below from within PowerShell or
cmd.exe (unlike when building the extension which needs to be done from Bash).

On Linux, newer versions of Chromium require `libgbm`.

Make sure the required packages are installed and up-to-date:

    npm install

Start the testing process for all browsers:

    npm test

Start the testing process in one browser only:

    npm test -- -g <Firefox|Chromium|Edge>

In order to run other test subsets, please check `-g` option on
[Mocha's documentation](https://mochajs.org/#-grep-regexp-g-regexp).

By default it downloads (and caches) and runs the tests against the
oldest compatible version and the latest release version of each browser.
In order to run the tests against a different version set the `CHROMIUM_BINARY`,
`FIREFOX_BINARY` or `EDGE_BINARY` environment variables. Following values are
accepted:

* `installed`
  * Uses the version installed on the system.
* `path:<path>`
  * Uses the binary located at the given path.
* `download:<version>`
  * Downloads the given version (for Firefox the version must be in the
    form `<major>.<minor>`, for Chromium this must be the revision number).
    This option is not available for Edge.

Filter tests subset uses [ABP Test pages](https://testpages.adblockplus.org/).
In order to run those tests on a different version of the test pages, set
the _TEST_PAGES_URL_ environment variable. Additionally, in order to accept
insecure `https` certificates set the _TEST_PAGES_INSECURE_ environment variable
to `"true"`.

[Edge Chromium](https://www.microsoft.com/en-us/edge/business/download) needs to
be installed before running the Edge tests.

Linting
-------

You can lint the code using [ESLint](http://eslint.org).

You will need to setup first. This will install our configuration
[eslint-config-eyeo](https://gitlab.com/eyeo/auxiliary/eyeo-coding-style/-/tree/master/eslint-config-eyeo)
and everything needed after you run:

    npm install

Then you can run to lint the code:

    npm run lint
