import {
  Gtk,
  Gio,
  Pango,
  GLib,
  Gdk,
  GObject,
  Gsk,
  Graphene,
} from "./dependencies.js";

import { SDIGlobalMenu } from "./menu.js";

export const DropType = {
  INVALID: 0,
  IN_BETWEEN: 1,
  IN_FOLDER: 2,
  PLAIN_DROP: 3,
};

export const AnchorType = {
  LEFT: 0,
  RIGHT: 1,
};

const SDIFreeLayout = GObject.registerClass(
  {
    GTypeName: "SDIFreeLayout",
  },
  class SDIFreeLayout extends Gtk.LayoutManager {
    constructor(placeHolderCell) {
      super();
      this.cellW = 0;
      this.cellH = 0;
      this.columnSpacing = 0;
      this.rowSpacing = 0;
      this.nRows = 0;
      this.nColumns = 0;
      this.anchorLeftEnd;
      this._placeHolderCell = placeHolderCell;
    }

    vfunc_measure(_widget, _orientation, _for_size) {
      return [0, 0, -1, -1];
    }

    vfunc_allocate(widget, width, height, _baseline) {
      let child = widget.get_first_child();

      let cellW = this.cellW;
      let cellH = this.cellH;

      while (child) {
        if (child instanceof SDIGlobalMenu) {
          child = child.get_next_sibling();
          continue;
        }
        const [, natW] = child.measure(Gtk.Orientation.HORIZONTAL, -1);
        const [, natH] = child.measure(Gtk.Orientation.VERTICAL, -1);

        cellW = Math.max(cellW, natW);
        cellH = Math.max(cellH, natH);

        child = child.get_next_sibling();
      }

      // start with minimum spacing
      let columnSpacing = 8;
      let rowSpacing = 8;

      // calculate grid size -> one direction
      // formula: (n * w)  + (n - 1) * s <= L;
      // where L is the target length;
      // w is the target tile width
      // s is the minimum spacing
      // deriving for n gives us the following results below:
    const columns = Math.max(
        1,
        Math.floor((width + columnSpacing) / (cellW + columnSpacing))
    );

    const rows = Math.max(
        1,
        Math.floor((height + rowSpacing) / (cellH + rowSpacing))
    );
      this.nRows = rows;
      this.nColumns = columns;

      // since we can have partial tiles due to clipping
      // it is expected t have remaining unused areas
      // so we turn it to additional spacing
      const columnRemaining =
        width - (cellW * columns + (columns - 1) * columnSpacing);
      const rowRemaining = height - (cellH * rows + (rows - 1) * rowSpacing);

      columnSpacing += columnRemaining / (columns - 1);
      rowSpacing += rowRemaining / (rows - 1);

      this.cellW = cellW;
      this.cellH = cellH;

      this.columnSpacing = columnSpacing;
      this.rowSpacing = columnSpacing;

      child = widget.get_first_child();

      let occupancyMap = new Map();
      const key = (row, col) => `${row},${col}`;

      const place = (
        startRow,
        startColumn,
        columnStep,
        edgeColumn,
        anchorType,
      ) => {
        let row = startRow;
        let column = startColumn;
        let placed = false;

        // in this we allow overflow downwards but not upwards
        // so we can first check for spot upwards
        // so we can fit more cells and not waste space.
        let rowStep = -1;

        let safety = 0;
        while (!placed) {
          let overflow = anchorType === AnchorType.LEFT
            ? column > columns - 1
            : column < 0;
          if (overflow) {
            column = edgeColumn;
            row += rowStep;

            if (row < 0) {
              row = startRow;
              rowStep = 1;
            }
            continue;
          }

          if (occupancyMap.get(key(row, column)) === undefined) {
            occupancyMap.set(key(row, column), "filled");
            placed = true;

            return new Gsk.Transform().translate(
              new Graphene.Point({
                x: column * (cellW + columnSpacing),
                y: row * (cellH + rowSpacing),
              }),
            );
          } else {
            column += columnStep;
          }
        }
      };

      while (child) {
        if (child === this._placeHolderCell || child instanceof SDIGlobalMenu) {
          child = child.get_next_sibling();
          continue;
        }

        const item = child.item;

        let row = item.row;
        let column = item.column;
        let columnSpan = item.columnSpan;
        let rowSpan = item.rowSpan;

        let columnStep = 1;
        let edgeColumn = 0;

        if (item.anchorType === AnchorType.RIGHT) {
          column = (columns - 1) - column; // normalize
          columnStep = -1;
          edgeColumn = columns - 1;
        }

        let transform = place(row, column, columnStep, edgeColumn, item.anchorType);

        child.allocate(columnSpan * cellW, rowSpan * cellH, -1, transform);

        child = child.get_next_sibling();
      }
      const placeholder = this._placeHolderCell;

      const transform = new Gsk.Transform().translate(
        new Graphene.Point({ x: 0, y: 0 }),
      );

      placeholder.allocate(this.cellW, this.cellH, -1, transform);
    }
  },
);

