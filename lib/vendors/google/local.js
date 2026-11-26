import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseUsage, snapshotToCacheJson} from './parser.js';

export const QUOTA_RPC = 'exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary';

function hubDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'antigravity', 'daemon']);
}

function descriptor(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) return null;
        const obj = JSON.parse(new TextDecoder().decode(bytes));
        const port = Number(obj.httpPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof obj.csrfToken !== 'string')
            return null;
        const info = Gio.File.new_for_path(path).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        return {port, csrfToken: obj.csrfToken, modified: info.get_modification_date_time()?.to_unix() ?? 0};
    } catch (_) { return null; }
}

export function discoverHubs(dir = hubDir()) {
    const hubs = [];
    try {
        const folder = Gio.File.new_for_path(dir);
        const entries = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = entries.next_file(null)) !== null) {
            if (!/^hub_\d+\.json$/.test(info.get_name())) continue;
            const hub = descriptor(GLib.build_filenamev([dir, info.get_name()]));
            if (hub) hubs.push(hub);
        }
        entries.close(null);
    } catch (_) { /* Antigravity is not installed or has never run */ }
    return hubs.sort((a, b) => b.modified - a.modified);
}

export async function fetchLocalSnapshot(deps) {
    const hubs = deps.descriptors ?? discoverHubs();
    for (const hub of hubs) {
        const res = await deps.http({
            method: 'POST',
            url: `http://127.0.0.1:${hub.port}/${QUOTA_RPC}`,
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': hub.csrfToken,
            },
            body: '{}', timeoutMs: 3_000, cancellable: deps.signal,
        });
        if (res.error || res.status < 200 || res.status >= 300)
            continue;
        try {
            const snapshot = parseUsage(res.bodyBytes);
            deps.cache.writePayload(snapshotToCacheJson(snapshot));
            return {ok: true, snapshot, stale: false, lastError: null, cacheAgeMs: 0};
        } catch (_) { /* stale/incompatible hub; try the next running product */ }
    }
    return null;
}
