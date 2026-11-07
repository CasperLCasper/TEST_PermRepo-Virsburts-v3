import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRecordCodec } from '../session-crypto.js';

test('session record encryption round-trips and does not store the GitHub token in plaintext', () => {
    const codec = createSessionRecordCodec('test-session-secret-with-more-than-32-characters');
    const session = {
        githubToken: 'gho_secret_access_token_value',
        githubUser: 'example-user',
        githubUserId: 123456
    };
    const encrypted = codec.encryptSessionRecord(session);
    assert.equal(typeof encrypted, 'string');
    assert.equal(encrypted.includes(session.githubToken), false);
    assert.deepEqual(codec.decryptSessionRecord(encrypted), {
        sessionData: session,
        legacyPlaintext: false
    });
});

test('session record encryption rejects tampering', () => {
    const codec = createSessionRecordCodec('test-session-secret-with-more-than-32-characters');
    const encrypted = JSON.parse(codec.encryptSessionRecord({ githubToken: 'secret' }));
    encrypted.data = Buffer.from('tampered').toString('base64');
    assert.throws(() => codec.decryptSessionRecord(JSON.stringify(encrypted)));
});

test('session record codec rejects legacy plaintext sessions and unknown formats', () => {
    const codec = createSessionRecordCodec('test-session-secret-with-more-than-32-characters');
    const legacy = { githubToken: 'legacy-token', githubUserId: 42 };
    assert.throws(() => codec.decryptSessionRecord(JSON.stringify(legacy)), /formāts nav atbalstīts/);
    assert.throws(() => codec.decryptSessionRecord(JSON.stringify({ format: 'unknown-v2', data: 'x' })), /formāts nav atbalstīts/);
});
