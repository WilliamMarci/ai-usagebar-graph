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

const BlockArea = GObject.registerClass(class BlockArea extends St.DrawingArea {
    _init(item, values, config, theme, heatmap) {
        let width = item.size, height = item.size;
        if (item.type === 'bar') {
            width = item.orientation === 'vertical' ? Math.max(10, item.layers.length * 6) : item.length;
            height = item.orientation === 'vertical' ? item.size : Math.max(8, item.layers.length * 6);
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
        const used = layer.source.endsWith('_reset') ? 100 - raw : raw;
        if (!layer.tiered)
            return layer.color;
        const severity = severityFor(used);
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
            cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(this._fraction(layer)) / 100); cr.stroke();
            radius -= thickness / 2 + (this._item.layerGap ?? .5) + (layers[i + 1]?.thickness ?? 0) / 2;
        });
    }
    _bar(cr, w, h) {
        const vertical = this._item.orientation === 'vertical', gap = 2;
        this._item.layers.forEach((layer, i) => {
            const fraction = clamp(this._fraction(layer)) / 100;
            const thickness = Math.max(2, Math.min(layer.thickness + 1, 6));
            setColor(cr, rgba(this._config.trackColor ?? '#77767b', .35));
            if (vertical) {
                const x = i * (thickness + gap);
                cr.rectangle(x, 0, thickness, h); cr.fill();
                setColor(cr, rgba(this._layerColor(layer))); cr.rectangle(x, h * (1 - fraction), thickness, h * fraction); cr.fill();
            } else {
                const y = i * (thickness + gap);
                cr.rectangle(0, y, w, thickness); cr.fill();
                setColor(cr, rgba(this._layerColor(layer))); cr.rectangle(0, y, w * fraction, thickness); cr.fill();
            }
        });
    }
    _drawHeatmap(cr, w) {
        const cells = this._heatmap.slice(-84), base = rgba(this._config.heatmapColor ?? '#2ec27e');
        const cellW = Math.max(2, Math.floor((w - 11) / 12));
        for (let i = 0; i < 84; i++) {
            const col = Math.floor(i / 7), row = i % 7, level = cells[i]?.intensity ?? 0;
            const color = level === 0 ? rgba(this._config.trackColor ?? '#77767b', .2)
                : [base[0], base[1], base[2], .25 + .1875 * Math.min(4, level)];
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
    return {placeholders: p, values};
}
function valueFor(data, vendor, source, mode) {
    const value = data.get(vendor, source);
    return Math.round(mode === 'used' ? value : 100 - value);
}
function textBlock(item, placeholders, values) {
    const derived = new Map(placeholders);
    for (const vendor of ['active', 'anthropic', 'openai', 'zai', 'openrouter', 'deepseek', 'kimi', 'opencode']) {
        for (const source of ['session', 'weekly', 'monthly', 'session_reset', 'weekly_reset', 'monthly_reset', 'peak']) {
            const prefix = vendor === 'active' ? source : `${vendor}_${source}`;
            derived.set(`${prefix}_used`, String(valueFor(values, vendor, source, 'used')));
            derived.set(`${prefix}_remaining`, String(valueFor(values, vendor, source, 'remaining')));
        }
    }
    const render = template => template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => derived.has(key) ? derived.get(key) : match);
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
function ringBlock(item, values, config, theme, heatmap) {
    if (!item.center?.enabled)
        return new BlockArea(item, values, config, theme, heatmap);
    const overlay = new St.Widget({layout_manager: new Clutter.BinLayout(), width: item.size, height: item.size});
    overlay.add_child(new BlockArea(item, values, config, theme, heatmap));
    const label = new St.Label({text: String(valueFor(values, item.center.vendor, item.center.source, item.center.mode)),
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    label.set_style(`font-size: ${item.center.fontSize}px; font-family: monospace; font-weight: 600;`);
    overlay.add_child(label);
    return overlay;
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
    const calendar = calendarCells(heatmap, now);
    const box = new St.BoxLayout({style_class: 'aiusagebar-panel-visual', y_align: Clutter.ActorAlign.CENTER});
    const items = config.customEnabled ? config.items : legacyItems(config);
    for (const item of items) {
        if (item.type === 'text') box.add_child(textBlock(item, active.placeholders, values));
        else if (item.type === 'ring') box.add_child(ringBlock(item, values, config, theme, calendar));
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
            center: {enabled: true, vendor: 'active', source: config.centerQuota === 'weekly' ? 'weekly' : 'session', mode: 'remaining', fontSize: 8},
            layers: [layer('session'), layer('weekly')]},
        ...(config.showResetRings ? [{id: 'reset', type: 'ring', size: 24, layerGap: .5, center: {enabled: false},
            layers: [layer('session_reset', 'remaining', false), layer('weekly_reset', 'remaining', false)]}] : []),
    ];
}
function calendarCells(contributions, now) {
    const byDate = new Map(contributions.map(x => [x.date, x])), cells = [];
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let offset = 83; offset >= 0; offset--) {
        const d = new Date(end); d.setDate(d.getDate() - offset);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        cells.push(byDate.get(key) ?? {date: key, intensity: 0});
    }
    return cells;
}
