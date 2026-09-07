export const SOURCES = Object.freeze([
    'session', 'weekly', 'monthly',
    'session_reset', 'weekly_reset', 'monthly_reset', 'peak',
]);

export const VISUAL_VENDORS = Object.freeze([
    'active', 'anthropic', 'openai', 'zai', 'openrouter', 'deepseek', 'kimi', 'opencode',
]);

export function sourceSupported(vendor, source) {
    if (vendor === 'active')
        return true;
    const quota = source.replace(/_reset$/, '');
    if (vendor === 'deepseek')
        return false;
    if (vendor === 'openrouter')
        return !source.endsWith('_reset') && ['session', 'weekly', 'peak'].includes(quota);
    if (quota === 'monthly')
        return vendor === 'opencode';
    return ['session', 'weekly', 'peak'].includes(quota);
}

export const DEFAULT_LAYOUT = Object.freeze([
    {
        id: 'quota', type: 'ring', size: 24,
        center: {enabled: true, vendor: 'active', source: 'session', mode: 'remaining', fontSize: 8},
        layers: [
            {vendor: 'active', source: 'session', mode: 'remaining', color: '#2ec27e', tiered: true, thickness: 2.5},
            {vendor: 'active', source: 'weekly', mode: 'remaining', color: '#3584e4', tiered: true, thickness: 2},
        ],
        layerGap: 0.5,
    },
    {
        id: 'reset', type: 'ring', size: 24,
        center: {enabled: false, vendor: 'active', source: 'session_reset', mode: 'remaining', fontSize: 8},
        layers: [
            {vendor: 'active', source: 'session_reset', mode: 'remaining', color: '#2ec27e', tiered: false, thickness: 2.5},
            {vendor: 'active', source: 'weekly_reset', mode: 'remaining', color: '#3584e4', tiered: false, thickness: 2},
        ],
        layerGap: 0.5,
    },
]);

const copy = value => JSON.parse(JSON.stringify(value));

function number(v, fallback, min, max) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function layer(raw = {}) {
    return {
        vendor: VISUAL_VENDORS.includes(raw.vendor) ? raw.vendor : 'active',
        source: SOURCES.includes(raw.source) ? raw.source : 'session',
        mode: raw.mode === 'used' ? 'used' : 'remaining',
        color: /^#[0-9a-f]{6}$/i.test(raw.color ?? '') ? raw.color : '#2ec27e',
        tiered: raw.tiered !== false,
        tierColors: Object.fromEntries(['low', 'mid', 'high', 'critical'].map(key =>
            [key, /^#[0-9a-f]{6}$/i.test(raw.tierColors?.[key] ?? '') ? raw.tierColors[key] : ''])),
        thickness: number(raw.thickness, 2, 1, 6),
    };
}

export function parseIndicatorLayout(text) {
    if (!text)
        return copy(DEFAULT_LAYOUT);
    try {
        const raw = JSON.parse(text);
        if (!Array.isArray(raw))
            return copy(DEFAULT_LAYOUT);
        return raw.slice(0, 12).map((item, i) => {
            const type = ['ring', 'bar', 'text', 'heatmap'].includes(item?.type) ? item.type : 'ring';
            const out = {id: String(item?.id ?? `item-${i}`), type};
            if (type === 'text') {
                out.template = String(item.template ?? '{session_remaining}');
                out.fontSize = number(item.fontSize, 10, 6, 24);
                out.color = /^#[0-9a-f]{6}$/i.test(item.color ?? '') ? item.color : '';
                out.secondaryTemplate = String(item.secondaryTemplate ?? '');
                out.secondaryFontSize = number(item.secondaryFontSize, 8, 6, 24);
            } else if (type === 'heatmap') {
                out.width = number(item.width, 48, 18, 120);
            } else {
                out.size = number(item.size, 24, 16, 40);
                out.layerGap = number(item.layerGap, 0.5, 0, 6);
                out.layers = (Array.isArray(item.layers) ? item.layers : []).slice(0, 8).map(layer);
                if (!out.layers.length)
                    out.layers = [layer()];
                if (type === 'ring') {
                    const c = item.center ?? {};
                    out.center = {enabled: c.enabled === true, vendor: VISUAL_VENDORS.includes(c.vendor) ? c.vendor : 'active',
                        source: SOURCES.includes(c.source) ? c.source : 'session',
                        mode: c.mode === 'used' ? 'used' : 'remaining', fontSize: number(c.fontSize, 8, 6, 16)};
                } else {
                    out.orientation = item.orientation === 'vertical' ? 'vertical' : 'horizontal';
                    out.length = number(item.length, 36, 16, 72);
                }
            }
            return out;
        });
    } catch (_) {
        return copy(DEFAULT_LAYOUT);
    }
}

export const serializeIndicatorLayout = layout => JSON.stringify(layout);

export function newItem(type, id = `${Date.now()}`) {
    if (type === 'text')
        return {id, type, template: '{session_remaining}', fontSize: 10, color: '', secondaryTemplate: '', secondaryFontSize: 8};
    if (type === 'heatmap')
        return {id, type, width: 48};
    if (type === 'bar')
        return {id, type, orientation: 'horizontal', length: 36, size: 20, layerGap: 0.5, layers: [layer()]};
    return {id, type: 'ring', size: 24, layerGap: 0.5,
        center: {enabled: true, vendor: 'active', source: 'session', mode: 'remaining', fontSize: 8}, layers: [layer()]};
}
