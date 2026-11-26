import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {loadBytesAsync} from '../cache.js';

export function defaultCredentialsPath() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'oauth_creds.json']);
}

export async function readAccessToken(path = defaultCredentialsPath(), nowMs = Date.now()) {
    let bytes;
    try {
        bytes = await loadBytesAsync(Gio.File.new_for_path(path));
    } catch (e) {
        throw new Error(`Could not read Gemini CLI credentials at ${path}: ${e?.message ?? e}`);
    }
    if (bytes === null)
        throw new Error(`Gemini CLI credentials not found at ${path}. Sign in with Gemini CLI, or set the configured OAuth token environment variable.`);
    let doc;
    try {
        doc = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        throw new Error(`Could not parse Gemini CLI credentials at ${path}: ${e?.message ?? e}`);
    }
    const token = doc?.access_token;
    if (typeof token !== 'string' || token.trim() === '')
        throw new Error(`Gemini CLI credentials at ${path} contain no access_token. Sign in again, or use the OAuth token environment variable.`);
    const expires = Number(doc?.expiry_date);
    if (Number.isFinite(expires) && expires <= nowMs + 60_000)
        throw new Error('The Gemini CLI OAuth token is expired. Run Gemini CLI to refresh the login, then test again.');
    return token.trim();
}
