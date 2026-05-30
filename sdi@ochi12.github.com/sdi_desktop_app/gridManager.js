import { GObject, Gdk, GLib, Gtk, Gio } from "./dependencies.js";
import { AnchorType, SDIGrid, SDIFileItem, DropType } from "./grid.js";
import { getSettings } from "./utils.js";

let GRID_DATA_KEY = "sdi-grid-data";

let instance = null;

export class SDIGridManager {
  constructor() {
    if (instance) return instance;

    instance = this;

    const grid = new SDIGrid(
      new Gio.ListStore({
        item_type: SDIFileItem.$gtype,
      }),
    );

    grid.model.connect("items-changed", this._onItemsChanged.bind(this));

    this._settings = getSettings();
    this._desktopDir = Gio.File.new_for_path(
      GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
    );
    console.log(
      GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
    );

    this._desktopMonitor = this._desktopDir.monitor_directory(
      Gio.FileMonitorFlags.WATCH_MOVES | Gio.FileMonitorFlags.WATCH_MOUNTS,
      null,
    );

    this._desktopMonitor.connect("changed", this._onDesktopChanged.bind(this));

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
    this._grid.get_layout_manager().connect("new-cell-data", (layout, data) => {
      let gridData = [...this._settings.get_strv(GRID_DATA_KEY)];
      for (const cellData of data) {
        const cellDataStr = JSON.stringify(cellData);
        console.log(cellDataStr);
        gridData.push(cellDataStr);
      }
      this._settings.set_strv(GRID_DATA_KEY, gridData);
    });
    this._load();
  }

  get grid() {
    return this._grid;
  }

  _removeCellDataStrForURIs(uris) {
    const urisSet = new Set(uris);

    const gridData = this._settings.get_strv(GRID_DATA_KEY);

    const filtered = gridData.filter((cellDataStr) => {
      try {
        const cellData = JSON.parse(cellDataStr);
        return !urisSet.has(cellData.uri);
      } catch (e) {
        console.error(e);
        return true;
      }
    });

    if (filtered.length !== gridData.length)
      this._settings.set_strv(GRID_DATA_KEY, filtered);
  }

  _updateCellDataStrFromCellDataArr(cellDataArr) {
    const updates = new Map(
      cellDataArr.map((cellData) => [cellData.uri, cellData]),
    );

    const gridData = this._settings.get_strv(GRID_DATA_KEY);

    const updated = gridData.map((cellDataStr) => {
      try {
        const cellData = JSON.parse(cellDataStr);
        const replacement = updates.get(cellData.uri);

        return replacement ? JSON.stringify(replacement) : cellDataStr;
      } catch (e) {
        console.error(e);
        return cellDataStr;
      }
    });

    this._settings.set_strv(GRID_DATA_KEY, updated);
  }

  _onDesktopChanged(monitor, file, other_file, event_type) {
    console.log(event_type);
    switch (event_type) {
      case Gio.FileMonitorEvent.CREATED:
      case Gio.FileMonitorEvent.MOVED_IN: {
        const uri = file.get_uri();
        if (this._grid.getItemByURI(uri)) return;

        const item = new SDIFileItem({
          uri,
          row: 0,
          column: 0,
          rowSpan: 1,
          columnSpan: 1,
          anchorType: AnchorType.RIGHT,
        });
        item.needsLayout = true;

        this._grid.model.append(item);
        break;
      }

      case Gio.FileMonitorEvent.DELETED:
      case Gio.FileMonitorEvent.MOVED_OUT: {
        const uri = file.get_uri();
        const item = this._grid.getItemByURI(uri);

        if (item === null) return;

        const [ok, position] = this._grid.model.find(item);
        if (ok) {
          this._grid.model.remove(position);
          this._removeCellDataStrForURIs([uri]);
        }
        break;
      }

      case Gio.FileMonitorEvent.RENAMED: {
        const oldURI = file.get_uri();
        const newURI = other_file.get_uri();
        const item = this._grid.getItemByURI(oldURI);

        if (item === null) return;

        item.uri = newURI;

        this._updateCellDataStrFromCellDataArr([item]);
        const [ok, position] = this._grid.model.find(item);
        if (ok) {
          const child = this._grid.get_child(position);
          child.bind(item);
        }

        this._grid.queue_allocate();

        break;
      }
    }
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
    const desktopDir = this._desktopDir;
    const enumerator = desktopDir.enumerate_children(
      "standard::name",
      Gio.FileQueryInfoFlags.NONE,
      null,
    );

    let info;

    const currentDesktopURIs = new Set();

    while ((info = enumerator.next_file(null))) {
      const file = enumerator.get_child(info);
      currentDesktopURIs.add(file.get_uri());
    }
    enumerator.close(null);

    let gridData = this._settings.get_strv(GRID_DATA_KEY);

    if (gridData.length === 0) {
      let row = 0;
      let column = 0;
      const maxColumn = 7;
      const newGridData = [];

      for (const uri of currentDesktopURIs) {
        const cellData = {
          uri,
          row,
          column,
          rowSpan: 1,
          columnSpan: 1,
          anchorType: AnchorType.LEFT,
        };

        let cellDataStr = JSON.stringify(cellData);
        newGridData.push(cellDataStr);

        let item = new SDIFileItem(cellData);
        this._grid.model.append(item);

        column++;
        if (column > maxColumn) {
          column = 0;
          row++;
        }
      }

      this._settings.set_strv(GRID_DATA_KEY, newGridData);
      return;
    }

    const validGridData = [];

    for (const cellDataStr of gridData) {
      try {
        const cellData = JSON.parse(cellDataStr);

        if (!currentDesktopURIs.has(cellData.uri)) continue;

        validGridData.push(cellDataStr);

        const item = new SDIFileItem(cellData);
        this._grid.model.append(item);

        // we will loop again later for remaining uris
        currentDesktopURIs.delete(cellData.uri);
      } catch (e) {
        console.error(e);
      }
    }

    this._settings.set_strv(GRID_DATA_KEY, validGridData);

    for (const uri of currentDesktopURIs) {
      const cellData = {
        uri,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
        anchorType: AnchorType.RIGHT,
      };

      const item = new SDIFileItem(cellData);
      item.needsLayout = true;
      this._grid.model.append(item);
    }
  }
}
