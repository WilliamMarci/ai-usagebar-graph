import GLib from 'gi://GLib';
import {readApiKey} from '../../oauth/opencode.js';
import {fetchSnapshot} from './main.js';
import {ICON, VENDOR_SHORT, placeholders, severity, peakUsage, fakeSnapshot, parseTokscaleUsage} from './parser.js';
import {buildSection} from './section.js';
import {loadSubscriptionUsage} from '../../tokscale.js';

export const opencodeAdapter = {
    id: 'opencode', cacheId: 'opencode', icon: ICON, vendorShort: VENDOR_SHORT,
    async fetchSnapshot(ctx) {
        const cfg = ctx.config.vendors.opencode;
        try {
            const row = await loadSubscriptionUsage('OpenCode Go', ctx.signal);
            return {ok: true, snapshot: parseTokscaleUsage(row), stale: false, lastError: null, cacheAgeMs: 0};
        } catch (_) {
            // TokScale absent or unable to fetch: fall back to the direct endpoint.
        }
        let apiKey = cfg.apiKey;
        if (cfg.apiKeyEnv)
            apiKey = GLib.getenv(cfg.apiKeyEnv) || apiKey;
        if (!apiKey) {
            try { apiKey = await readApiKey(); } catch (e) { return {ok: false, kind: 'error', message: e?.message ?? String(e)}; }
        }
        return fetchSnapshot({cache: ctx.cache, http: ctx.http, apiKey, baseUrl: cfg.baseUrl, signal: ctx.signal});
    },
    severity, peakUsage, placeholders, buildSection, fakeSnapshot,
};
