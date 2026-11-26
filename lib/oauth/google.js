import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret?version=1';

import {loadBytesAsync} from '../cache.js';

export function defaultCredentialsPath() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'oauth_creds.json']);
}

export function defaultCredentialScopePath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'antigravity', 'credential-user-scope']);
}

const KEYRING_IDENTITIES = Object.freeze([
    // Current Go runtime (Linux Secret Service / Windows Credential Manager).
    {service: 'jetski-standalone-oauth-token', fixedUser: null},
    // Unified Antigravity runtime used by newer CLI/App builds.
    {service: 'gemini', fixedUser: 'antigravity'},
    // Early preview builds.
    {service: 'antigravity', fixedUser: null},
]);

export function defaultAntigravityTokenPath() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token']);
}

function findToken(value, depth = 0) {
    if (depth > 5 || value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value.startsWith('ya29.') ? value : '';
    if (typeof value !== 'object')
        return '';
    for (const key of ['access_token', 'accessToken', 'token']) {
        if (typeof value[key] === 'string' && value[key].trim())
            return value[key].trim();
    }
    for (const child of Object.values(value)) {
        const found = findToken(child, depth + 1);
        if (found) return found;
    }
    return '';
}

export function parseKeyringSecret(secret) {
    if (typeof secret !== 'string' || !secret.trim())
        return '';
    const raw = secret.trim();
    try { return findToken(JSON.parse(raw)); } catch (_) { /* try encoded form */ }
    try {
        const decoded = new TextDecoder().decode(GLib.base64_decode(raw));
        return findToken(JSON.parse(decoded));
    } catch (_) { return raw.startsWith('ya29.') ? raw : ''; }
}

function lookup(schema, attrs) {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, attrs, null, (_source, result) => {
            try { resolve(Secret.password_lookup_finish(result)); } catch (e) { reject(e); }
        });
    });
}

export async function readAntigravityAccessToken(scopePath = defaultCredentialScopePath(), tokenPath = defaultAntigravityTokenPath()) {
    let bytes;
    try { bytes = await loadBytesAsync(Gio.File.new_for_path(scopePath)); } catch (_) { bytes = null; }
    const username = bytes === null ? '' : new TextDecoder().decode(bytes).trim();
    const schema = new Secret.Schema('org.freedesktop.Secret.Generic', Secret.SchemaFlags.NONE, {
        service: Secret.SchemaAttributeType.STRING,
        username: Secret.SchemaAttributeType.STRING,
    });
    for (const identity of KEYRING_IDENTITIES) {
        const user = identity.fixedUser ?? username;
        if (!user) continue;
        let secret;
        try { secret = await lookup(schema, {service: identity.service, username: user}); } catch (_) { continue; }
        const token = parseKeyringSecret(secret);
        if (token) return token;
    }
    // Headless/keyring-unavailable installations use Antigravity's documented
    // composite-store file fallback.
    try {
        const fallback = await loadBytesAsync(Gio.File.new_for_path(tokenPath));
        if (fallback !== null) {
            const token = parseKeyringSecret(new TextDecoder().decode(fallback));
            if (token) return token;
        }
    } catch (_) { /* unavailable fallback */ }
    return null;
}

export async function readAccessToken(path = defaultCredentialsPath(), nowMs = Date.now()) {
    let bytes;
    try {
        bytes = await loadBytesAsync(Gio.File.new_for_path(path));
    } catch (e) {
        throw new Error(`Could not read Gemini CLI credentials at ${path}: ${e?.message ?? e}`);
    }
    if (bytes === null)
        throw new Error(`Legacy Gemini CLI credentials not found at ${path}. Sign in with Antigravity CLI, or set the configured OAuth token environment variable.`);
    let doc;
    try {
        doc = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        throw new Error(`Could not parse Gemini CLI credentials at ${path}: ${e?.message ?? e}`);
    }
    const token = doc?.access_token;
    if (typeof token !== 'string' || token.trim() === '')
        throw new Error(`Legacy Gemini CLI credentials at ${path} contain no access_token. Sign in with Antigravity CLI, or use the OAuth token environment variable.`);
    const expires = Number(doc?.expiry_date);
    if (Number.isFinite(expires) && expires <= nowMs + 60_000)
        throw new Error('The legacy Gemini CLI OAuth token is expired. Sign in with Antigravity CLI, then test again.');
    return token.trim();
}
