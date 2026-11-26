import {withMutex, staleResult} from '../fetch-common.js';
import {parseUsage, parseCacheJson, snapshotToCacheJson} from './parser.js';

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const CACHE_TTL_MS = 60_000;

function text(bytes) {
    return new TextDecoder().decode(bytes ?? new Uint8Array());
}

function projectFromLoad(obj) {
    const value = obj?.cloudaicompanionProject;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value.id ?? value.projectId ?? value.name ?? '';
    return '';
}

function creditsFromLoad(obj) {
    const value = obj?.paidTier?.availableCredits;
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') return value.creditAmount ?? value.amount ?? null;
    return value;
}

async function post(deps, path, body) {
    return deps.http({method: 'POST', url: `${deps.endpoint ?? CODE_ASSIST_ENDPOINT}/v1internal:${path}`,
        headers: {Authorization: `Bearer ${deps.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify(body), timeoutMs: 10_000, cancellable: deps.signal});
}

async function doFetch(deps) {
    const staleOr = noCache => staleResult(deps.cache, parseCacheJson, noCache);
    const fresh = await deps.cache.freshPayload(CACHE_TTL_MS);
    if (fresh !== null) {
        try { return {ok: true, snapshot: parseCacheJson(fresh), stale: false, lastError: null,
            cacheAgeMs: await deps.cache.payloadAgeMs() ?? 0}; } catch (_) { /* fetch live */ }
    }

    let projectId = deps.projectId ?? '';
    let plan = 'Gemini Code Assist';
    let credits = null;
    if (!projectId) {
        const loaded = await post(deps, 'loadCodeAssist', {cloudaicompanionProject: '', metadata: {
            ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI'}, mode: 'HEALTH_CHECK'});
        if (loaded.error)
            return staleOr({ok: false, kind: loaded.error.kind ?? 'error', message: `Google Code Assist discovery failed: ${loaded.error.message ?? 'network error'}`});
        if (loaded.status < 200 || loaded.status >= 300)
            return staleOr({ok: false, kind: 'error', message: `Google Code Assist discovery failed (HTTP ${loaded.status})`});
        let doc;
        try { doc = JSON.parse(text(loaded.bodyBytes)); } catch (e) {
            return staleOr({ok: false, kind: 'error', message: `Google Code Assist discovery response is invalid: ${e?.message ?? e}`});
        }
        projectId = projectFromLoad(doc);
        credits = creditsFromLoad(doc);
        const tier = doc?.currentTier?.name ?? doc?.paidTier?.name;
        if (typeof tier === 'string' && tier) plan = `Gemini Code Assist ${tier}`;
        if (!projectId)
            return staleOr({ok: false, kind: 'error', message: 'Google Code Assist did not return a project ID. Set it explicitly in provider settings.'});
    }

    const res = await post(deps, 'retrieveUserQuota', {project: projectId});
    if (res.error)
        return staleOr({ok: false, kind: res.error.kind ?? 'error', message: `Google quota request failed: ${res.error.message ?? 'network error'}`});
    if (res.status < 200 || res.status >= 300) {
        const message = res.status === 401 || res.status === 403
            ? 'Google authentication failed. Refresh the Gemini CLI login or OAuth access token.'
            : `Google quota request failed (HTTP ${res.status})`;
        deps.cache.markStale(); deps.cache.writeLastError(res.status, message);
        return staleOr({ok: false, kind: 'error', message});
    }
    try {
        const raw = JSON.parse(text(res.bodyBytes));
        const snapshot = parseUsage(JSON.stringify({...raw, projectId, plan, credits}));
        deps.cache.writePayload(snapshotToCacheJson(snapshot));
        return {ok: true, snapshot, stale: false, lastError: null, cacheAgeMs: 0};
    } catch (e) {
        return staleOr({ok: false, kind: 'error', message: e?.message ?? String(e)});
    }
}

export const fetchSnapshot = deps => withMutex(deps?.cache?.dir ?? 'google', () => doFetch(deps));
