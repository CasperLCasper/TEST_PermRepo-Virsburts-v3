import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepositoryId } from '../repository-id.js';

test('repository IDs are normalized to one canonical decimal key', () => {
    assert.equal(normalizeRepositoryId('123'), '123');
    assert.equal(normalizeRepositoryId('000123'), '123');
    assert.equal(normalizeRepositoryId(123), '123');
});

test('repository IDs reject scientific notation, zero, negatives and unsafe integers', () => {
    for (const value of ['1e3', '12.0', '0', '-1', '', '9007199254740992']) {
        assert.throws(() => normalizeRepositoryId(value));
    }
});
