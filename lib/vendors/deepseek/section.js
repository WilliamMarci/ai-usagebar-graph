import {severityColor} from '../../severity.js';
import {vformat} from '../../format.js';
import {httpErrorRow, footerRow} from '../section-common.js';
import {deepseekSeverity, formatMoney} from './parser.js';

const ICON_BALANCE = 'utilities-system-monitor-symbolic';
const ICON_AVAIL = 'emblem-ok-symbolic';

export function buildSection(snapshot, meta, now, theme, _ = (s) => s) {
    const rows = [];
    const cur = snapshot.currency;

    const balances = snapshot.balances?.length ? snapshot.balances : [snapshot];
    for (const balance of balances) {
        rows.push({
            kind: 'gauge',
            icon: ICON_BALANCE,
            title: balances.length > 1 ? vformat(_('%s balance'), balance.currency) : _('Balance'),
            pct: null, // no bar — DeepSeek is a raw balance, not a utilization %
            value: formatMoney(balance.balance, balance.currency),
            // Translators: %s are money amounts (granted credit, topped-up credit).
            subLine: vformat(_('granted %s · topped-up %s'),
                formatMoney(balance.granted, balance.currency), formatMoney(balance.toppedUp, balance.currency)),
            color: severityColor(deepseekSeverity({...snapshot, ...balance}), theme),
        });
    }

    rows.push({
        kind: 'text',
        icon: ICON_AVAIL,
        text: snapshot.isAvailable ? _('API available') : _('API unavailable'),
        tone: 'dim',
    });

    const err = httpErrorRow(meta, theme, _);
    if (err)
        rows.push(err);

    rows.push(footerRow(meta, _));

    // DeepSeek is a brand name — kept verbatim, not wrapped for translation.
    return {title: 'DeepSeek', plan: 'DeepSeek', rows};
}
