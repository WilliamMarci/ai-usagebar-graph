import {severityFor} from '../../severity.js';
import {format as formatCountdown} from '../../countdown.js';
import {fakeWindow} from '../fake.js';

export const ICON = '󰚩';
export const VENDOR_SHORT = 'oc';
export const ROLLING_MS = 5 * 3600 * 1000;
export const WEEKLY_MS = 7 * 86400 * 1000;
export const MONTHLY_MS = 30 * 86400 * 1000;

function pct(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function date(v) {
    if (!v)
        return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function window(value, windowMs) {
    const v = value && typeof value === 'object' ? value : {};
    return {
        utilizationPct: pct(v.percent ?? v.percentage ?? v.used_percent ?? v.usagePercent),
        resetsAt: date(v.resetsAt ?? v.resets_at ?? v.resetAt),
        windowMs,
        status: typeof v.status === 'string' ? v.status : 'ok',
    };
}

export function parseUsage(bytesOrText) {
    const text = bytesOrText instanceof Uint8Array ? new TextDecoder().decode(bytesOrText) : String(bytesOrText);
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj))
        throw new Error('OpenCode usage response is not an object');
    const usage = obj.usage && typeof obj.usage === 'object' ? obj.usage : obj;
    return {
        plan: 'OpenCode Go',
        session: window(usage.rolling ?? usage.rolling5h, ROLLING_MS),
        weekly: window(usage.weekly, WEEKLY_MS),
        monthly: window(usage.monthly, MONTHLY_MS),
    };
}

export function fakeSnapshot(p, now = new Date()) {
    return {plan: 'OpenCode Go (fake)', session: fakeWindow(p, ROLLING_MS, now), weekly: fakeWindow(p, WEEKLY_MS, now), monthly: fakeWindow(p, MONTHLY_MS, now)};
}

export function peakUsage(s) {
    const windows = [s.session, s.weekly, s.monthly];
    const best = windows.reduce((a, b) => b.utilizationPct > a.utilizationPct ? b : a, windows[0]);
    return {percent: best.utilizationPct, resetsAt: best.resetsAt};
}

export const severity = s => severityFor(peakUsage(s).percent);

export function placeholders(s, now) {
    const m = new Map([['icon', ICON], ['vendor_short', VENDOR_SHORT], ['plan', s.plan]]);
    for (const [name, w] of [['session', s.session], ['weekly', s.weekly], ['monthly', s.monthly]]) {
        m.set(`${name}_pct`, String(w.utilizationPct));
        m.set(`${name}_reset`, formatCountdown(w.resetsAt, now));
    }
    return m;
}

export const snapshotToCacheJson = s => JSON.stringify({usage: {
    rolling: {percent: s.session.utilizationPct, resetsAt: s.session.resetsAt, status: s.session.status},
    weekly: {percent: s.weekly.utilizationPct, resetsAt: s.weekly.resetsAt, status: s.weekly.status},
    monthly: {percent: s.monthly.utilizationPct, resetsAt: s.monthly.resetsAt, status: s.monthly.status},
}});
export const parseCacheJson = bytes => parseUsage(bytes);