const SDIGridCell = GObject.registerClass(
  {
    GTypeName: "SDIGridCell",
    Properties: {
      "icon-pixel-size": GObject.ParamSpec.int(
        "iconPixelSize",
        "Icon Pixel size",
        "Size of the Cell Icon in pixels",
        GObject.ParamFlags.READWRITE,
        0,
        96,
        64,
      ),
    },
  },
  class SDIGridCell extends Gtk.Box {
    constructor() {
      super({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["sdi-cell"],
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
        vexpand: true,
        hexpand: true,
      });

      this._icon = new Gtk.Image({
        pixel_size: this.iconPixelSize,
      });

      this._label = new Gtk.Label({
        ellipsize: Pango.EllipsizeMode.END,
        max_width_chars: 12,
        css_classes: ["sdi-label"],
      });

      this.append(this._icon);
      this.append(this._label);

      const drag_source = new Gtk.DragSource({
        actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE,
      });
      drag_source.connect("prepare", this._onDragPrepare.bind(this));
      drag_source.connect("drag-begin", this._onDragBegin.bind(this));
      this.add_controller(drag_source);
    }

    _onDragPrepare(_source, _x, _y) {
      return Gdk.ContentProvider.new_for_value(this._item);
    }

    _onDragBegin(source, drag) {
      const icon = Gtk.DragIcon.get_for_drag(drag);

      const copy = new SDIGridCell();

      copy.bind(this._item);
      copy.set_size_request(65, 65);

      icon.set_child(copy);
    }

    get item() {
      return this._item;
    }

    bind(item) {
      const file = Gio.File.new_for_uri(item.uri);
      this._item = item;

      const info = file.query_info(
        "standard::icon",
        Gio.FileQueryInfoFlags.NONE,
        null,
      );

      this._icon.gicon = info.get_icon();
      this._label.label = file.get_basename();
    }
  },
);

export const SDIFileItem = GObject.registerClass(
  {
    GTypeName: "SDIFileItem",

    Properties: {
      uri: GObject.ParamSpec.string(
        "uri",
        "URI",
        "File URI",
        GObject.ParamFlags.READWRITE,
        "",
      ),

      row: GObject.ParamSpec.int(
        "row",
        "Row",
        "Grid Row",
        GObject.ParamFlags.READWRITE,
        0,
        99999,
        0,
      ),

      column: GObject.ParamSpec.int(
        "column",
        "column",
        "Grid Column",
        GObject.ParamFlags.READWRITE,
        0,
        99999,
        0,
      ),

      "anchor-type": GObject.ParamSpec.int(
        "anchor-type",
        "Anchor Type",
        "Whether the cell anchors left or right",
        GObject.ParamFlags.READWRITE,
        0,
        1,
        AnchorType.LEFT,
      ),

      "row-span": GObject.ParamSpec.int(
        "row-span",
        "Row Span",
        "Grid Row Span",
        GObject.ParamFlags.READWRITE,
        0,
        99999,
        0,
      ),

      "column-span": GObject.ParamSpec.int(
        "column-span",
        "Column Span",
        "Grid Column Span",
        GObject.ParamFlags.READWRITE,
        0,
        99999,
        0,
      ),
    },
  },
  class SDIFileItem extends GObject.Object {
    constructor(params = {}) {
      super(params);
    }
  },
);

