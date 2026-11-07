import crypto from 'node:crypto';

const SESSION_ENVELOPE_FORMAT = 'permrepo-session-aes-256-gcm-v1';

/**
 * Creates an authenticated session-record codec. The encryption key is
 * separated from the Express cookie-signing secret through HKDF context info.
 */
export function createSessionRecordCodec(sessionSecret) {
    const key = Buffer.from(crypto.hkdfSync(
        'sha256',
        Buffer.from(String(sessionSecret || ''), 'utf8'),
        Buffer.from('PermRepo-session-store', 'utf8'),
        Buffer.from('AES-256-GCM-v1', 'utf8'),
        32
    ));

    function encryptSessionRecord(sessionData) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const plaintext = Buffer.from(JSON.stringify(sessionData), 'utf8');
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return JSON.stringify({
            format: SESSION_ENVELOPE_FORMAT,
            iv: iv.toString('base64'),
            tag: cipher.getAuthTag().toString('base64'),
            data: ciphertext.toString('base64')
        });
    }

    function decryptSessionRecord(storedValue) {
        const parsed = typeof storedValue === 'object' && storedValue !== null
            ? storedValue
            : JSON.parse(String(storedValue));

        // Never interpret an unknown or plaintext Redis record as a legacy
        // session. A writable Redis attacker must not be able to inject an
        // authenticated-looking plaintext session.
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            parsed.format !== SESSION_ENVELOPE_FORMAT) {
            throw new Error('Redis session ieraksta formāts nav atbalstīts; nepieciešama atkārtota autorizācija.');
        }

        const isBase64 = value => typeof value === 'string' &&
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
        if (!isBase64(parsed.iv) || !isBase64(parsed.tag) || !isBase64(parsed.data)) {
            throw new Error('Redis session šifrētā ieraksta Base64 lauki nav derīgi.');
        }
        const iv = Buffer.from(parsed.iv, 'base64');
        const tag = Buffer.from(parsed.tag, 'base64');
        const ciphertext = Buffer.from(parsed.data, 'base64');
        if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0 ||
            iv.toString('base64') !== parsed.iv || tag.toString('base64') !== parsed.tag ||
            ciphertext.toString('base64') !== parsed.data) {
            throw new Error('Redis session šifrētais ieraksts ir bojāts.');
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const sessionData = JSON.parse(plaintext.toString('utf8'));
        if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
            throw new Error('Redis session saturs nav derīgs objekts.');
        }
        return { sessionData, legacyPlaintext: false };
    }

    return { encryptSessionRecord, decryptSessionRecord };
}
