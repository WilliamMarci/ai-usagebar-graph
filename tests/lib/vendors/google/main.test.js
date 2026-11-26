import GLib from 'gi://GLib';
import system from 'system';

import {fetchSnapshot, CODE_ASSIST_ENDPOINT} from '../../../../lib/vendors/google/main.js';
import {describe, it, assertEqual, summary} from '../../../_assert.js';

function runSync(promise) {
    const loop = GLib.MainLoop.new(null, false);
    let value, error, done = false;
    Promise.resolve(promise).then(v => { value = v; done = true; loop.quit(); },
        e => { error = e; done = true; loop.quit(); });
    if (!done) loop.run();
    if (error) throw error;
    return value;
}

const response = (status, body) => ({status, error: null,
    bodyBytes: new TextEncoder().encode(JSON.stringify(body))});
const cache = () => ({dir: `google-test-${Date.now()}-${Math.random()}`,
    freshPayload: async () => null, payloadAgeMs: async () => null,
    writePayload(value) { this.payload = value; }, markStale() {}, writeLastError() {}});

describe('Google Code Assist quota fetch', () => {
    it('posts the configured project to retrieveUserQuota', () => {
        const calls = [];
        const http = opts => { calls.push(opts); return Promise.resolve(response(200, {buckets: [
            {modelId: 'gemini-pro', remainingFraction: 0.8},
        ]})); };
        const result = runSync(fetchSnapshot({cache: cache(), http, accessToken: 'token', projectId: 'my-project'}));
        assertEqual(result.ok, true);
        assertEqual(calls.length, 1);
        assertEqual(calls[0].url, `${CODE_ASSIST_ENDPOINT}/v1internal:retrieveUserQuota`);
        assertEqual(calls[0].headers.Authorization, 'Bearer token');
        assertEqual(JSON.parse(calls[0].body).project, 'my-project');
    });

    it('discovers the project and preserves AI credits', () => {
        const calls = [];
        const http = opts => {
            calls.push(opts);
            if (calls.length === 1)
                return Promise.resolve(response(200, {cloudaicompanionProject: 'auto-project',
                    currentTier: {name: 'free-tier'}, paidTier: {availableCredits: {creditAmount: 12}}}));
            return Promise.resolve(response(200, {buckets: [{modelId: 'gemini-flash', remainingFraction: 0.5}]}));
        };
        const result = runSync(fetchSnapshot({cache: cache(), http, accessToken: 'token'}));
        assertEqual(result.ok, true);
        assertEqual(calls[0].url, `${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`);
        assertEqual(JSON.parse(calls[1].body).project, 'auto-project');
        assertEqual(result.snapshot.credits, 12);
        assertEqual(result.snapshot.plan, 'Gemini Code Assist free-tier');
    });
});

system.exit(summary());
