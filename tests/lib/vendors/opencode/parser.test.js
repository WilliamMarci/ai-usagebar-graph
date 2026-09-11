import system from 'system';

import {parseUsage, peakUsage, placeholders} from '../../../../lib/vendors/opencode/parser.js';
import {describe, it, assertEqual, summary} from '../../../_assert.js';

const LIVE = JSON.stringify({usage: {
    rolling: {status: 'ok', percent: 12, resetsAt: '2026-09-11T12:00:00Z'},
    weekly: {status: 'ok', percent: 34, resetsAt: '2026-09-15T12:00:00Z'},
    monthly: {status: 'rate-limited', percent: 100, resetsAt: '2026-10-01T00:00:00Z'},
}});

describe('parseUsage (OpenCode Go official API)', () => {
    it('parses all official quota windows', () => {
        const s = parseUsage(LIVE);
        assertEqual(s.plan, 'OpenCode Go');
        assertEqual(s.session.utilizationPct, 12);
        assertEqual(s.weekly.utilizationPct, 34);
        assertEqual(s.monthly.utilizationPct, 100);
        assertEqual(s.monthly.status, 'rate-limited');
    });

    it('rejects a Zen/non-usage response', () => {
        let message = '';
        try { parseUsage('{"balance":10}'); } catch (error) { message = error.message; }
        assertEqual(message, 'OpenCode Go usage response is missing rolling, weekly, or monthly data');
    });

    it('uses the highest window for severity and placeholders', () => {
        const s = parseUsage(LIVE);
        assertEqual(peakUsage(s).percent, 100);
        assertEqual(placeholders(s, new Date()).get('plan'), 'OpenCode Go');
    });
});

system.exit(summary());
