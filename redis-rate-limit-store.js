export class UpstashRateLimitStore {
    constructor(redisClient, prefix, windowMs) {
        this.redis = redisClient;
        this.prefix = prefix;
        this.windowMs = windowMs;
    }

    init(options) {
        if (Number.isFinite(options?.windowMs) && options.windowMs > 0) this.windowMs = options.windowMs;
    }

    async increment(key) {
        const windowSeconds = Math.max(1, Math.ceil(this.windowMs / 1000));
        const redisKey = `${this.prefix}:${key}`;
        const result = await this.redis.eval(`
            local hits = redis.call('INCR', KEYS[1])
            local ttl = redis.call('TTL', KEYS[1])
            if hits == 1 or ttl < 0 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
                ttl = ARGV[1]
            end
            return { hits, ttl }
        `, [redisKey], [String(windowSeconds)]);
        const totalHits = Number(result?.[0]);
        const ttlSeconds = Number(result?.[1]);
        if (!Number.isFinite(totalHits) || !Number.isFinite(ttlSeconds)) {
            throw new Error('Redis rate-limit atbilde nav derīga.');
        }
        return {
            totalHits,
            resetTime: new Date(Date.now() + Math.max(0, ttlSeconds) * 1000)
        };
    }

    async decrement(key) {
        await this.redis.eval(`
            local current = redis.call('GET', KEYS[1])
            if not current then return 0 end
            if tonumber(current) <= 1 then return redis.call('DEL', KEYS[1]) end
            return redis.call('DECR', KEYS[1])
        `, [`${this.prefix}:${key}`], []);
    }

    async resetKey(key) {
        await this.redis.del(`${this.prefix}:${key}`);
    }

    async shutdown() {}
}
