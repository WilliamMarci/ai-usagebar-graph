import GLib from 'gi://GLib';

import {defaultCredentialsPath, readAccessToken, readAntigravityAccessToken} from '../../oauth/google.js';
import {fetchSnapshot} from './main.js';
import {ICON, VENDOR_SHORT, placeholders, severity, peakUsage, fakeSnapshot} from './parser.js';
import {buildSection} from './section.js';

export const googleAdapter = {
    id: 'google', cacheId: 'google', icon: ICON, vendorShort: VENDOR_SHORT,
    async fetchSnapshot(ctx) {
        const cfg = ctx.config.vendors.google;
        let accessToken = cfg.accessTokenEnv ? GLib.getenv(cfg.accessTokenEnv) : '';
        if (!accessToken) {
            accessToken = await readAntigravityAccessToken();
        }
        if (!accessToken) {
            try { accessToken = await readAccessToken(cfg.credentialsPath ?? defaultCredentialsPath(), ctx.now?.getTime?.() ?? Date.now()); }
            catch (_) { return {ok: false, kind: 'error', message: 'No Google OAuth token is available. Sign in with Antigravity CLI, or set the configured OAuth access-token environment variable.'}; }
        }
        return fetchSnapshot({cache: ctx.cache, http: ctx.http, accessToken: accessToken.trim(),
            projectId: cfg.projectId, signal: ctx.signal});
    },
    severity, peakUsage, placeholders, buildSection, fakeSnapshot,
};
