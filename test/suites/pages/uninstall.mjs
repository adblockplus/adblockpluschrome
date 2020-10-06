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

import {runWithHandle} from "../../misc/utils.mjs";

export default () =>
{
  it("opens uninstall page when extension is uninstalled", async function()
  {
    await runWithHandle(this.driver, this.extensionHandle, () =>
      this.driver.executeScript("browser.management.uninstallSelf();")
    );

    await this.driver.wait(
      async() =>
      {
        for (let handle of await this.driver.getAllWindowHandles())
        {
          await this.driver.switchTo().window(handle);
          let url = await this.driver.getCurrentUrl();
          if (url.startsWith("https://adblockplus.org/en/uninstalled"))
            return true;
        }
        return false;
      },
      2000,
      "uninstall page did not open"
    );
  });
};
