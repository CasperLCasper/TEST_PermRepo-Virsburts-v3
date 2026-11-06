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

        // Backward compatibility: migrate old plaintext Redis sessions on read.
        if (parsed?.format !== SESSION_ENVELOPE_FORMAT) {
            return { sessionData: parsed, legacyPlaintext: true };
        }

        const iv = Buffer.from(String(parsed.iv || ''), 'base64');
        const tag = Buffer.from(String(parsed.tag || ''), 'base64');
        const ciphertext = Buffer.from(String(parsed.data || ''), 'base64');
        if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
            throw new Error('Redis session šifrētais ieraksts ir bojāts.');
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return { sessionData: JSON.parse(plaintext.toString('utf8')), legacyPlaintext: false };
    }

    return { encryptSessionRecord, decryptSessionRecord };
}
