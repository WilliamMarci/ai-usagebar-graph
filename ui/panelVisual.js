import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {severityFor, severityColor} from '../lib/severity.js';

const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));
function rgba(hex, alpha = 1) {
    const s = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex.slice(1) : '2ec27e';
    return [0, 2, 4].map(i => Number.parseInt(s.slice(i, i + 2), 16) / 255).concat(alpha);
}
function setColor(cr, color) { cr.setSourceRGBA(...color); }
function roundedRect(cr, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    cr.newSubPath(); cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); cr.closePath();
}

const BlockArea = GObject.registerClass(class BlockArea extends St.DrawingArea {
    _init(item, values, config, theme, heatmap) {
        let width = item.size, height = item.size;
        if (item.type === 'bar') {
            const span = item.layers.reduce((sum, layer) => sum + Math.max(2, Math.min(layer.thickness + 1, 6)), 0)
                + Math.max(0, item.layers.length - 1) * (item.layerGap ?? 2);
            width = item.orientation === 'vertical' ? Math.max(10, span) : item.length;
            height = item.orientation === 'vertical' ? item.size : Math.max(8, span);
        } else if (item.type === 'heatmap') {
            width = item.width; height = 20;
        }
        super._init({width, height, y_align: Clutter.ActorAlign.CENTER});
        this._item = item; this._values = values; this._config = config; this._theme = theme; this._heatmap = heatmap;
        this.connect('repaint', () => this._paint());
    }
    _paint() {
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        if (this._item.type === 'ring') this._ring(cr, w, h);
        else if (this._item.type === 'bar') this._bar(cr, w, h);
        else this._drawHeatmap(cr, w);
        cr.$dispose();
    }
    _layerColor(layer) {
        const raw = this._values.get(layer.vendor, layer.source);
        if (!layer.tiered)
            return layer.color;
        // `raw` is always the consumed/elapsed percentage. This makes colour
        // tiers automatically inverse when the visible fill uses Remaining:
        // 90% used and 10% remaining both resolve to Critical.
        const severity = severityFor(raw);
        return layer.tierColors?.[severity] || severityColor(severity, this._theme);
    }
    _fraction(layer) {
        const value = this._values.get(layer.vendor, layer.source);
        return layer.mode === 'used' ? value : 100 - value;
    }
    _ring(cr, w, h) {
        const layers = this._item.layers;
        const cx = w / 2, cy = h / 2;
        let radius = Math.min(w, h) / 2 - 2;
        layers.forEach((layer, i) => {
            if (radius <= 1) return;
            const thickness = Math.min(layer.thickness, Math.max(1, radius));
            cr.setLineWidth(thickness); cr.setLineCap(1);
            setColor(cr, rgba(this._config.trackColor ?? '#77767b', .35));
            cr.arc(cx, cy, radius, 0, Math.PI * 2); cr.stroke();
            setColor(cr, rgba(this._layerColor(layer)));
            const end = -Math.PI / 2 + Math.PI * 2 * clamp(this._fraction(layer)) / 100;
            cr.arc(cx, cy, radius, -Math.PI / 2, end); cr.stroke();
            if (layer.markerEnabled) {
                setColor(cr, rgba(layer.markerColor || this._layerColor(layer)));
                cr.arc(cx + radius * Math.cos(end), cy + radius * Math.sin(end), thickness / 2, 0, Math.PI * 2);
                cr.fill();
            }
            radius -= thickness / 2 + (this._item.layerGap ?? .5) + (layers[i + 1]?.thickness ?? 0) / 2;
        });
    }
    _bar(cr, w, h) {
        const vertical = this._item.orientation === 'vertical', gap = this._item.layerGap ?? 2;
        this._item.layers.forEach((layer, i) => {
            const fraction = clamp(this._fraction(layer)) / 100;
            const thickness = Math.max(2, Math.min(layer.thickness + 1, 6));
            setColor(cr, rgba(this._config.trackColor ?? '#77767b', .35));
            if (vertical) {
                const x = i * (thickness + gap);
                roundedRect(cr, x, 0, thickness, h, thickness / 2); cr.fill();
                if (fraction > 0) {
                    setColor(cr, rgba(this._layerColor(layer)));
                    roundedRect(cr, x, h * (1 - fraction), thickness, h * fraction, thickness / 2); cr.fill();
                }
            } else {
                const y = i * (thickness + gap);
                roundedRect(cr, 0, y, w, thickness, thickness / 2); cr.fill();
                if (fraction > 0) {
                    setColor(cr, rgba(this._layerColor(layer)));
                    roundedRect(cr, 0, y, w * fraction, thickness, thickness / 2); cr.fill();
                }
            }
        });
    }
    _drawHeatmap(cr, w) {
        const cells = this._heatmap.slice(-84), base = rgba(this._config.heatmapColor ?? '#2ec27e');
        const cellW = Math.max(2, Math.floor((w - 11) / 12));
        for (let i = 0; i < 84; i++) {
            const col = Math.floor(i / 7), row = i % 7, level = cells[i]?.intensity ?? 0;
            const color = level === 0 ? rgba(this._config.trackColor ?? '#77767b', .2)
                : [base[0], base[1], base[2], .2 + .2 * Math.min(4, level)];
            setColor(cr, color); cr.rectangle(col * (cellW + 1), row * 3, cellW, 2); cr.fill();
        }
    }
});

