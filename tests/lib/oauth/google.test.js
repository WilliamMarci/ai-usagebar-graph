import system from 'system';

import {parseKeyringSecret} from '../../../lib/oauth/google.js';
import {describe, it, assertEqual, summary} from '../../_assert.js';

describe('Antigravity keyring token parsing', () => {
    it('reads snake-case OAuth JSON', () =>
        assertEqual(parseKeyringSecret('{"access_token":"ya29.token"}'), 'ya29.token'));
    it('reads nested camel-case token profiles', () =>
        assertEqual(parseKeyringSecret('{"profile":{"token":{"accessToken":"abc"}}}'), 'abc'));
    it('reads Go-keyring base64 blobs', () =>
        assertEqual(parseKeyringSecret('eyJ0b2tlbiI6eyJhY2Nlc3NfdG9rZW4iOiJ5YTI5LmJsb2IifX0='), 'ya29.blob'));
    it('rejects unrelated keyring data', () =>
        assertEqual(parseKeyringSecret('{"password":"not-a-token"}'), ''));
});

system.exit(summary());
