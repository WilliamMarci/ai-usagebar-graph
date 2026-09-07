import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Indicator} from './ui/indicator.js';

export default class AiUsagebarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._addIndicator();
        this._placementChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key !== 'indicator-panel-box' && key !== 'indicator-panel-position')
                return;
            this._indicator?.destroy();
            this._addIndicator();
        });
    }

    _addIndicator() {
        this._indicator = new Indicator(this._settings, () => this.openPreferences(), this.path);
        const box = ['left', 'center', 'right'].includes(this._settings.get_string('indicator-panel-box'))
            ? this._settings.get_string('indicator-panel-box') : 'right';
        Main.panel.addToStatusArea(this.uuid, this._indicator, this._settings.get_int('indicator-panel-position'), box);
    }

    disable() {
        if (this._placementChangedId) {
            this._settings.disconnect(this._placementChangedId);
            this._placementChangedId = null;
        }
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
