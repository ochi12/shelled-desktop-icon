import { Gtk, Gio, GLib, GObject } from './dependencies.js';

export const SDIGlobalMenu = GObject.registerClass(
    {
        GTypeName: 'SDIGlobalMenu',
    },
    class SDIGlobalMenu extends Gtk.PopoverMenu {
        constructor(parent) {
            super({
                css_classes: ['menu'],
                has_arrow: false,
                position: Gtk.PositionType.BOTTOM,
                autohide: true,
            });
            this.set_parent(parent);

            this._newDocumentSubMenuInserted = false;

            this._actionGroup = new Gio.SimpleActionGroup();
            this.insert_action_group('grid', this._actionGroup);
            this._setupActionGroup();

            const menuModel = this._createMenuModel();
            this.set_menu_model(menuModel);
        }

        _createMenuModel() {
            const menu = new Gio.Menu();

            this._primarySection = new Gio.Menu();
            this._primarySection.append('New Folder...', 'grid.newFolder');

            const settingsSectionA = new Gio.Menu();
            settingsSectionA.append('Change Background...', 'grid.changeBG');

            const settingsSectionB = new Gio.Menu();
            settingsSectionB.append('Display Settings', 'grid.displaySettings');
            settingsSectionB.append('Settings', 'grid.settings');

            menu.append_section(null, this._primarySection);
            menu.append_section(null, settingsSectionA);
            menu.append_section(null, settingsSectionB);

            return menu;
        }

        _setupActionGroup() {
            const newFolderAction = new Gio.SimpleAction({ name: 'newFolder' });
            const newDocumentAction = new Gio.SimpleAction({
                name: 'newDocument',
                parameter_type: new GLib.VariantType('s'),
            });

            const changeBGAction = new Gio.SimpleAction({ name: 'changeBG' });
            const displaySettingsAction = new Gio.SimpleAction({
                name: 'displaySettings',
            });
            const settingsAction = new Gio.SimpleAction({ name: 'settings' });

            newDocumentAction.connect('activate', (action, param) => {
                console.log(`Selected ${param?.deepUnpack()}`);
            });

            changeBGAction.connect('activate', () => {
                const appInfo = Gio.DesktopAppInfo.new(
                    'gnome-background-panel.desktop',
                );
                if (appInfo) {
                    appInfo.launch([], null);
                } else {
                    console.error(
                        'Could not locate a desktop file named: gnome-background-panel.desktop',
                    );
                }
            });

            displaySettingsAction.connect('activate', () => {
                const appInfo = Gio.DesktopAppInfo.new('gnome-display-panel.desktop');
                if (appInfo) {
                    appInfo.launch([], null);
                } else {
                    console.error(
                        'Could not locate a desktop file named: gnome-display-panel.desktop',
                    );
                }
            });

            settingsAction.connect('activate', () => {
                const appInfo = Gio.DesktopAppInfo.new('org.gnome.Settings.desktop');
                if (appInfo) {
                    appInfo.launch([], null);
                } else {
                    console.error(
                        'Could not locate a desktop file named: org.gnome.Settings.desktop',
                    );
                }
            });

            this._actionGroup.add_action(newFolderAction);
            this._actionGroup.add_action(newDocumentAction);
            this._actionGroup.add_action(changeBGAction);
            this._actionGroup.add_action(displaySettingsAction);
            this._actionGroup.add_action(settingsAction);
        }
    },
);
