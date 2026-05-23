/* extension.js
 * Copyright (C) 2025 ochi12
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';


export default class PlainExampleExtension extends Extension {
    enable() {
        // Get the absolute path to your sdf.js file inside the extension folder
        const scriptPath = this.dir.get_child('sdi_desktop_app').get_child('main.js').get_path();

        Main.overview.connectObject('windows-restacked', () => {
            global.get_window_actors().forEach(actor => {
                const mw = actor.meta_window;
                if (mw && mw.get_gtk_application_id() === 'com.github.ochi12.sdi') {
                    mw.set_type(Meta.WindowType.DESKTOP);
                    Main.overview.disconnectObject(this);
                }
            });
        }, this);


        this._launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.NONE
        });

        this._proc = this._launcher.spawnv([scriptPath]);

    }

    disable() {
        if (this._proc) {
            this._proc.force_exit();
            this._proc = null;
        }
    }
}