function pct(p, key) { return clamp(Number.parseFloat(p.get(key) ?? '0')); }
function resetUsed(win, fallbackMs, now) {
    const reset = win?.resetsAt ?? win?.resetAt;
    const t = reset instanceof Date ? reset.getTime() : Number.NaN;
    return Number.isFinite(t) ? clamp(100 - (t - now.getTime()) * 100 / (win?.windowMs ?? fallbackMs)) : 100;
}
function valuesFor(adapter, snapshot, now) {
    const p = adapter.placeholders(snapshot, now), session = snapshot.session ?? snapshot.window;
    const values = new Map([
        ['session', pct(p, 'session_pct')], ['weekly', pct(p, 'weekly_pct')], ['monthly', pct(p, 'monthly_pct')],
        ['session_reset', resetUsed(session, 5 * 3600e3, now)],
        ['weekly_reset', resetUsed(snapshot.weekly, 7 * 86400e3, now)],
        ['monthly_reset', resetUsed(snapshot.monthly, 30 * 86400e3, now)],
    ]);
    values.set('peak', Math.max(values.get('session'), values.get('weekly'), values.get('monthly')));
    values.set('session_reset_at', (session?.resetsAt ?? session?.resetAt)?.getTime?.() ?? 0);
    values.set('weekly_reset_at', (snapshot.weekly?.resetsAt ?? snapshot.weekly?.resetAt)?.getTime?.() ?? 0);
    values.set('monthly_reset_at', (snapshot.monthly?.resetsAt ?? snapshot.monthly?.resetAt)?.getTime?.() ?? 0);
    return {placeholders: p, values};
}
function valueFor(data, vendor, source, mode) {
    const value = data.get(vendor, source);
    return Math.round(mode === 'used' ? value : 100 - value);
}
function templateValues(placeholders, values) {
    const derived = new Map(placeholders);
    for (const vendor of ['active', 'anthropic', 'openai', 'zai', 'openrouter', 'deepseek', 'kimi', 'opencode']) {
        for (const source of ['session', 'weekly', 'monthly', 'session_reset', 'weekly_reset', 'monthly_reset', 'peak']) {
            const prefix = vendor === 'active' ? source : `${vendor}_${source}`;
            derived.set(`${prefix}_used`, String(valueFor(values, vendor, source, 'used')));
            derived.set(`${prefix}_remaining`, String(valueFor(values, vendor, source, 'remaining')));
        }
    }
    for (const [alias, source] of [['5h', 'session'], ['1w', 'weekly'], ['1m', 'monthly']]) {
        derived.set(`${alias}_quota`, derived.get(`${source}_remaining`));
        derived.set(`${alias}_quote`, derived.get(`${source}_remaining`));
        derived.set(`${alias}_used`, derived.get(`${source}_used`));
        derived.set(`${alias}_remaining`, derived.get(`${source}_remaining`));
    }
    return derived;
}
function renderTemplate(template, fields) {
    return String(template ?? '').replace(/\{([a-zA-Z0-9_]+)\}/g,
        (match, key) => fields.has(key) ? fields.get(key) : match);
}
function textBlock(item, placeholders, values) {
    const derived = templateValues(placeholders, values);
    const render = template => renderTemplate(template, derived);
    const box = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'aiusagebar-text-stack'});
    const top = new St.Label({text: render(item.template)});
    top.set_style(`font-size: ${item.fontSize}px;${item.color ? ` color: ${item.color};` : ''}`);
    box.add_child(top);
    if (item.secondaryTemplate) {
        const bottom = new St.Label({text: render(item.secondaryTemplate)});
        bottom.set_style(`font-size: ${item.secondaryFontSize}px;${item.color ? ` color: ${item.color};` : ''}`);
        box.add_child(bottom);
    }
    return box;
}
function formatRemainingTime(resetAt, now, template) {
    if (!(Number(resetAt) > 0))
        return '—';
    const total = Math.max(0, Math.floor((resetAt - now.getTime()) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    const compact = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}m${String(s).padStart(2, '0')}`;
    return (template || '{compact}')
        .replaceAll('{h}', String(h))
        .replaceAll('{hh}', String(h).padStart(2, '0'))
        .replaceAll('{m}', String(m))
        .replaceAll('{mm}', String(m).padStart(2, '0'))
        .replaceAll('{s}', String(s))
        .replaceAll('{ss}', String(s).padStart(2, '0'))
        .replaceAll('{compact}', compact);
}
function ringBlock(item, placeholders, values, config, theme, heatmap, now) {
    if (!item.center?.enabled)
        return new BlockArea(item, values, config, theme, heatmap);
    const overlay = new St.Widget({layout_manager: new Clutter.BinLayout(), width: item.size, height: item.size});
    overlay.add_child(new BlockArea(item, values, config, theme, heatmap));
    const isTime = item.center.source.endsWith('_reset');
    const resetAt = isTime ? values.get(item.center.vendor, `${item.center.source}_at`) : 0;
    const value = isTime
        ? formatRemainingTime(resetAt, now, item.center.timeFormat)
        : String(valueFor(values, item.center.vendor, item.center.source, item.center.mode));
    const fields = templateValues(placeholders, values);
    fields.set('value', value);
    const text = item.center.template ? renderTemplate(item.center.template, fields) : value;
    const label = new St.Label({text,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    label.set_style(`font-size: ${item.center.fontSize}px; font-family: monospace; font-weight: 600;`);
    overlay.add_child(label);
    return overlay;
}
function barBlock(item, values, config, theme, heatmap) {
    const vertical = item.orientation === 'vertical';
    const box = new St.BoxLayout({vertical: !vertical, y_align: Clutter.ActorAlign.CENTER,
        style: `spacing: ${Math.max(0, item.layerGap ?? 0)}px;`});
    for (const layer of item.layers) {
        const line = new St.BoxLayout({vertical, y_align: Clutter.ActorAlign.CENTER, style: 'spacing: 2px;'});
        const label = layer.label ? new St.Label({
            text: layer.label.replace('{value}', String(valueFor(values, layer.vendor, layer.source, layer.mode))),
            y_align: Clutter.ActorAlign.CENTER,
        }) : null;
        if (label)
            label.set_style(`font-size: ${layer.labelFontSize}px;`);
        if (label && layer.labelPosition === 'start') line.add_child(label);
        line.add_child(new BlockArea({...item, layers: [layer], layerGap: 0}, values, config, theme, heatmap));
        if (label && layer.labelPosition !== 'start') line.add_child(label);
        box.add_child(line);
    }
    return box;
}
function timerBlock(item, values, now) {
    const source = item.source.endsWith('_reset') ? item.source : `${item.source}_reset`;
    const resetAt = item.timerMode === 'pomodoro'
        ? item.startedAt + item.durationMinutes * 60_000
        : values.get(item.vendor, `${source}_at`);
    const seconds = Math.max(0, Math.floor((resetAt - now.getTime()) / 1000));
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), secs = seconds % 60;
    const time = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
    const label = new St.Label({text: `${item.prefix}${time}`, y_align: Clutter.ActorAlign.CENTER});
    label.set_style(`font-size: ${item.fontSize}px; font-family: monospace; font-variant-numeric: tabular-nums;`);
    return label;
}
export function makePanelVisual(adapter, snapshot, now, config, theme, heatmap = [], vendorSnapshots = new Map()) {
    const active = valuesFor(adapter, snapshot, now), perVendor = new Map([['active', active]]);
    for (const [id, entry] of vendorSnapshots) {
        if (entry?.snapshot)
            perVendor.set(id, valuesFor(entry.adapter, entry.snapshot, now));
    }
    const values = {get(vendor, source) {
        const set = vendor === 'active' ? active : perVendor.get(vendor);
        return set?.values.get(source) ?? 0;
    }};
    const calendar = calendarCells(heatmap, now, config.heatmapWeekStart);
    const box = new St.BoxLayout({style_class: 'aiusagebar-panel-visual', y_align: Clutter.ActorAlign.CENTER});
    const items = config.customEnabled ? config.items : legacyItems(config);
    for (const item of items) {
        if (item.type === 'text') box.add_child(textBlock(item, active.placeholders, values));
        else if (item.type === 'ring') box.add_child(ringBlock(item, active.placeholders, values, config, theme, calendar, now));
        else if (item.type === 'timer') box.add_child(timerBlock(item, values, now));
        else if (item.type === 'bar') box.add_child(barBlock(item, values, config, theme, calendar));
        else box.add_child(new BlockArea(item, values, config, theme, calendar));
    }
    return box;
}
function legacyItems(config) {
    const layer = (source, mode = 'remaining', tiered = true) =>
        ({vendor: 'active', source, mode, color: '#2ec27e', tiered, tierColors: {}, thickness: 2});
    if (config.mode === 'heatmap')
        return [{id: 'heatmap', type: 'heatmap', width: 48}];
    if (config.mode === 'bars')
        return [{id: 'bars', type: 'bar', orientation: config.orientation, length: 36, size: 20,
            layers: [layer('session'), layer('weekly')]}];
    return [
        {id: 'quota', type: 'ring', size: 24, layerGap: .5,
            center: {enabled: true, vendor: 'active', source: config.centerQuota === 'weekly' ? 'weekly' : 'session',
                mode: 'remaining', fontSize: 8, template: '', timeFormat: '{compact}'},
            layers: [layer('session'), layer('weekly')]},
        ...(config.showResetRings ? [{id: 'reset', type: 'ring', size: 24, layerGap: .5, center: {enabled: false},
            layers: [layer('session_reset', 'remaining', false), layer('weekly_reset', 'remaining', false)]}] : []),
    ];
}
function calendarCells(contributions, now, weekStart = 'monday') {
    const byDate = new Map(contributions.map(x => [x.date, x])), cells = [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDay = weekStart === 'sunday' ? 0 : 1;
    const weekday = (today.getDay() - firstDay + 7) % 7;
    const end = new Date(today); end.setDate(end.getDate() + 6 - weekday);
    for (let offset = 83; offset >= 0; offset--) {
        const d = new Date(end); d.setDate(d.getDate() - offset);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        cells.push(d > today ? {date: key, intensity: 0} : (byDate.get(key) ?? {date: key, intensity: 0}));
    }
    return cells;
}
