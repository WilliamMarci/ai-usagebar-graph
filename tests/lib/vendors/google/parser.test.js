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
});

system.exit(summary());
