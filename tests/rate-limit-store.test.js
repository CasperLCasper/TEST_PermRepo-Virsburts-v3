import test from 'node:test';
import assert from 'node:assert/strict';
import { UpstashRateLimitStore } from '../redis-rate-limit-store.js';

test('Upstash rate-limit store returns shared hit count and reset time', async () => {
    let called = false;
    const redis = {
        async eval(script, keys, args) {
            called = true;
            assert.match(script, /INCR/);
            assert.deepEqual(keys, ['permrepo:ratelimit:test:user-1']);
            assert.deepEqual(args, ['60']);
            return [3, 60];
        },
        async del() {}
    };
    const store = new UpstashRateLimitStore(redis, 'permrepo:ratelimit:test', 60_000);
    const result = await store.increment('user-1');
    assert.equal(called, true);
    assert.equal(result.totalHits, 3);
    assert.ok(result.resetTime instanceof Date);
    assert.ok(result.resetTime.getTime() > Date.now());
});

test('Upstash rate-limit store supports decrement and key reset', async () => {
    const calls = [];
    const redis = {
        async eval(script, keys) { calls.push({ script, keys }); return 1; },
        async del(key) { calls.push({ del: key }); }
    };
    const store = new UpstashRateLimitStore(redis, 'permrepo:ratelimit:test', 60_000);
    await store.decrement('user-2');
    await store.resetKey('user-2');
    assert.match(calls[0].script, /DECR/);
    assert.deepEqual(calls[0].keys, ['permrepo:ratelimit:test:user-2']);
    assert.deepEqual(calls[1], { del: 'permrepo:ratelimit:test:user-2' });
});
