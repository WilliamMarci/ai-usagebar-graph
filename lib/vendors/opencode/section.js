import {fillColors} from '../../pace-fill.js';
import {format as countdown} from '../../countdown.js';
import {httpErrorRow, footerRow} from '../section-common.js';

export function buildSection(snapshot, meta, now, theme, _ = s => s) {
    const rows = [];
    for (const [title, icon, w] of [
        [_('Rolling 5h'), 'alarm-symbolic', snapshot.session],
        [_('Weekly'), 'x-office-calendar-symbolic', snapshot.weekly],
        [_('Monthly'), 'office-calendar-symbolic', snapshot.monthly],
    ]) {
        rows.push({kind: 'window', icon, title, pct: w.utilizationPct, color: fillColors(w.utilizationPct, 0, theme).base,
            reset: countdown(w.resetsAt, now, _), subtitle: w.status, paceGlyph: '', elapsedPct: null, paceColor: null});
    }
    const err = httpErrorRow(meta, theme, _); if (err) rows.push(err);
    rows.push(footerRow(meta, _));
    return {title: snapshot.plan, plan: snapshot.plan, rows};
}