export const SDIGrid = GObject.registerClass(
  {
    GTypeName: "SDIGrid",
  },
  class SDIGrid extends Gtk.Widget {
    constructor(model) {
      super({
        hexpand: true,
        vexpand: true,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
      });

      this._widgets = new Map();
      this._model = model;

      this._placeHolderCell = new Gtk.Box({
        css_classes: ["sdi-placeholder-cell"],
        hexpand: true,
        vexpand: true,
        halign: Gtk.Align.FILL,
        valign: Gtk.Align.FILL,
      });
      this._placeHolderCell.set_parent(this);
      const layoutManager = new SDIFreeLayout(this._placeHolderCell);
      this.set_layout_manager(layoutManager);

      const menu = new SDIGlobalMenu(this);

      const rightClickController = new Gtk.GestureClick();
      rightClickController.set_button(3);
      rightClickController.connect(
        "pressed",
        (_gestureClick, _n_press, x, y) => {
          menu.set_pointing_to(
            new Gdk.Rectangle({
              x,
              y,
              width: 200,
              height: 1,
            }),
          );

          menu.popup();
        },
      );

      this.add_controller(rightClickController);
    }

    get children() {
      return this._widgets;
    }

    remove_child(position) {
      const child = this._widgets.get(position);
      if (child) {
        child.unparent();
        this._widgets.delete(position);
      }
    }

    add_child(position) {
      const cell = new SDIGridCell();
      cell.bind(this.model.get_item(position));
      cell.set_parent(this);
      this._widgets.set(position, cell);

      return cell;
    }

    get_child(position) {
      const child = this._widgets.get(position);
      return child;
    }

    get model() {
      return this._model;
    }

    get nColumns() {
      return this.get_layout_manager().nColumns;
    }

    get nRows() {
      return this.get_layout_manager().nRows;
    }

    get cellW() {
      return this.get_layout_manager().cellW;
    }

    get cellH() {
      return this.get_layout_manager().cellH;
    }

    get columnSpacing() {
      return this.get_layout_manager().columnSpacing;
    }

    get rowSpacing() {
      return this.get_layout_manager().rowSpacing;
    }

    get_drop_info_for_cursor(curX, curY) {
      const column = Math.floor(curX / (this.cellW + this.columnSpacing));
      const row = Math.floor(curY / (this.cellH + this.rowSpacing));

      const x1 = column * (this.cellW + this.columnSpacing);
      const y1 = row * (this.cellH + this.rowSpacing);

      const x2 = x1 + this.cellW + this.columnSpacing;
      const y2 = y1 + this.cellH + this.columnSpacing;

      let index = null;
      if (curX >= x1 && curX <= x2 && curY >= y1 && curY <= y2)
        index = row * this.nColumns + column;

      const margin = this.cellW * 0.2;
      const inCenter =
        curX > x1 + margin &&
        curX < x2 - margin &&
        curY > y1 + margin &&
        curY < y2 - margin;

      // check if index is a velid tile
      let item = null;
      for (let i = 0; i < this.model.get_n_items(); i++) {
        let it = this.model.get_item(i);
        if (index == it.index) {
          item = it;
          break;
        }
      }

      if (item === null) {
        return {
          index,
          dropType: DropType.PLAIN_DROP,
        };
      }

      if (this._isFolder(item.uri) === false) {
        return {
          index,
          dropType: DropType.INVALID,
        };
      }

      return {
        index,
        dropType: inCenter ? DropType.IN_FOLDER : DropType.IN_BETWEEN,
      };
    }

    _isFolder(uri) {
      try {
        const file = Gio.File.new_for_uri(uri);

        const info = file.query_info(
          "standard::type",
          Gio.FileQueryInfoFlags.NONE,
          null,
        );

        return info.get_file_type() === Gio.FileType.DIRECTORY;
      } catch (_e) {
        return false;
      }
    }

    getItemByURI(uri) {
      for (let i = 0; i < this._model.get_n_items(); i++) {
        let item = this._model.get_item(i);
        if (item.uri === uri) {
          return item;
        }
      }
      return null;
    }

    showPlaceHolderCell(index) {
      const lc = this.get_layout_manager().get_layout_child(
        this._placeHolderCell,
      );
      lc.index = index;
      lc.columnSpan = 1;
      lc.rowSpan = 1;
      this.queue_allocate();
    }

    hidePlaceHolderCell() {
      const lc = this.get_layout_manager().get_layout_child(
        this._placeHolderCell,
      );
      lc.columnSpan = 0;
      lc.rowSpan = 0;
      this.queue_allocate();
    }
  },
);
