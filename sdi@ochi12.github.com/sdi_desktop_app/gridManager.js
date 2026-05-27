import { GObject, Gdk, GLib, Gtk, Gio } from "./dependencies.js";
import { AnchorType, SDIGrid, SDIFileItem, DropType } from "./grid.js";

let instance = null;

export class SDIGridManager {
  constructor() {
    if (instance) return instance;

    instance = this;

    const grid = new SDIGrid(
      new Gio.ListStore({
        item_type: new SDIFileItem(),
      }),
    );

    grid.model.connect("items-changed", this._onItemsChanged.bind(this));

    let currentModifiers = 0;
    const motionController = new Gtk.EventControllerMotion();
    motionController.connect("motion", (ctrl, _x, _y) => {
      const event = ctrl.get_current_event();
      if (event) currentModifiers = event.get_modifier_state();
    });
    grid.add_controller(motionController);

    const dropTarget = Gtk.DropTarget.new(
      SDIFileItem.$gtype,
      Gdk.DragAction.COPY | Gdk.DragAction.MOVE,
    );
    dropTarget.preload = true;

    dropTarget.connect("motion", (target, x, y) => {});

    dropTarget.connect("drop", (target, value, x, y) => {});

    dropTarget.connect("leave", (target, x, y) => {});

    grid.add_controller(dropTarget);

    this._grid = grid;
    this._load();
  }

  get grid() {
    return this._grid;
  }

  _onItemsChanged(model, position, removed, added) {
    for (let i = 0; i < removed; i++) {
      const child = this._grid.children.get(position + i);
      this._grid.remove_child(position + i);
    }

    for (let i = 0; i < added; i++) {
      this._grid.add_child(position + i);
    }

    this._grid.queue_allocate();
  }

  _load() {
    const desktopDir = Gio.File.new_for_path(
      GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
    );

    const enumerator = desktopDir.enumerate_children(
      "standard::name",
      Gio.FileQueryInfoFlags.NONE,
      null,
    );

    let info;

    let row = 0;
    let column = 0;

    let a = enumerator.next_file(null);
    let counter = 0;
    while ((info = enumerator.next_file(null))) {
      const file = enumerator.get_child(info);

      let anchor = AnchorType.LEFT;
      if (counter > 6) anchor = AnchorType.RIGHT;

      this._grid.model.append(
        new SDIFileItem({
          uri: file.get_uri(),
          row,
          column,
          columnSpan: 1,
          rowSpan: 1,
          anchorType: anchor,
        }),
      );

      column++;
      counter++;
      if (column > 5) {
        column = 0;
        row++;
      }
    }
    this._grid.model.append(
      new SDIFileItem({
        uri: enumerator.get_child(a).get_uri(),
        row: 3,
        column: 0,
        columnSpan: 1,
        rowSpan: 1,
        anchorType: AnchorType.LEFT,
      }),
    );
  }
}
