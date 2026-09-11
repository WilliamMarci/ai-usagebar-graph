import GLib from 'gi://GLib';
import {readApiKey} from '../../oauth/opencode.js';
import {fetchSnapshot} from './main.js';
import {ICON, VENDOR_SHORT, placeholders, severity, peakUsage, fakeSnapshot} from './parser.js';
import {buildSection} from './section.js';

export const opencodeAdapter = {
    id: 'opencode', cacheId: 'opencode', icon: ICON, vendorShort: VENDOR_SHORT,
    async fetchSnapshot(ctx) {
        const cfg = ctx.config.vendors.opencode;
        if (cfg.plan === 'zen')
            return {ok: false, kind: 'unsupported', message: 'OpenCode Zen does not expose an API-key usage or balance endpoint'};
        let apiKey = cfg.apiKey;
        if (cfg.apiKeyEnv)
            apiKey = GLib.getenv(cfg.apiKeyEnv) || apiKey;
        if (!apiKey) {
            try { apiKey = await readApiKey(); } catch (e) { return {ok: false, kind: 'error', message: e?.message ?? String(e)}; }
        }
        return fetchSnapshot({cache: ctx.cache, http: ctx.http, apiKey: apiKey.trim(), baseUrl: cfg.baseUrl, signal: ctx.signal});
    },
    severity, peakUsage, placeholders, buildSection, fakeSnapshot,
};
