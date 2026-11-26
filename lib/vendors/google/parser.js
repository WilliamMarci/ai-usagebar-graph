import {severityFor} from '../../severity.js';
import {format as formatCountdown} from '../../countdown.js';

export const ICON = '󰊭';
export const VENDOR_SHORT = 'G';

const clampPct = value => Math.max(0, Math.min(100, Math.round(value)));

function resetDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function quotaBucket(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.modelId !== 'string')
        return null;
    const remaining = Number(raw.remainingFraction);
    if (!Number.isFinite(remaining))
        return null;
    return {
        modelId: raw.modelId,
        tokenType: typeof raw.tokenType === 'string' ? raw.tokenType : 'REQUESTS',
        utilizationPct: clampPct((1 - Math.max(0, Math.min(1, remaining))) * 100),
        resetsAt: resetDate(raw.resetTime),
    };
}

function select(buckets, needle, excluded = null) {
    return buckets.find(b => b !== excluded && b.modelId.toLowerCase().includes(needle)) ??
        buckets.find(b => b !== excluded) ?? excluded;
}

export function parseUsage(bytesOrText) {
    const text = bytesOrText instanceof Uint8Array ? new TextDecoder().decode(bytesOrText) : String(bytesOrText);
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error(`Google quota response is not valid JSON: ${e?.message ?? e}`); }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.buckets))
        throw new Error('Google quota response is missing buckets');
    const buckets = obj.buckets.map(quotaBucket).filter(Boolean)
        .sort((a, b) => b.utilizationPct - a.utilizationPct);
    if (!buckets.length)
        throw new Error('Google quota response contains no supported model buckets');
    const primary = select(buckets, 'pro');
    const secondary = select(buckets, 'flash', primary);
    return {
        plan: typeof obj.plan === 'string' && obj.plan ? obj.plan : 'Gemini Code Assist',
        projectId: typeof obj.projectId === 'string' ? obj.projectId : '',
        credits: obj.credits ?? null,
        buckets,
        session: primary,
        weekly: secondary,
    };
}

export function peakUsage(s) {
    const bucket = s.buckets.reduce((a, b) => b.utilizationPct > a.utilizationPct ? b : a, s.buckets[0]);
    return {percent: bucket.utilizationPct, resetsAt: bucket.resetsAt};
}

export const severity = s => severityFor(peakUsage(s).percent);

export function placeholders(s, now) {
    const m = new Map([
        ['icon', ICON], ['vendor_short', VENDOR_SHORT], ['plan', s.plan],
        ['session_pct', String(s.session.utilizationPct)],
        ['session_reset', formatCountdown(s.session.resetsAt, now)],
        ['weekly_pct', String(s.weekly.utilizationPct)],
        ['weekly_reset', formatCountdown(s.weekly.resetsAt, now)],
        ['google_primary_model', s.session.modelId],
        ['google_secondary_model', s.weekly.modelId],
        ['google_credits', s.credits === null ? '' : String(s.credits)],
    ]);
    return m;
}

export function fakeSnapshot(p, now = new Date()) {
    const utilizationPct = clampPct(p);
    const make = (modelId, hours) => ({modelId, tokenType: 'REQUESTS', utilizationPct,
        resetsAt: new Date(now.getTime() + hours * 3600_000)});
    const session = make('gemini-pro (fake)', 5);
    const weekly = make('gemini-flash (fake)', 24);
    return {plan: 'Gemini Code Assist (fake)', projectId: '', credits: null,
        buckets: [session, weekly], session, weekly};
}

export const snapshotToCacheJson = s => JSON.stringify({
    plan: s.plan, projectId: s.projectId, credits: s.credits,
    buckets: s.buckets.map(b => ({modelId: b.modelId, tokenType: b.tokenType,
        remainingFraction: 1 - b.utilizationPct / 100, resetTime: b.resetsAt?.toISOString() ?? null})),
});

export const parseCacheJson = parseUsage;
