import {defaultCredsPath} from './oauth/anthropic.js';
import {defaultAuthPath} from './oauth/openai.js';
import {emptyToNull} from './config-resolve.js';
import {parseIndicatorLayout} from './indicator-layout.js';

export function readConfig(settings) {
    const s = key => settings.get_string(key);
    const b = key => settings.get_boolean(key);

    return {
        primaryVendor: s('primary-vendor'),
        activeVendor: s('active-vendor'),
        refreshIntervalSecs: settings.get_int('refresh-interval'),
        barFormat: s('bar-format'),
        display: {
            mode: s('display-mode'),
            orientation: s('visual-bar-orientation'),
            showLabels: b('visual-show-labels'),
            centerQuota: s('visual-center-quota'),
            showResetRings: b('visual-show-reset-rings'),
            trackColor: emptyToNull(s('visual-track-color')),
            heatmapColor: emptyToNull(s('heatmap-color')),
            heatmapWeekStart: s('heatmap-week-start'),
            labelEnabled: b('indicator-label-enabled'),
            customEnabled: true,
            labelText: s('indicator-label-text'),
            labelFontSize: settings.get_int('indicator-label-font-size'),
            items: parseIndicatorLayout(s('indicator-items-json')),
        },
        tooltipFormat: emptyToNull(s('tooltip-format')),
        showPaceMarker: b('show-pace-marker'),
        notifications: {
            enabled: b('notify-enabled'),
            threshold: settings.get_int('notify-threshold'),
        },
        colors: {
            low: emptyToNull(s('color-low')),
            mid: emptyToNull(s('color-mid')),
            high: emptyToNull(s('color-high')),
            critical: emptyToNull(s('color-critical')),
        },
        vendors: {
            anthropic: {
                enabled: b('anthropic-enabled'),
                credentialsPath: emptyToNull(s('anthropic-credentials-path')),
            },
            openai: {
                enabled: b('openai-enabled'),
                codexAuthPath: emptyToNull(s('openai-codex-auth-path')),
                adminKeyEnv: s('openai-admin-key-env'),
            },
            zai: {
                enabled: b('zai-enabled'),
                apiKeyEnv: s('zai-api-key-env'),
                apiKey: emptyToNull(s('zai-api-key')),
                planTier: emptyToNull(s('zai-plan-tier')),
            },
            openrouter: {
                enabled: b('openrouter-enabled'),
                apiKeyEnv: s('openrouter-api-key-env'),
                apiKey: emptyToNull(s('openrouter-api-key')),
            },
            deepseek: {
                enabled: b('deepseek-enabled'),
                source: s('deepseek-source'),
                apiKeyEnv: s('deepseek-api-key-env'),
                apiKey: emptyToNull(s('deepseek-api-key')),
            },
            kimi: {
                enabled: b('kimi-enabled'),
                apiKeyEnv: s('kimi-api-key-env'),
                apiKey: emptyToNull(s('kimi-api-key')),
            },
            opencode: {
                enabled: b('opencode-enabled'),
                apiKeyEnv: s('opencode-api-key-env'),
                apiKey: emptyToNull(s('opencode-api-key')),
                baseUrl: s('opencode-base-url').replace(/\/+$/, ''),
            },
        },
    };
}

export function anthropicCredsPath(snapshot) {
    return snapshot.vendors.anthropic.credentialsPath ?? defaultCredsPath();
}

export function codexAuthPath(snapshot) {
    return snapshot.vendors.openai.codexAuthPath ?? defaultAuthPath();
}
