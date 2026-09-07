import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {rgbToHex} from './lib/color.js';
import {vformat} from './lib/format.js';
import {defaultTheme} from './lib/theme.js';
import {VENDOR_LABELS} from './lib/vendors.js';
import {parseIndicatorLayout, serializeIndicatorLayout, newItem, SOURCES, VISUAL_VENDORS, sourceSupported} from './lib/indicator-layout.js';

const INTERVAL_MIN = 300;
const INTERVAL_MAX = 86400;

const COLOR_KEY_PALETTE = {
    'color-low': 'green',
    'color-mid': 'yellow',
    'color-high': 'orange',
    'color-critical': 'red',
};

// NOTE: user-facing strings are wrapped in `_()` at their use sites (inside
// `fillPreferencesWindow`/the page builders), never at module top level — the
// gettext domain is not yet bound when this module is first evaluated.

export default class AiUsagebarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const cleanups = [];

        this._registerIconPath();
        this._loadStyles();

        window.add(this._buildGeneralPage(settings, cleanups));
        window.add(this._buildIndicatorPage(settings, cleanups));
        window.add(this._buildProvidersPage(settings));

        window.connect('close-request', () => {
            for (const disconnect of cleanups)
                disconnect();
            return false;
        });
    }

    _buildGeneralPage(settings, cleanups) {
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const displayGroup = new Adw.PreferencesGroup({title: _('Display')});
        const model = new Gtk.StringList();
        // Vendor labels are brand names (Anthropic, OpenAI, …) — kept verbatim.
        for (const label of VENDOR_LABELS)
            model.append(label);
        const combo = new Adw.ComboRow({
            title: _('Primary vendor'),
            subtitle: _('Shown by default and used as the scroll-cycle reset target'),
            model,
        });
        // The schema enum nicks are ordered identically to VENDOR_IDS / VENDOR_LABELS,
        // so the combo index IS the enum value. GJS lacks bind_with_mapping, so wire
        // it manually with get_enum/set_enum and a resync handler.
        combo.selected = settings.get_enum('primary-vendor');
        const comboNotifyId = combo.connect('notify::selected', () => {
            if (settings.get_enum('primary-vendor') !== combo.selected)
                settings.set_enum('primary-vendor', combo.selected);
        });
        const comboResyncId = settings.connect('changed::primary-vendor', () => {
            const v = settings.get_enum('primary-vendor');
            if (combo.selected !== v)
                combo.selected = v;
        });
        cleanups.push(() => {
            combo.disconnect(comboNotifyId);
            settings.disconnect(comboResyncId);
        });
        displayGroup.add(combo);
        page.add(displayGroup);

        const cadenceGroup = new Adw.PreferencesGroup({
            title: _('Refresh'),
            // Translators: %d is the minimum refresh interval in seconds.
            description: vformat(_('Minimum %d s — the upstream endpoints rate-limit below that.'), INTERVAL_MIN),
        });
        const adjustment = new Gtk.Adjustment({
            lower: INTERVAL_MIN,
            upper: INTERVAL_MAX,
            step_increment: 60,
            page_increment: 300,
        });
        const interval = new Adw.SpinRow({
            title: _('Refresh interval (seconds)'),
            adjustment,
            digits: 0,
        });
        interval.set_value(settings.get_int('refresh-interval'));
        const intervalNotifyId = interval.connect('notify::value', () => {
            const v = Math.round(interval.get_value());
            if (settings.get_int('refresh-interval') !== v)
                settings.set_int('refresh-interval', v);
        });
        const intervalResyncId = settings.connect('changed::refresh-interval', () => {
            const v = settings.get_int('refresh-interval');
            if (Math.round(interval.get_value()) !== v)
                interval.set_value(v);
        });
        cleanups.push(() => {
            interval.disconnect(intervalNotifyId);
            settings.disconnect(intervalResyncId);
        });
        cadenceGroup.add(interval);
        page.add(cadenceGroup);

        const labelGroup = new Adw.PreferencesGroup({
            title: _('Panel label'),
            // Translators: the {token} names are literal placeholders the user
            // types — keep them verbatim, only translate the surrounding prose.
            description: _('Placeholders: {vendor_short} {session_pct}% {session_reset} {plan} {weekly_pct} {weekly_reset}'),
        });
        const barFormat = new Adw.EntryRow({title: _('Bar format')});
        settings.bind('bar-format', barFormat, 'text', Gio.SettingsBindFlags.DEFAULT);
        labelGroup.add(barFormat);
        page.add(labelGroup);

        const popupGroup = new Adw.PreferencesGroup({
            title: _('Popup'),
            // Translators: the {token} names are literal placeholders the user
            // types — keep them verbatim, only translate the surrounding prose.
            description: _('Optional extra lines shown above the popup. Empty uses the built-in layout. Placeholders: {plan} {session_pct} {session_reset} {weekly_pct} {weekly_reset}'),
        });
        popupGroup.add(this._entryRow(settings, 'tooltip-format', _('Popup format')));
        popupGroup.add(this._switchRow(settings, 'show-pace-marker', _('Show pace marker')));
        page.add(popupGroup);

        const colorGroup = new Adw.PreferencesGroup({
            title: _('Severity colors'),
            description: _('Pick a color per severity tier. Reset returns a tier to its built-in default.'),
        });
        const theme = defaultTheme();
        // Translators: Low/Mid/High/Critical are usage-severity tier names.
        colorGroup.add(this._colorRow(settings, 'color-low', _('Low'), theme[COLOR_KEY_PALETTE['color-low']], cleanups));
        colorGroup.add(this._colorRow(settings, 'color-mid', _('Mid'), theme[COLOR_KEY_PALETTE['color-mid']], cleanups));
        colorGroup.add(this._colorRow(settings, 'color-high', _('High'), theme[COLOR_KEY_PALETTE['color-high']], cleanups));
        colorGroup.add(this._colorRow(settings, 'color-critical', _('Critical'), theme[COLOR_KEY_PALETTE['color-critical']], cleanups));
        page.add(colorGroup);

        const notifyGroup = new Adw.PreferencesGroup({
            title: _('Notifications'),
            description: _('Show a desktop notification the first time a vendor reaches the threshold. It re-arms when usage drops back or the window resets.'),
        });
        notifyGroup.add(this._switchRow(settings, 'notify-enabled', _('Notify on high usage')));
        const notifyAdj = new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 5,
            page_increment: 10,
        });
        const threshold = new Adw.SpinRow({
            title: _('Notification threshold (%)'),
            adjustment: notifyAdj,
            digits: 0,
        });
        threshold.set_value(settings.get_int('notify-threshold'));
        const thresholdNotifyId = threshold.connect('notify::value', () => {
            const v = Math.round(threshold.get_value());
            if (settings.get_int('notify-threshold') !== v)
                settings.set_int('notify-threshold', v);
        });
        const thresholdResyncId = settings.connect('changed::notify-threshold', () => {
            const v = settings.get_int('notify-threshold');
            if (Math.round(threshold.get_value()) !== v)
                threshold.set_value(v);
        });
        cleanups.push(() => {
            threshold.disconnect(thresholdNotifyId);
            settings.disconnect(thresholdResyncId);
        });
        notifyGroup.add(threshold);
        page.add(notifyGroup);

        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
            description: _('Restore every setting — vendor toggles, paths, keys, formats, and colors — to its built-in default.'),
        });
        const resetRow = new Adw.ButtonRow({title: _('Reset all settings')});
        resetRow.add_css_class('destructive-action');
        const resetActivatedId = resetRow.connect('activated', () =>
            this._confirmResetAll(settings, resetRow.get_root()));
        cleanups.push(() => resetRow.disconnect(resetActivatedId));
        resetGroup.add(resetRow);
        page.add(resetGroup);

        return page;
    }

    _buildIndicatorPage(settings, cleanups) {
        const page = new Adw.PreferencesPage({title: _('Indicator'), icon_name: 'view-grid-symbolic'});
        const general = new Adw.PreferencesGroup({title: _('Panel indicator')});
        general.add(this._switchRow(settings, 'indicator-custom-enabled', _('Use custom graphical layout')));
        const boxes = new Gtk.StringList(); [_('Left box'), _('Center box'), _('Right box')].forEach(x => boxes.append(x));
        const box = new Adw.ComboRow({title: _('Panel box'), model: boxes});
        const boxIds = ['left', 'center', 'right']; box.selected = Math.max(0, boxIds.indexOf(settings.get_string('indicator-panel-box')));
        box.connect('notify::selected', () => settings.set_string('indicator-panel-box', boxIds[box.selected]));
        general.add(box);
        general.add(this._spinSettingRow(settings, 'indicator-panel-position', _('Position inside box'), 0, 99));
        const enabled = this._switchRow(settings, 'indicator-label-enabled', _('Show leading label'));
        general.add(enabled);
        general.add(this._entryRow(settings, 'indicator-label-text', _('Leading label template')));
        general.add(this._spinSettingRow(settings, 'indicator-label-font-size', _('Leading label font size'), 6, 28));
        general.add(this._colorRow(settings, 'visual-track-color', _('Track color'), '#5e5c64', cleanups));
        general.add(this._colorRow(settings, 'heatmap-color', _('Heatmap color'), '#2ec27e', cleanups));
        page.add(general);

        const status = new Adw.PreferencesGroup({title: _('Data source status')});
        page.add(status);
        const rebuildStatus = () => this._rebuildSourceStatus(settings, status);
        rebuildStatus();
        const statusId = settings.connect('changed::indicator-source-status', rebuildStatus);
        cleanups.push(() => settings.disconnect(statusId));

        const layout = new Adw.PreferencesGroup({
            title: _('Ordered blocks'),
            description: _('Build the panel from any number of rings, bars, text blocks, and heatmaps. Changes redraw only when settings or quota data change.'),
        });
        page.add(layout);
        this._rebuildLayoutEditor(settings, layout);
        return page;
    }

    _rebuildLayoutEditor(settings, group) {
        for (const row of group._aiRows ?? [])
            group.remove(row);
        group._aiRows = [];
        const items = parseIndicatorLayout(settings.get_string('indicator-items-json'));
        const save = () => settings.set_string('indicator-items-json', serializeIndicatorLayout(items));
        const structural = () => { save(); this._rebuildLayoutEditor(settings, group); };

        items.forEach((item, index) => {
            const row = new Adw.ExpanderRow({title: `${index + 1}. ${this._itemTitle(item.type)}`});
            row.add_suffix(this._smallButton('go-up-symbolic', _('Move up'), () => {
                if (index > 0) { [items[index - 1], items[index]] = [items[index], items[index - 1]]; structural(); }
            }));
            row.add_suffix(this._smallButton('go-down-symbolic', _('Move down'), () => {
                if (index + 1 < items.length) { [items[index + 1], items[index]] = [items[index], items[index + 1]]; structural(); }
            }));
            row.add_suffix(this._smallButton('user-trash-symbolic', _('Remove'), () => { items.splice(index, 1); structural(); }));
            this._populateItemEditor(row, item, save, structural);
            group.add(row); group._aiRows.push(row);
        });

        for (const [type, title] of [['ring', _('Add ring')], ['bar', _('Add bar')], ['text', _('Add text')], ['heatmap', _('Add heatmap')]]) {
            const row = new Adw.ButtonRow({title, start_icon_name: 'list-add-symbolic'});
            row.connect('activated', () => { items.push(newItem(type)); structural(); });
            group.add(row); group._aiRows.push(row);
        }
    }

    _populateItemEditor(row, item, save, structural) {
        if (item.type === 'text') {
            row.add_row(this._valueEntry(_('Top line template'), item.template, v => { item.template = v; save(); }));
            row.add_row(this._valueSpin(_('Top line font size'), item.fontSize, 6, 24, v => { item.fontSize = v; save(); }));
            row.add_row(this._valueEntry(_('Bottom line template (empty = hidden)'), item.secondaryTemplate, v => { item.secondaryTemplate = v; save(); }));
            row.add_row(this._valueSpin(_('Bottom line font size'), item.secondaryFontSize, 6, 24, v => { item.secondaryFontSize = v; save(); }));
            row.add_row(this._valueEntry(_('Color (hex, empty = theme)'), item.color, v => { item.color = v; save(); }));
            return;
        }
        if (item.type === 'heatmap') {
            row.add_row(this._valueSpin(_('Width'), item.width, 18, 120, v => { item.width = v; save(); }));
            return;
        }
        row.add_row(this._valueSpin(item.type === 'ring' ? _('Diameter') : _('Height'), item.size, 16, 40, v => { item.size = v; save(); }));
        if (item.type === 'ring')
            row.add_row(this._valueSpin(_('Gap between layers'), item.layerGap, 0, 6, v => { item.layerGap = v; save(); }));
        if (item.type === 'bar') {
            row.add_row(this._valueCombo(_('Orientation'), [_('Horizontal'), _('Vertical')], item.orientation === 'vertical' ? 1 : 0,
                v => { item.orientation = v === 1 ? 'vertical' : 'horizontal'; save(); }));
            row.add_row(this._valueSpin(_('Length'), item.length, 16, 72, v => { item.length = v; save(); }));
        } else {
            row.add_row(this._vendorCombo(_('Center data source'), item.center.vendor, v => { item.center.vendor = v; structural(); }));
            const center = new Adw.SwitchRow({title: _('Center text'), active: item.center.enabled});
            center.connect('notify::active', () => { item.center.enabled = center.active; save(); }); row.add_row(center);
            row.add_row(this._sourceCombo(_('Center content'), item.center.source, v => { item.center.source = v; structural(); }, item.center.vendor));
            row.add_row(this._modeCombo(_('Center mode'), item.center.mode, v => { item.center.mode = v; save(); }));
            row.add_row(this._valueSpin(_('Center font size'), item.center.fontSize, 6, 16, v => { item.center.fontSize = v; save(); }));
        }
        item.layers.forEach((layer, layerIndex) => {
            const lr = new Adw.ExpanderRow({title: `${_('Layer')} ${layerIndex + 1}`});
            lr.add_suffix(this._smallButton('go-up-symbolic', _('Move layer up'), () => {
                if (layerIndex > 0) { [item.layers[layerIndex - 1], item.layers[layerIndex]] = [item.layers[layerIndex], item.layers[layerIndex - 1]]; structural(); }
            }));
            lr.add_suffix(this._smallButton('user-trash-symbolic', _('Remove layer'), () => { item.layers.splice(layerIndex, 1); structural(); }));
            lr.add_row(this._vendorCombo(_('Data source'), layer.vendor, v => { layer.vendor = v; structural(); }));
            lr.add_row(this._sourceCombo(_('Content'), layer.source, v => { layer.source = v; structural(); }, layer.vendor));
            lr.add_row(this._modeCombo(_('Mode'), layer.mode, v => { layer.mode = v; save(); }));
            const tiered = new Adw.SwitchRow({title: _('Use severity color tiers'), active: layer.tiered});
            tiered.connect('notify::active', () => { layer.tiered = tiered.active; save(); }); lr.add_row(tiered);
            lr.add_row(this._layoutColorRow(_('Fixed color'), layer.color, '#2ec27e', v => { layer.color = v; save(); }));
            layer.tierColors ??= {low: '', mid: '', high: '', critical: ''};
            for (const [key, title] of [['low', _('Low tier color')], ['mid', _('Mid tier color')],
                ['high', _('High tier color')], ['critical', _('Critical tier color')]])
                lr.add_row(this._layoutColorRow(`${title} (${_('empty = global')})`, layer.tierColors[key],
                    defaultTheme()[{low: 'green', mid: 'yellow', high: 'orange', critical: 'red'}[key]],
                    v => { layer.tierColors[key] = v; save(); }));
            lr.add_row(this._valueSpin(_('Thickness'), layer.thickness, 1, 6, v => { layer.thickness = v; save(); }));
            row.add_row(lr);
        });
        const add = new Adw.ButtonRow({title: _('Add layer'), start_icon_name: 'list-add-symbolic'});
        add.connect('activated', () => { item.layers.push({vendor: 'active', source: 'session', mode: 'remaining', color: '#2ec27e', tiered: true,
            tierColors: {low: '', mid: '', high: '', critical: ''}, thickness: 2}); structural(); });
        row.add_row(add);
    }

    _itemTitle(type) { return ({ring: _('Ring'), bar: _('Bar'), text: _('Text'), heatmap: _('Heatmap')})[type] ?? type; }
    _smallButton(icon, tooltip, callback) {
        const button = new Gtk.Button({icon_name: icon, tooltip_text: tooltip, valign: Gtk.Align.CENTER, css_classes: ['flat']});
        button.connect('clicked', callback); return button;
    }
    _valueEntry(title, value, callback) {
        const row = new Adw.EntryRow({title, text: String(value ?? '')}); row.connect('changed', () => callback(row.text)); return row;
    }
    _valueSpin(title, value, lower, upper, callback) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1}), digits: 0});
        row.value = value; row.connect('notify::value', () => callback(Math.round(row.value))); return row;
    }
    _valueCombo(title, labels, selected, callback) {
        const model = new Gtk.StringList(); labels.forEach(x => model.append(x));
        const row = new Adw.ComboRow({title, model, selected}); row.connect('notify::selected', () => callback(row.selected)); return row;
    }
    _vendorCombo(title, selected, callback) {
        return this._valueCombo(title, [_('Active vendor'), ...VENDOR_LABELS],
            Math.max(0, VISUAL_VENDORS.indexOf(selected)), i => callback(VISUAL_VENDORS[i]));
    }
    _sourceCombo(title, selected, callback, vendor = 'active') {
        const labels = ['5h quota', '1w quota', 'Monthly quota', '5h reset', '1w reset', 'Monthly reset', 'Peak quota'];
        const row = this._valueCombo(title, labels, Math.max(0, SOURCES.indexOf(selected)), i => callback(SOURCES[i]));
        if (!sourceSupported(vendor, selected)) {
            row.subtitle = _('This source does not expose the selected quota as a percentage. The layer will stay empty.');
            row.add_css_class('error');
        }
        return row;
    }
    _modeCombo(title, selected, callback) {
        return this._valueCombo(title, [_('Remaining'), _('Used')], selected === 'used' ? 1 : 0, i => callback(i === 1 ? 'used' : 'remaining'));
    }
    _spinSettingRow(settings, key, title, lower, upper) {
        const row = new Adw.SpinRow({title, adjustment: new Gtk.Adjustment({lower, upper, step_increment: 1}), digits: 0});
        row.value = settings.get_int(key);
        row.connect('notify::value', () => {
            const value = Math.round(row.value);
            if (settings.get_int(key) !== value)
                settings.set_int(key, value);
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_int(key);
            if (Math.round(row.value) !== value)
                row.value = value;
        });
        return row;
    }

    _layoutColorRow(title, value, fallback, callback) {
        const row = new Adw.ActionRow({title});
        const dialog = new Gtk.ColorDialog({with_alpha: false});
        const picker = new Gtk.ColorDialogButton({dialog, valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({icon_name: 'edit-clear-symbolic', tooltip_text: _('Use inherited color'),
            valign: Gtk.Align.CENTER, css_classes: ['flat']});
        const color = new Gdk.RGBA(); color.parse(value || fallback); picker.set_rgba(color);
        let syncing = false;
        picker.connect('notify::rgba', () => {
            if (syncing) return;
            const {red, green, blue} = picker.get_rgba();
            callback(rgbToHex(red, green, blue));
        });
        reset.connect('clicked', () => {
            syncing = true; const c = new Gdk.RGBA(); c.parse(fallback); picker.set_rgba(c); syncing = false; callback('');
        });
        row.add_suffix(picker); row.add_suffix(reset); return row;
    }

    _rebuildSourceStatus(settings, group) {
        for (const row of group._aiRows ?? [])
            group.remove(row);
        group._aiRows = [];
        let status = {};
        try { status = JSON.parse(settings.get_string('indicator-source-status')); } catch (_) { /* ignored */ }
        const layout = parseIndicatorLayout(settings.get_string('indicator-items-json'));
        for (const item of layout) {
            const vendors = [...(item.layers ?? []).map(layer => layer.vendor), item.center?.vendor];
            for (const id of vendors) {
                if (id && id !== 'active' && settings.settings_schema.has_key(`${id}-enabled`)
                    && !settings.get_boolean(`${id}-enabled`))
                    status[id] = {ok: false, message: _('Referenced by the layout, but disabled in its vendor settings.')};
            }
        }
        const entries = Object.entries(status);
        if (!entries.length) {
            const row = new Adw.ActionRow({title: _('No runtime data yet'), subtitle: _('The extension will report authentication and request failures here.')});
            group.add(row); group._aiRows.push(row); return;
        }
        for (const [id, state] of entries) {
            const row = new Adw.ActionRow({title: id === 'openai' ? 'OpenAI' : id === 'opencode' ? 'OpenCode' : id,
                subtitle: state.ok ? _('Available') : (state.message || state.kind || _('Unavailable'))});
            row.add_prefix(new Gtk.Image({icon_name: state.ok ? 'emblem-ok-symbolic' : 'dialog-warning-symbolic'}));
            if (!state.ok) row.add_css_class('error');
            group.add(row); group._aiRows.push(row);
        }
    }

    _registerIconPath() {
        // The bundled generic symbolic icon (icons/ai-symbolic.svg) lives outside
        // any icon theme, so add the dir to the search path; pages reference it
        // by bare basename via icon_name.
        const iconDir = `${this.path}/icons`;
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_search_path().includes(iconDir))
            iconTheme.add_search_path(iconDir);
    }

    _loadStyles() {
        // Bottom tabs are AdwViewSwitcher buttons stacking icon over label with
        // no spacing; push the icon up so the label has a vertical gap.
        const provider = new Gtk.CssProvider();
        provider.load_from_string('viewswitcher button image { margin-bottom: 6px; }');
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _confirmResetAll(settings, parent) {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset all settings?'),
            body: _('This restores every setting to its built-in default and cannot be undone.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_d, response) => {
            if (response === 'reset')
                this._resetAll(settings);
        });
        dialog.present(parent);
    }

    _resetAll(settings) {
        for (const key of settings.settings_schema.list_keys())
            settings.reset(key);
    }

    _buildProvidersPage(settings) {
        const page = new Adw.PreferencesPage({title: _('Providers'), icon_name: 'ai-symbolic'});
        page.add(this._buildAnthropicGroup(settings));
        page.add(this._buildOpenAiGroup(settings));
        page.add(this._buildZaiGroup(settings));
        page.add(this._buildOpenRouterGroup(settings));
        page.add(this._buildDeepSeekGroup(settings));
        page.add(this._buildKimiGroup(settings));
        page.add(this._buildOpenCodeGroup(settings));
        return page;
    }

    _buildAnthropicGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Anthropic'),
            description: _('Credentials path — empty uses ~/.claude/.credentials.json.'),
        });
        group.add(this._switchRow(settings, 'anthropic-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'anthropic-credentials-path', _('Credentials path')));
        return group;
    }

    _buildOpenAiGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('OpenAI'),
            description: _('Codex auth path — empty uses ~/.codex/auth.json.'),
        });
        group.add(this._switchRow(settings, 'openai-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'openai-codex-auth-path', _('Codex auth path')));
        return group;
    }

    _buildZaiGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Z.AI'),
            description: _('Set the API key inline or via the environment variable (env wins).'),
        });
        group.add(this._switchRow(settings, 'zai-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'zai-api-key-env', _('API key env var')));
        group.add(this._passwordRow(settings, 'zai-api-key', _('API key (inline)')));
        group.add(this._entryRow(settings, 'zai-plan-tier', _('Plan tier (lite/pro/max)')));
        return group;
    }

    _buildOpenRouterGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('OpenRouter'),
            description: _('Set the API key inline or via the environment variable (env wins).'),
        });
        group.add(this._switchRow(settings, 'openrouter-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'openrouter-api-key-env', _('API key env var')));
        group.add(this._passwordRow(settings, 'openrouter-api-key', _('API key (inline)')));
        return group;
    }

    _buildDeepSeekGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('DeepSeek'),
            description: _('Disabled by default; requires an API key (env var or inline).'),
        });
        group.add(this._switchRow(settings, 'deepseek-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'deepseek-api-key-env', _('API key env var')));
        group.add(this._passwordRow(settings, 'deepseek-api-key', _('API key (inline)')));
        return group;
    }

    _buildKimiGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Kimi'),
            description: _('Disabled by default; requires an API key (env var or inline).'),
        });
        group.add(this._switchRow(settings, 'kimi-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'kimi-api-key-env', _('API key env var')));
        group.add(this._passwordRow(settings, 'kimi-api-key', _('API key (inline)')));
        return group;
    }

    _buildOpenCodeGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('OpenCode Go'),
            description: _('Reads rolling, weekly, and monthly quota from the OpenCode Go usage endpoint.'),
        });
        group.add(this._switchRow(settings, 'opencode-enabled', _('Enabled')));
        group.add(this._entryRow(settings, 'opencode-base-url', _('API base URL')));
        group.add(this._entryRow(settings, 'opencode-api-key-env', _('API key env var')));
        group.add(this._passwordRow(settings, 'opencode-api-key', _('API key (inline)')));
        return group;
    }

    _switchRow(settings, key, title) {
        const row = new Adw.SwitchRow({title});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _bindEnumCombo(settings, key, row, cleanups) {
        row.selected = settings.get_enum(key);
        const notify = row.connect('notify::selected', () => {
            if (settings.get_enum(key) !== row.selected)
                settings.set_enum(key, row.selected);
        });
        const changed = settings.connect(`changed::${key}`, () => {
            const value = settings.get_enum(key);
            if (row.selected !== value)
                row.selected = value;
        });
        cleanups.push(() => { row.disconnect(notify); settings.disconnect(changed); });
    }

    _entryRow(settings, key, title) {
        const row = new Adw.EntryRow({title});
        settings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _colorRow(settings, key, title, defaultHex, cleanups) {
        const row = new Adw.ActionRow({title});

        const dialog = new Gtk.ColorDialog({with_alpha: false});
        const button = new Gtk.ColorDialogButton({dialog, valign: Gtk.Align.CENTER});
        const reset = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Reset to default'),
        });

        let syncing = false;

        const resync = () => {
            const value = settings.get_string(key);
            const rgba = new Gdk.RGBA();
            if (!value || !rgba.parse(value))
                rgba.parse(defaultHex);
            syncing = true;
            button.set_rgba(rgba);
            syncing = false;
            reset.sensitive = value !== '';
        };

        const pickId = button.connect('notify::rgba', () => {
            if (syncing)
                return;
            const {red, green, blue} = button.get_rgba();
            const hex = rgbToHex(red, green, blue);
            if (settings.get_string(key) !== hex)
                settings.set_string(key, hex);
        });
        const resetId = reset.connect('clicked', () => settings.set_string(key, ''));
        const changedId = settings.connect(`changed::${key}`, resync);
        cleanups.push(() => {
            button.disconnect(pickId);
            reset.disconnect(resetId);
            settings.disconnect(changedId);
        });

        resync();
        row.add_suffix(button);
        row.add_suffix(reset);
        return row;
    }

    _passwordRow(settings, key, title) {
        const row = new Adw.PasswordEntryRow({title});
        settings.bind(key, row, 'text', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
}
