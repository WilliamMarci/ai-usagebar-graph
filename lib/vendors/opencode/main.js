import {withMutex, staleResult} from '../fetch-common.js';
import {parseUsage, snapshotToCacheJson, parseCacheJson} from './parser.js';

const CACHE_TTL_MS = 60_000;

async function doFetch(deps) {
    const staleOr = noCache => staleResult(deps.cache, parseCacheJson, noCache);
    const fresh = await deps.cache.freshPayload(CACHE_TTL_MS);
    if (fresh !== null)
        return {ok: true, snapshot: parseCacheJson(fresh), stale: false, lastError: null, cacheAgeMs: await deps.cache.payloadAgeMs() ?? 0};
    const res = await deps.http({
        method: 'GET', url: `${deps.baseUrl}/zen/go/v1/usage`,
        headers: {Authorization: `Bearer ${deps.apiKey}`, Accept: 'application/json'},
        timeoutMs: 10_000, cancellable: deps.signal,
    });
    if (res.error)
        return staleOr({ok: false, kind: 'loading'});
    if (res.status < 200 || res.status >= 300) {
        const body = new TextDecoder().decode(res.bodyBytes ?? new Uint8Array());
        deps.cache.markStale();
        deps.cache.writeLastError(res.status, body);
        return staleOr({ok: false, kind: 'error', message: `OpenCode usage request failed (HTTP ${res.status})`});
    }
    try {
        const snapshot = parseUsage(res.bodyBytes);
        deps.cache.writePayload(snapshotToCacheJson(snapshot));
        return {ok: true, snapshot, stale: false, lastError: null, cacheAgeMs: 0};
    } catch (e) {
        return staleOr({ok: false, kind: 'error', message: e?.message ?? String(e)});
    }
}

export const fetchSnapshot = deps => withMutex(deps?.cache?.dir ?? 'opencode', () => doFetch(deps));
