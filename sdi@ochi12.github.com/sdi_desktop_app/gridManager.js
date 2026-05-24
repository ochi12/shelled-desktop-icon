import { Gdk, GLib, Gtk, Gio } from "./dependencies.js";
import { SDIGrid, SDIFileItem } from "./grid.js";

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
      String.$gtype,
      Gdk.DragAction.COPY | Gdk.DragAction.MOVE,
    );
    dropTarget.connect("motion", (_dropTarget, x, y) => {
      const index = grid.get_index_for_cursor(x, y);
      if (index) grid.showPlaceHolderCell(index);
      else grid.hidePlaceHolderCell();

      return currentModifiers & Gdk.ModifierType.CONTROL_MASK
        ? Gdk.DragAction.COPY
        : Gdk.DragAction.MOVE;
    });

    dropTarget.connect("drop", (_dropTarget, value, x, y) => {
      grid.hidePlaceHolderCell();
      const index = grid.get_index_for_cursor(x, y);
      if (index !== null) {
        const item = grid.getItemByURI(value);
        const widget = grid.get_child_by_item(item);
        if (item) {
          item.index = index;
          grid.get_layout_manager().get_layout_child(widget).index = index;
          grid.model.sort((a, b) => a.index - b.index);
        }
      }
      return true;
    });

    dropTarget.connect("leave", () => {
      grid.hidePlaceHolderCell();
    });

    grid.add_controller(dropTarget);

    this._grid = grid;
    this._load();
  }

  get grid() {
    return this._grid;
  }

  _onItemsChanged(model, position, removed, added) {
    for (let i = 0; i < removed; i++) {
      const item = model.get_item(position + i);
      this._grid.remove_child_by_item(item);
    }

    for (let i = 0; i < added; i++) {
      const item = model.get_item(position + i);

      const child = this._grid.add_child_by_item(item);

      const lc = this._grid.get_layout_manager().get_layout_child(child);
      lc.index = item.index;
      lc.rowSpan = item.rowSpan;
      lc.columnSpan = item.columnSpan;
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

    let index = 0;

    let a = enumerator.next_file(null);
    while ((info = enumerator.next_file(null))) {
      const file = enumerator.get_child(info);

      this._grid.model.insert_sorted(
        new SDIFileItem({
          uri: file.get_uri(),
          index,
          columnSpan: 1,
          rowSpan: 1,
        }),

        (a, b) => a.index - b.index,
      );

      index++;
    }

    this._grid.model.insert_sorted(
      new SDIFileItem({
        uri: enumerator.get_child(a).get_uri(),
        columnSpan: 1,
        rowSpan: 1,
        index: 20,
      }),

      (a, b) => a.index - b.index,
    );
  }
}
