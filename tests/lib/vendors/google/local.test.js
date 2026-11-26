import GLib from 'gi://GLib';
import system from 'system';

import {fetchLocalSnapshot, QUOTA_RPC} from '../../../../lib/vendors/google/local.js';
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

const body = value => new TextEncoder().encode(JSON.stringify(value));

describe('Antigravity local quota fetch', () => {
    it('skips stale hubs and uses the live CSRF-protected server', () => {
        const calls = [];
        const http = opts => {
            calls.push(opts);
            if (calls.length === 1) return Promise.resolve({status: 0, error: {kind: 'transport'}});
            return Promise.resolve({status: 200, error: null, bodyBytes: body({response: {groups: [{
                displayName: 'Gemini models', buckets: [
                    {displayName: 'Weekly', window: '604800s', remainingFraction: 0.96, resetTime: '2026-12-03T00:00:00Z'},
                    {displayName: 'Five hour', window: '18000s', remainingFraction: 0.9, resetTime: '2026-11-27T00:00:00Z'},
                ],
            }]}})});
        };
        const cache = {writePayload(value) { this.value = value; }};
        const result = runSync(fetchLocalSnapshot({cache, http, descriptors: [
            {port: 1001, csrfToken: 'old'}, {port: 1002, csrfToken: 'live'},
        ]}));
        assertEqual(result.ok, true);
        assertEqual(calls[1].url, `http://127.0.0.1:1002/${QUOTA_RPC}`);
        assertEqual(calls[1].headers['X-Codeium-Csrf-Token'], 'live');
        assertEqual(result.snapshot.session.utilizationPct, 10);
        assertEqual(result.snapshot.weekly.utilizationPct, 4);
    });
});

system.exit(summary());
