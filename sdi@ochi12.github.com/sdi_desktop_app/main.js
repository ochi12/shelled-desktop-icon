#!/usr/bin/env -S gjs -m

import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import system from 'system';

import { SDIGrid } from './grid.js';

const SDIWindow = GObject.registerClass({
    GTypeName: 'SDIWindow',
}, class SDIWindow extends Adw.ApplicationWindow {
    constructor(params = {}) {
        super(params);
        this.add_css_class('transparent-sdi-window');

        const grid = new SDIGrid();

        this.set_content(grid);
        this.maximize();
    }
});


const SDIApplication = GObject.registerClass({
    GTypeName: 'SDIApplication',
}, class SDIApplication extends Adw.Application {
    constructor() {
        super({
            application_id: 'com.github.ochi12.sdi',
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });
    }

    vfunc_activate() {
        const file = Gio.File.new_for_uri(import.meta.url)
            .get_parent()
            .get_child('style.css');


        const provider = new Gtk.CssProvider();
        provider.load_from_file(file);

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        let window = new SDIWindow({ application: this });
        window.present();
    }
});

// 3. Initialize and Execute
Adw.init();
const app = new SDIApplication();
app.run([system.programInvocationName].concat(ARGV));
