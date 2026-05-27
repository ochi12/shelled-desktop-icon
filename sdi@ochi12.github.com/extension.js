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

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import GLib from "gi://GLib";

class SignalSource {
  constructor(emitter, signalName, callback) {
    this._emitter = emitter;
    this._id = this._emitter.connect(signalName, callback);
  }

  disconnect() {
    if (this._emitter && this._id !== null) {
      try {
        this._emitter.disconnect(this._id);
      } catch (_error) {}
    }

    this._emitter = null;
    this._id = null;
  }
}

const APP_ID = "com.github.ochi12.sdi";

export default class PlainExampleExtension extends Extension {
  enable() {
    // Get the absolute path to your sdf.js file inside the extension folder
    const scriptPath = this.dir
      .get_child("sdi_desktop_app")
      .get_child("main.js")
      .get_path();

    this._signals = [];

    this._signals.push(
      new SignalSource(
        global.display,
        "window-created",
        this._onWindowCreated.bind(this),
      ),
    );

    this._signals.push(
      new SignalSource(global.display, "workareas-changed", () => {
        this._updateAppGeometry();
      }),
    );

    this._proc = null;

    const launch = () => {
      this._proc = Gio.Subprocess.new(
        ["gjs", "-m", scriptPath],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      );
    };

    this._signals.push(
      new SignalSource(Main.layoutManager, "monitors-changed", () => {
        this._updateAppGeometry();
      }),
    );

    this._signals.push(
      new SignalSource(Main.layoutManager, "startup-complete", () => {
        launch();
      }),
    );

    if (Main.layoutManager._startingUp === false) launch();
  }

  _onWindowCreated(_display, metaWindow) {
    const check = () => {
      if (metaWindow.get_gtk_application_id() !== APP_ID) return;

      this._attachWindow(metaWindow);
    };
    metaWindow.connect("notify::get_gtk_application_id", check);
    metaWindow.connect("shown", check);

    check();
  }

  _attachWindow(metaWindow) {
    metaWindow.set_type(Meta.WindowType.DESKTOP);
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
      this._updateAppGeometry(metaWindow);
      return GLib.SOURCE_REMOVE;
    });
  }

  _getMetaWindow() {
    const windows = global
      .get_window_actors()
      .map((actor) => actor.meta_window)
      .filter((win) => win.get_gtk_application_id() === APP_ID);
    return windows[0];
  }

  _updateAppGeometry() {
    const metaWindow = this._getMetaWindow();
    if (metaWindow === undefined) return;

    const monitor = metaWindow.get_monitor();

    const workspace = metaWindow.get_workspace();
    const workArea = workspace.get_work_area_for_monitor(monitor);

    metaWindow.move_resize_frame(
      true,
      workArea.x,
      workArea.y,
      workArea.width,
      workArea.height,
    );
  }

  disable() {
    if (this._proc !== null) {
      this._proc.force_exit();
      this._proc = null;
    }

    this._signals?.forEach((s) => s.disconnect());
    this._signals = null;
  }
}
