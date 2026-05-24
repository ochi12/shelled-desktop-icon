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

const SDILayoutChild = GObject.registerClass(
  {
    GTypeName: "SDILayoutChild",
    Properties: {
      index: GObject.ParamSpec.int(
        "index",
        "index",
        "idex",
        GObject.ParamFlags.READWRITE,
        -99999,
        99999,
        0,
      ),

      "column-span": GObject.ParamSpec.int(
        "columnSpan",
        "column_span",
        "columnspan",
        GObject.ParamFlags.READWRITE,
        -99999,
        99999,
        0,
      ),

      "row-span": GObject.ParamSpec.int(
        "rowSpan",
        "row_span",
        "rowspan",
        GObject.ParamFlags.READWRITE,
        -99999,
        99999,
        0,
      ),
    },
  },
  class SDILayoutChild extends Gtk.LayoutChild {
    constructor(params) {
      super(params);
    }
  },
);

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
      this._placeHolderCell = placeHolderCell;
    }

    vfunc_create_layout_child(widget, child) {
      return new SDILayoutChild({
        layout_manager: this,
        child_widget: child,
      });
    }

    vfunc_measure(_widget, _orientation, _for_size) {
      return [0, 0, -1, -1];
    }

    vfunc_allocate(widget, width, height, _baseline) {
      let child = widget.get_first_child();

      let cellW = 5;
      let cellH = 5;

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
      child = widget.get_first_child();

      // start with minimum spacing
      let columnSpacing = 8;
      let rowSpacing = 8;

      // calculate grid size -> one direction
      // formula: (n * w)  + (n - 1) * s <= L;
      // where L is the target length;
      // w is the target tile width
      // s is the minimum spacing
      // deriving for n gives us the following results below:
      const columns = Math.floor(
        (width + columnSpacing) / (cellW + columnSpacing),
      );
      const rows = Math.floor((height + rowSpacing) / (cellH + rowSpacing));
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

      const placeHolderLc = this.get_layout_child(this._placeHolderCell);

      while (child) {
        if (child === this._placeHolderCell || child instanceof SDIGlobalMenu) {
          child = child.get_next_sibling();
          continue;
        }

        const lc = this.get_layout_child(child);

        let columnSpan = lc.columnSpan;
        let rowSpan = lc.rowSpan;
        let index = lc.index;

        if (index === placeHolderLc.index) {
          placeHolderLc.columnSpan = 0;
          placeHolderLc.rowSpan = 0;
        }

        let right = child.get_next_sibling();
        let left = child;

        let column = index % columns;
        let row = Math.floor(index / columns);

        const transform = new Gsk.Transform().translate(
          new Graphene.Point({
            x: column * (cellW + columnSpacing),
            y: row * (cellH + rowSpacing),
          }),
        );

        child.allocate(columnSpan * cellW, rowSpan * cellH, -1, transform);

        child = child.get_next_sibling();
      }

      let column = placeHolderLc.index % columns;
      let row = Math.floor(placeHolderLc.index / columns);
      let columnSpan = placeHolderLc.columnSpan;
      let rowSpan = placeHolderLc.rowSpan;

      const transform = new Gsk.Transform().translate(
        new Graphene.Point({
          x: column * (cellW + columnSpacing),
          y: row * (cellH + rowSpacing),
        }),
      );

      this._placeHolderCell.allocate(
        columnSpan * cellW,
        rowSpan * cellH,
        -1,
        transform,
      );
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
      return Gdk.ContentProvider.new_for_value(this._item.uri);
    }

    _onDragBegin(source, _drag) {
      const paintable = Gtk.WidgetPaintable.new(this);
      source.set_icon(paintable, 0, 0);
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

      index: GObject.ParamSpec.int(
        "index",
        "Index",
        "Grid Index",
        GObject.ParamFlags.READWRITE,
        0,
        99999,
        0,
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

    remove_child_by_item(item) {
      const child = this._widgets.get(item);
      if (child) {
        child.unparent();
        this._widgets.delete(item);
      }
    }

    add_child_by_item(item) {
      const cell = new SDIGridCell();
      cell.bind(item);
      cell.set_parent(this);
      this._widgets.set(item, cell);

      return cell;
    }

    get_child_by_item(item) {
      const child = this._widgets.get(item);
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

    get_index_for_cursor(curX, curY) {
      const column = Math.floor(curX / (this.cellW + this.columnSpacing));
      const row = Math.floor(curY / (this.cellH + this.rowSpacing));

      const x1 = column * (this.cellW + this.columnSpacing);
      const y1 = row * (this.cellH + this.rowSpacing);

      const x2 = x1 + this.cellW;
      const y2 = y1 + this.cellH;

      if (curX >= x1 && curX <= x2 && curY >= y1 && curY <= y2)
        return row * this.nColumns + column;
      else return null;
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

    vfunc_size_allocate(_width, _height, _baseline) {
      this.queue_allocate();
    }
  },
);
