import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequireAns104Location } from '../ans104-location-config.js';

test('REQUIRE_ANS104_LOCATION defaults to true when missing or blank', () => {
    assert.equal(parseRequireAns104Location(undefined), true);
    assert.equal(parseRequireAns104Location(null), true);
    assert.equal(parseRequireAns104Location(''), true);
    assert.equal(parseRequireAns104Location('   '), true);
});

test('REQUIRE_ANS104_LOCATION accepts true and false case-insensitively', () => {
    assert.equal(parseRequireAns104Location('true'), true);
    assert.equal(parseRequireAns104Location(' TRUE '), true);
    assert.equal(parseRequireAns104Location('false'), false);
    assert.equal(parseRequireAns104Location(' False '), false);
});

test('REQUIRE_ANS104_LOCATION rejects invalid values', () => {
    for (const value of ['yes', 'no', '1', '0', 'enabled', 'tru']) {
        assert.throws(() => parseRequireAns104Location(value), /REQUIRE_ANS104_LOCATION/);
    }
});
