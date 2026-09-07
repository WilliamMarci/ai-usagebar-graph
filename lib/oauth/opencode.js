import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function defaultAuthPath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'opencode', 'auth.json']);
}

export async function readApiKey(path = defaultAuthPath()) {
    const file = Gio.File.new_for_path(path);
    const bytes = await new Promise((resolve, reject) => {
        file.load_contents_async(null, (f, result) => {
            try {
                const [ok, contents] = f.load_contents_finish(result);
                if (!ok)
                    throw new Error(`unable to read ${path}`);
                resolve(contents);
            } catch (e) {
                reject(e);
            }
        });
    });
    const doc = JSON.parse(new TextDecoder().decode(bytes));
    const key = doc?.['opencode-go']?.key;
    if (typeof key !== 'string' || !key)
        throw new Error(`OpenCode Go key not found in ${path}; run /connect in OpenCode`);
    return key;
}
