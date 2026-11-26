import system from 'system';

import {parseUsage, peakUsage, placeholders} from '../../../../lib/vendors/google/parser.js';
import {describe, it, assertEqual, summary} from '../../../_assert.js';

const LIVE = JSON.stringify({projectId: 'project-1', plan: 'Gemini Code Assist free-tier', credits: 42, buckets: [
    {modelId: 'gemini-3.1-pro-preview', tokenType: 'REQUESTS', remainingFraction: 0.25, resetTime: '2026-11-27T00:00:00Z'},
    {modelId: 'gemini-3-flash-preview', tokenType: 'REQUESTS', remainingFraction: 1},
]});

describe('Google Code Assist quota parser', () => {
    it('turns remaining fractions into used percentages', () => {
        const s = parseUsage(LIVE);
        assertEqual(s.session.modelId, 'gemini-3.1-pro-preview');
        assertEqual(s.session.utilizationPct, 75);
        assertEqual(s.weekly.modelId, 'gemini-3-flash-preview');
        assertEqual(s.weekly.utilizationPct, 0);
        assertEqual(s.credits, 42);
    });
    it('does not require remainingAmount at 100 percent remaining', () =>
        assertEqual(parseUsage(LIVE).weekly.utilizationPct, 0));
    it('exports shared and Google-specific placeholders', () => {
        const m = placeholders(parseUsage(LIVE), new Date('2026-11-26T00:00:00Z'));
        assertEqual(m.get('session_pct'), '75');
        assertEqual(m.get('google_primary_model'), 'gemini-3.1-pro-preview');
        assertEqual(m.get('google_credits'), '42');
    });
    it('uses the most consumed bucket for severity', () =>
        assertEqual(peakUsage(parseUsage(LIVE)).percent, 75));
    it('maps Antigravity 5h and weekly summary buckets to shared sources', () => {
        const s = parseUsage(JSON.stringify({buckets: [
            {bucketId: 'flash-weekly', displayName: 'Flash weekly', window: '604800s', remainingFraction: 0.6},
            {bucketId: 'all-5h', displayName: 'All models 5h', window: {seconds: 18000}, remainingFraction: 0.2},
        ]}));
        assertEqual(s.session.modelId, 'All models 5h');
        assertEqual(s.session.utilizationPct, 80);
        assertEqual(s.weekly.modelId, 'Flash weekly');
        assertEqual(s.weekly.utilizationPct, 40);
    });
});

system.exit(summary());
