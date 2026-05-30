import { Gio } from "./dependencies.js";

export function getSettings() {
  const dir = Gio.File.new_for_uri(import.meta.url)
    .get_parent()
    .get_parent();

  const schemaDir = dir.get_child("schemas");

  const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
    schemaDir.get_path(),
    Gio.SettingsSchemaSource.get_default(),
    false,
  );

  const schema = schemaSource.lookup("org.gnome.shell.extensions.sdi", false);

  const settings = new Gio.Settings({ settings_schema: schema });

  return settings;
}
