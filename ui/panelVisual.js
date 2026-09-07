import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {severityFor, severityColor} from '../lib/severity.js';

const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));

function rgba(hex, alpha = 1) {
    const s = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex.slice(1) : '2ec27e';
    return [0, 2, 4].map(i => Number.parseInt(s.slice(i, i + 2), 16) / 255).concat(alpha);
}

function setColor(cr, c) { cr.setSourceRGBA(...c); }

const VisualArea = GObject.registerClass(class VisualArea extends St.DrawingArea {
    _init(model, config) {
        const size = config.mode === 'rings' ? [config.showResetRings ? 70 : 36, 24]
            : config.mode === 'heatmap' ? [72, 22] : config.orientation === 'vertical' ? [24, 22] : [64, 22];
        super._init({width: size[0], height: size[1], y_align: Clutter.ActorAlign.CENTER});
        this._model = model;
        this._config = config;
        this.connect('repaint', () => this._paint());
    }

    _paint() {
        const cr = this.get_context();
        const [w, h] = this.get_surface_size();
        if (this._config.mode === 'bars') this._bars(cr, w, h);
        else if (this._config.mode === 'rings') this._rings(cr, w, h);
        else this._heatmap(cr, w, h);
        cr.$dispose();
    }

    _bars(cr, w, h) {
        const track = rgba(this._config.trackColor ?? '#77767b', .35);
        const vals = [this._model.session, this._model.weekly];
        vals.forEach((v, i) => {
            const remaining = (100 - clamp(v.used)) / 100;
            setColor(cr, track);
            if (this._config.orientation === 'vertical') {
                const bw = 7, x = i * 11 + 2;
                cr.rectangle(x, 1, bw, h - 2); cr.fill();
                setColor(cr, rgba(v.color)); cr.rectangle(x, 1 + (h - 2) * (1 - remaining), bw, (h - 2) * remaining); cr.fill();
            } else {
                const y = 3 + i * 10;
                cr.rectangle(0, y, w, 6); cr.fill();
                setColor(cr, rgba(v.color)); cr.rectangle(0, y, w * remaining, 6); cr.fill();
            }
        });
    }

    _arc(cr, cx, cy, radius, fraction, color, width) {
        cr.setLineWidth(width); cr.setLineCap(1);
        setColor(cr, rgba(this._config.trackColor ?? '#77767b', .35));
        cr.arc(cx, cy, radius, 0, Math.PI * 2); cr.stroke();
        setColor(cr, rgba(color));
        cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(fraction) / 100); cr.stroke();
    }

    _rings(cr, w, h) {
        const quotaX = 12;
        this._arc(cr, quotaX, h / 2, 9, 100 - this._model.session.used, this._model.session.color, 2.5);
        this._arc(cr, quotaX, h / 2, 5.5, 100 - this._model.weekly.used, this._model.weekly.color, 2);
        if (this._config.showResetRings) {
            const x = 42;
            this._arc(cr, x, h / 2, 9, this._model.session.resetRemaining, this._model.session.color, 2.5);
            this._arc(cr, x, h / 2, 5.5, this._model.weekly.resetRemaining, this._model.weekly.color, 2);
        }
    }

    _heatmap(cr, w, h) {
        const cells = this._model.heatmap.slice(-84);
        const base = rgba(this._config.heatmapColor ?? '#2ec27e');
        const cw = 4, gap = 2;
        for (let i = 0; i < 84; i++) {
            const col = Math.floor(i / 7), row = i % 7;
            const level = cells[i]?.intensity ?? 0;
            const c = level === 0 ? rgba(this._config.trackColor ?? '#77767b', .2)
                : [base[0], base[1], base[2], .25 + .1875 * Math.min(4, level)];
            setColor(cr, c); cr.rectangle(col * (cw + gap), row * 3, cw, 2); cr.fill();
        }
    }
});

function pct(map, key) { return clamp(Number.parseFloat(map.get(key) ?? '0')); }
function remainingReset(reset, windowMs, now) {
    const t = reset instanceof Date ? reset.getTime() : Number.NaN;
    return Number.isFinite(t) ? clamp((t - now.getTime()) * 100 / windowMs) : 0;
}

export function makePanelVisual(adapter, snapshot, now, config, theme, heatmap = []) {
    const p = adapter.placeholders(snapshot, now);
    const s = snapshot.session ?? snapshot.window ?? null;
    const wk = snapshot.weekly ?? null;
    const model = {
        session: {used: pct(p, 'session_pct'), resetRemaining: remainingReset(s?.resetsAt ?? s?.resetAt, s?.windowMs ?? 5 * 3600e3, now)},
        weekly: {used: pct(p, 'weekly_pct'), resetRemaining: remainingReset(wk?.resetsAt ?? wk?.resetAt, wk?.windowMs ?? 7 * 86400e3, now)},
        heatmap: calendarCells(heatmap, now),
    };
    model.session.color = severityColor(severityFor(model.session.used), theme);
    model.weekly.color = severityColor(severityFor(model.weekly.used), theme);
    const box = new St.BoxLayout({style_class: 'aiusagebar-panel-visual', y_align: Clutter.ActorAlign.CENTER});
    if (config.showLabels && config.mode === 'bars')
        box.add_child(new St.Label({text: config.orientation === 'vertical' ? '5h·1w' : '5h\n1w', style_class: 'aiusagebar-visual-label'}));
    if (config.mode === 'rings') {
        const overlay = new St.Widget({layout_manager: new Clutter.FixedLayout(), width: config.showResetRings ? 70 : 36, height: 24});
        overlay.add_child(new VisualArea(model, config));
        const center = config.centerQuota === 'weekly' ? 100 - model.weekly.used : 100 - model.session.used;
        const label = new St.Label({text: `${Math.round(center)}%`, style_class: 'aiusagebar-ring-text', width: 24,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        label.set_position(0, 0);
        overlay.add_child(label);
        box.add_child(overlay);
    } else {
        box.add_child(new VisualArea(model, config));
    }
    return box;
}

function calendarCells(contributions, now) {
    const byDate = new Map(contributions.map(x => [x.date, x]));
    const cells = [];
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let offset = 83; offset >= 0; offset--) {
        const d = new Date(end); d.setDate(d.getDate() - offset);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        cells.push(byDate.get(key) ?? {date: key, intensity: 0});
    }
    return cells;
}
