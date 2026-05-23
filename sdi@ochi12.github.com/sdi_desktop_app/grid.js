import {
    Gtk,
    Gio,
    Pango,
    GLib,
    Gdk,
    GObject,
    Gsk,
    Graphene,
} from './dependencies.js';

import { SDIGlobalMenu } from './menu.js';

const SDILayoutChild = GObject.registerClass(
    {
        GTypeName: 'SDILayoutChild',
        Properties: {
            index: GObject.ParamSpec.int(
                'index',
                'index',
                'idex',
                GObject.ParamFlags.READWRITE,
                -99999,
                99999,
                0,
            ),

            'column-span': GObject.ParamSpec.int(
                'columnSpan',
                'column_span',
                'columnspan',
                GObject.ParamFlags.READWRITE,
                -99999,
                99999,
                0,
            ),

            'row-span': GObject.ParamSpec.int(
                'rowSpan',
                'row_span',
                'rowspan',
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
        GTypeName: 'SDIFreeLayout',
    },
    class SDIFreeLayout extends Gtk.LayoutManager {
        constructor(placeHolderCell) {
            super();
            this._cellW = 0;
            this._cellH = 0;
            this._columnSpacing = 0;
            this._rowSpacing = 0;
            this._nRows = 0;
            this._nColumns = 0;
            this._placeHolderCell = placeHolderCell;
        }

        get_index_for_cursor(curX, curY) {
            const column = Math.floor(curX / (this._cellW + this._columnSpacing));
            const row = Math.floor(curY / (this._cellH + this._rowSpacing));

            const x1 = column * (this._cellW + this._columnSpacing);
            const y1 = row * (this._cellH + this._rowSpacing);

            const x2 = x1 + this._cellW;
            const y2 = y1 + this._cellH;

            if (curX >= x1 && curX <= x2 && curY >= y1 && curY <= y2)
                return row * this._nColumns + column;
            else return null;
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
            this._nRows = rows;
            this._nColumns = columns;

            // since we can have partial tiles due to clipping
            // it is expected t have remaining unused areas
            // so we turn it to additional spacing
            const columnRemaining =
        width - (cellW * columns + (columns - 1) * columnSpacing);
            const rowRemaining = height - (cellH * rows + (rows - 1) * rowSpacing);

            columnSpacing += columnRemaining / (columns - 1);
            rowSpacing += rowRemaining / (rows - 1);

            const lc = this.get_layout_child(this._placeHolderCell);
            let column = lc.index % columns;
            let row = Math.floor(lc.index / columns);
            let columnSpan = lc.columnSpan;
            let rowSpan = lc.rowSpan;

            this._cellW = cellW;
            this._cellH = cellH;
            this._columnSpacing = columnSpacing;
            this._rowSpacing = columnSpacing;

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

            while (child) {
                if (child === this._placeHolderCell) {
                    child = child.get_next_sibling();
                    continue;
                }

                const lc = this.get_layout_child(child);

                let columnSpan = lc.columnSpan;
                let rowSpan = lc.rowSpan;
                let index = lc.index;

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
        }
    },
);

const SDIGridCell = GObject.registerClass(
    {
        GTypeName: 'SDIGridCell',
        Properties: {
            'icon-pixel-size': GObject.ParamSpec.int(
                'iconPixelSize',
                'Icon Pixel size',
                'Size of the Cell Icon in pixels',
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
                css_classes: ['sdi-cell'],
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
                css_classes: ['sdi-label'],
            });

            this.append(this._icon);
            this.append(this._label);

            const drag_source = new Gtk.DragSource({
                actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE,
            });
            drag_source.connect('prepare', this._onDragPrepare.bind(this));
            drag_source.connect('drag-begin', this._onDragBegin.bind(this));
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
                'standard::icon',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );

            this._icon.gicon = info.get_icon();
            this._label.label = file.get_basename();
        }
    },
);

const SDIFileItem = GObject.registerClass(
    {
        GTypeName: 'SDIFileItem',

        Properties: {
            uri: GObject.ParamSpec.string(
                'uri',
                'URI',
                'File URI',
                GObject.ParamFlags.READWRITE,
                '',
            ),

            index: GObject.ParamSpec.int(
                'index',
                'Index',
                'Grid Index',
                GObject.ParamFlags.READWRITE,
                0,
                99999,
                0,
            ),

            'row-span': GObject.ParamSpec.int(
                'row-span',
                'Row Span',
                'Grid Row Span',
                GObject.ParamFlags.READWRITE,
                0,
                99999,
                0,
            ),

            'column-span': GObject.ParamSpec.int(
                'column-span',
                'Column Span',
                'Grid Column Span',
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
        GTypeName: 'SDIGrid',
    },
    class SDIGrid extends Gtk.Widget {
        constructor() {
            super({
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
            });

            this._widgets = new Map();

            this._model = new Gio.ListStore({
                item_type: new SDIFileItem(),
            });

            this._model.connect('items-changed', this._onItemsChanged.bind(this));

            this._placeHolderCell = new Gtk.Box({
                css_classes: ['sdi-placeholder-cell'],
                hexpand: true,
                vexpand: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.FILL,
            });
            this._placeHolderCell.set_parent(this);

            const layoutManager = new SDIFreeLayout(this._placeHolderCell);
            this.set_layout_manager(layoutManager);

            this._load();

            let currentModifiers = 0;
            const motionController = new Gtk.EventControllerMotion();
            motionController.connect('motion', (ctrl, _x, _y) => {
                const event = ctrl.get_current_event();
                if (event) currentModifiers = event.get_modifier_state();
            });
            this.add_controller(motionController);

            const dropTarget = Gtk.DropTarget.new(
                String.$gtype,
                Gdk.DragAction.COPY | Gdk.DragAction.MOVE,
            );
            dropTarget.connect('motion', (_dropTarget, x, y) => {
                const index = layoutManager.get_index_for_cursor(x, y);
                if (index !== null) this._showPlaceHolderCell(index);
                else this._hidePlaceHolderCell();

                return currentModifiers & Gdk.ModifierType.CONTROL_MASK
                    ? Gdk.DragAction.COPY
                    : Gdk.DragAction.MOVE;
            });

            dropTarget.connect('drop', (_dropTarget, value, x, y) => {
                this._hidePlaceHolderCell();
                const index = layoutManager.get_index_for_cursor(x, y);
                if (index !== null) {
                    const item = this._getItemByURI(value);
                    if (item) {
                        const widget = this._widgets.get(item);

                        layoutManager.get_layout_child(widget).index = index;
                        item.index = index;
                        this.queue_allocate();
                    }
                }
                return true;
            });

            this.add_controller(dropTarget);
        }

        _getItemByURI(uri) {
            for (let i = 0; i < this._model.get_n_items(); i++) {
                let item = this._model.get_item(i);
                if (item.uri === uri) {
                    return item;
                }
            }
            return null;
        }

        _showPlaceHolderCell(index) {
            const lc = this.get_layout_manager().get_layout_child(
                this._placeHolderCell,
            );
            lc.index = index;
            lc.columnSpan = 1;
            lc.rowSpan = 1;
            this.queue_allocate();
        }

        _hidePlaceHolderCell() {
            const lc = this.get_layout_manager().get_layout_child(
                this._placeHolderCell,
            );
            lc.index = 0;
            lc.columnSpan = 0;
            lc.rowSpan = 0;
            this.queue_allocate();
        }

        vfunc_size_allocate(_width, _height, _baseline) {
            this.queue_allocate();
        }

        _load() {
            const desktopDir = Gio.File.new_for_path(
                GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
            );

            const enumerator = desktopDir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );

            let info;

            let index = 0;

            let a = enumerator.next_file(null);
            while ((info = enumerator.next_file(null))) {
                const file = enumerator.get_child(info);

                this._model.append(
                    new SDIFileItem({
                        uri: file.get_uri(),
                        index,
                        columnSpan: 1,
                        rowSpan: 1,
                    }),
                );

                index++;
            }

            this._model.append(
                new SDIFileItem({
                    uri: enumerator.get_child(a).get_uri(),
                    columnSpan: 1,
                    rowSpan: 1,
                    index: 20,
                }),
            );
        }

        _onItemsChanged(model, position, removed, added) {
            for (let i = 0; i < removed; i++) {
                const item = model.get_item(position);

                const widget = this._widgets.get(item);

                if (widget) {
                    widget.unparent();
                    this._widgets.delete(item);
                }
            }

            for (let i = 0; i < added; i++) {
                const item = model.get_item(position + i);

                const cell = new SDIGridCell();
                cell.bind(item);
                cell.set_parent(this);

                const lc = this.get_layout_manager().get_layout_child(cell);
                lc.index = item.index;
                lc.rowSpan = item.rowSpan;
                lc.columnSpan = item.columnSpan;

                this._widgets.set(item, cell);
            }

            this.queue_allocate();
        }
    },
);
