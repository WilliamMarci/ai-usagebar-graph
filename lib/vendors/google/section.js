import {format as formatCountdown} from '../../countdown.js';
import {fillColors} from '../../pace-fill.js';
import {httpErrorRow, footerRow} from '../section-common.js';

export function buildSection(snapshot, meta, now, theme, _ = s => s) {
    const rows = snapshot.buckets.map(bucket => {
        const {base} = fillColors(bucket.utilizationPct, 0, theme);
        const reset = formatCountdown(bucket.resetsAt, now, _);
        return {kind: 'window', icon: 'speedometer-symbolic', title: bucket.modelId,
            pct: bucket.utilizationPct, color: base, reset,
            subtitle: bucket.resetsAt ? `${_('Resets in')} ${reset}` : bucket.tokenType,
            paceGlyph: '', elapsedPct: 0, paceColor: base};
    });
    if (snapshot.credits !== null)
        rows.push({kind: 'text', icon: 'emblem-money-symbolic',
            text: `${_('AI credits remaining')}: ${snapshot.credits}`, tone: 'dim'});
    const err = httpErrorRow(meta, theme, _); if (err) rows.push(err);
    rows.push(footerRow(meta, _));
    return {title: 'Google Gemini', plan: snapshot.plan, rows};
}
