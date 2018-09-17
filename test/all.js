/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

const glob = require("glob");
const path = require("path");
const {exec} = require("child_process");

for (let browser of glob.sync("./test/browsers/*.js"))
{
  let module = require(path.resolve(browser));

  describe(module.platform, function()
  {
    this.timeout(0);

    before(function()
    {
      return Promise.all([
        module.ensureBrowser(),
        new Promise((resolve, reject) =>
        {
          exec(`python build.py devenv -t ${module.platform}`,
            (error, stdout, stderr) =>
            {
              if (error)
              {
                console.error(stderr);
                reject(error);
              }
              else resolve(stdout);
            });
        })
      ]).then(([browserBinary]) =>
      {
        this.driver = module.getDriver(
          browserBinary,
          path.resolve(`./devenv.${module.platform}`)
        );
        return this.driver.wait(() =>
          this.driver.getAllWindowHandles().then(handles => handles[1])
        );
      }).then(handle =>
        this.driver.switchTo().window(handle)
      ).then(() =>
        this.driver.executeScript("return location.origin;")
      ).then(origin =>
      {
        this.origin = origin;
      });
    });

    for (let file of glob.sync("./test/wrappers/*.js"))
    {
      // Reload the module(s) for every browser
      let modulePath = path.resolve(file);
      delete require.cache[require.resolve(modulePath)];
      require(modulePath);
    }

    after(function()
    {
      this.driver.quit();
    });
  });
}
