import GLib from 'gi://GLib';

import {resolveApiKey} from '../../config-resolve.js';
import {fetchSnapshot} from './main.js';
import {
    ICON,
    VENDOR_SHORT,
    placeholders,
    deepseekSeverity,
    deepseekPeakUsage,
    fakeSnapshot,
} from './parser.js';
import {buildSection} from './section.js';
import {loadSubscriptionUsage} from '../../tokscale.js';
import {parseTokscaleUsage, severity as openCodeSeverity, peakUsage as openCodePeak,
    placeholders as openCodePlaceholders} from '../opencode/parser.js';
import {buildSection as buildOpenCodeSection} from '../opencode/section.js';

export const deepseekAdapter = {
    id: 'deepseek',
    cacheId: 'deepseek',
    icon: ICON,
    vendorShort: VENDOR_SHORT,
    async fetchSnapshot(ctx) {
        const cfg = ctx.config.vendors.deepseek;
        if (cfg.source === 'opencode') {
            try {
                const snapshot = parseTokscaleUsage(await loadSubscriptionUsage('OpenCode Go', ctx.signal));
                snapshot.viaOpenCode = true;
                snapshot.plan = 'DeepSeek via OpenCode Go';
                return {ok: true, snapshot, stale: false, lastError: null, cacheAgeMs: 0};
            } catch (e) {
                return {ok: false, kind: 'error', message: e?.message ?? String(e)};
            }
        }
        let apiKey;
        try {
            apiKey = resolveApiKey('DeepSeek', cfg.apiKeyEnv, cfg.apiKey, GLib.getenv);
        } catch (e) {
            return {ok: false, kind: 'error', message: e?.message ?? String(e)};
        }
        return fetchSnapshot({cache: ctx.cache, http: ctx.http, apiKey, signal: ctx.signal});
    },
    severity: snapshot => snapshot.viaOpenCode ? openCodeSeverity(snapshot) : deepseekSeverity(snapshot),
    peakUsage: snapshot => snapshot.viaOpenCode ? openCodePeak(snapshot) : deepseekPeakUsage(snapshot),
    placeholders(snapshot, now) {
        if (!snapshot.viaOpenCode)
            return placeholders(snapshot, now);
        const map = openCodePlaceholders(snapshot, now);
        map.set('vendor_short', VENDOR_SHORT);
        map.set('plan', snapshot.plan);
        return map;
    },
    buildSection(snapshot, ...args) {
        return snapshot.viaOpenCode ? buildOpenCodeSection(snapshot, ...args) : buildSection(snapshot, ...args);
    },
    fakeSnapshot,
};
