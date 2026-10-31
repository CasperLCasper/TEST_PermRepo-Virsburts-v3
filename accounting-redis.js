// accounting-redis.js
// Redis tiek izmantots:
// 1. Express session datiem (server.js izmanto prefiksu permrepo:session:);
// 2. backup job stāvoklim;
// 3. izkliedētajai job slēdzenei.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

let redis = null;

const DEFAULT_JOB_TTL = Number(process.env.JOB_TTL_SECONDS || 86400);
const COMPLETED_JOB_TTL = Number(process.env.COMPLETED_JOB_TTL_SECONDS || 30 * 24 * 60 * 60);
const FAILED_JOB_TTL = Number(process.env.FAILED_JOB_TTL_SECONDS || 90 * 24 * 60 * 60);
const ACTIVE_JOB_TTL = Number(process.env.ACTIVE_JOB_TTL_SECONDS || 7 * 24 * 60 * 60);
const JOB_LOCK_TTL = Number(process.env.JOB_LOCK_TTL_SECONDS || 600);

function jobKey(jobId) {
    return `permrepo:job:${jobId}`;
}

function jobLockKey(jobId) {
    return `permrepo:joblock:${jobId}`;
}

function jobOwnerLookupKey(job) {
    const githubUserId = String(job?.githubUserId || '');
    const repositoryId = String(job?.githubRepositoryId || '');
    const walletAddress = String(job?.walletAddress || '').toLowerCase();

    if (!/^\d+$/.test(githubUserId) || !/^\d+$/.test(repositoryId) ||
        !/^0x[0-9a-f]{40}$/.test(walletAddress)) {
        return null;
    }

    return `permrepo:job-owner:${githubUserId}:${repositoryId}:${walletAddress}`;
}

async function writeJobOwnerLookup(client, jobId, job, ttl) {
    const key = jobOwnerLookupKey(job);
    if (!key) return;

    if (job.status === 'completed') {
        const current = await client.get(key);
        if (String(current || '') === String(jobId)) await client.del(key);
        return;
    }

    if (ttl > 0) {
        await client.set(key, jobId, { ex: ttl });
    } else {
        await client.set(key, jobId);
    }
}

export async function findJobByOwner(githubUserId, repositoryId, walletAddress) {
    const client = requireRedis();
    const userId = String(githubUserId || '');
    const repoId = String(repositoryId || '');
    const wallet = String(walletAddress || '').toLowerCase();

    if (!/^\d+$/.test(userId) || !/^\d+$/.test(repoId) ||
        !/^0x[0-9a-f]{40}$/.test(wallet)) {
        throw new Error('Nederīgi backup darba meklēšanas parametri.');
    }

    try {
        const jobId = await client.get(`permrepo:job-owner:${userId}:${repoId}:${wallet}`);
        if (!jobId) return null;

        const job = await getJob(String(jobId));
        if (!job || job.status === 'completed') {
            await client.del(`permrepo:job-owner:${userId}:${repoId}:${wallet}`);
            return null;
        }

        return job;
    } catch (error) {
        console.error('Redis job owner lookup kļūda:', error);
        throw new Error('Backup darba meklēšana Redis neizdevās.');
    }
}

// -----------------------------------------------------------------------------
// TTL noteikšana pēc job stāvokļa
// -----------------------------------------------------------------------------

/**
 * Nosaka TTL sekundes, ņemot vērā job statusu un vai tam ir neatrisināta
 * blockchain transakcija. Neveiksmīgi darbi ar neatrisinātu backupTxHash
 * netiek automātiski dzēsti — tie ir vienīgais pierādījums par iespējamo
 * on-chain stāvokli.
 */
export function resolveJobTtl(job, fallbackTtl = DEFAULT_JOB_TTL) {
    const status = job?.status;

    if (status === 'completed') {
        return COMPLETED_JOB_TTL;
    }

    if (status === 'failed') {
        if (typeof job?.backupTxHash === 'string' && job.backupTxHash.length > 0) {
            // Neatrisināta blockchain transakcija — neļauj automātiski dzēst.
            return 0;
        }
        return FAILED_JOB_TTL;
    }

    if (
        status === 'prepared' ||
        status === 'zip-uploading' ||
        status === 'zip-uploaded' ||
        status === 'manifest-uploading' ||
        status === 'manifest-uploaded' ||
        status === 'blockchain-finalizing'
    ) {
        return ACTIVE_JOB_TTL > 0 ? ACTIVE_JOB_TTL : fallbackTtl;
    }

    return fallbackTtl;
}

// -----------------------------------------------------------------------------
// State machine validācija
// -----------------------------------------------------------------------------

const VALID_JOB_STATUSES = [
    'prepared',
    'zip-uploading',
    'zip-uploaded',
    'manifest-uploading',
    'manifest-uploaded',
    'blockchain-finalizing',
    'completed',
    'failed'
];

// ✅ I17: blockchain-finalizing var atgriezties pie manifest-uploaded,
// ja blockchain transakcija tika iekļauta blokā, bet neizdevās (receipt.status !== 1).
// Tas ļauj lietotājam mēģināt vēlreiz bez jauna ZIP/manifesta augšupielādes.
const VALID_TRANSITIONS = {
    'prepared': ['zip-uploading', 'failed'],
    'zip-uploading': ['zip-uploaded', 'failed'],
    'zip-uploaded': ['manifest-uploading', 'failed'],
    'manifest-uploading': ['manifest-uploaded', 'failed'],
    'manifest-uploaded': ['blockchain-finalizing', 'failed'],
    'blockchain-finalizing': ['completed', 'failed', 'manifest-uploaded'], // ✅ I17
    'completed': [],
    'failed': [
        'prepared',
        'zip-uploaded',
        'manifest-uploading',
        'manifest-uploaded'
    ]
};

/**
 * Validē state pāreju
 */
export function validateStateTransition(currentStatus, newStatus) {
    if (!VALID_JOB_STATUSES.includes(currentStatus)) {
        throw new Error(
            `Nederīgs pašreizējais status: ${currentStatus}`
        );
    }

    if (!VALID_JOB_STATUSES.includes(newStatus)) {
        throw new Error(
            `Nederīgs jaunais status: ${newStatus}`
        );
    }

    if (currentStatus === newStatus) {
        return true;
    }

    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
        throw new Error(
            `Nederīga state pāreja: ${currentStatus} → ${newStatus}. ` +
            `Atļautās: ${allowed.join(', ') || 'nav'}`
        );
    }

    return true;
}

// -----------------------------------------------------------------------------
// Redis inicializācija
// -----------------------------------------------------------------------------

export function initRedis() {
    if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN
        });
        console.log('✅ Redis inicializēts | Redis is initialized');
    } else if (!redis) {
        console.log('⚠️ Redis nav konfigurēts | Redis is not configured');
    }

    return redis;
}

export function getRedis() {
    return redis;
}

function requireRedis() {
    if (!redis) {
        throw new Error(
            'Redis nav konfigurēts. PermRepo operācija nav pieejama.'
        );
    }

    return redis;
}

// -----------------------------------------------------------------------------
// Lua skripti atomiskām operācijām
// -----------------------------------------------------------------------------

// Atomiski atjaunina job JSON, ja versija sakrīt. Ja versija nesakrīt,
// atgriež 0 un klients mēģina vēlreiz pēc svaigas nolasīšanas.
const UPDATE_JOB_LUA = `
local key = KEYS[1]
local expectedVersion = tonumber(ARGV[1])
local nextJson = ARGV[2]
local ttl = tonumber(ARGV[3])
local currentRaw = redis.call("GET", key)
if not currentRaw then
    return -1
end
local ok, current = pcall(cjson.decode, currentRaw)
if not ok then
    return -2
end
local currentVersion = tonumber(current["version"] or 0)
if currentVersion ~= expectedVersion then
    return 0
end
if ttl > 0 then
    redis.call("SET", key, nextJson, "EX", ttl)
else
    redis.call("SET", key, nextJson)
end
return 1
`;

// Atomiski atjaunina job JSON tikai tad, ja slēdzenes īpašnieks sakrīt.
// Tas novērš situāciju, kur zaudētas slēdzenes dēļ kāds cits process jau
// raksta job stāvokli, bet mēs to pārrakstām.
const UPDATE_JOB_LOCKED_LUA = `
local jobKey = KEYS[1]
local lockKey = KEYS[2]
local expectedVersion = tonumber(ARGV[1])
local nextJson = ARGV[2]
local ttl = tonumber(ARGV[3])
local lockToken = ARGV[4]
local currentLock = redis.call("GET", lockKey)
if currentLock ~= lockToken then
    return -3
end
local currentRaw = redis.call("GET", jobKey)
if not currentRaw then
    return -1
end
local ok, current = pcall(cjson.decode, currentRaw)
if not ok then
    return -2
end
local currentVersion = tonumber(current["version"] or 0)
if currentVersion ~= expectedVersion then
    return 0
end
if ttl > 0 then
    redis.call("SET", jobKey, nextJson, "EX", ttl)
else
    redis.call("SET", jobKey, nextJson)
end
return 1
`;

// -----------------------------------------------------------------------------
// Job operācijas
// -----------------------------------------------------------------------------

export async function createJob(
    jobId,
    job,
    ttlSeconds = null
) {
    const client = requireRedis();

    if (
        typeof jobId !== 'string' ||
        !/^[a-f0-9-]{20,100}$/i.test(jobId)
    ) {
        throw new Error('Nederīgs jobId.');
    }

    if (
        !job ||
        typeof job !== 'object' ||
        Array.isArray(job)
    ) {
        throw new Error('Nederīgi job dati.');
    }

    if (
        !job.status ||
        !VALID_JOB_STATUSES.includes(job.status)
    ) {
        throw new Error(
            `Nederīgs job status: ${job.status}`
        );
    }

    const ttl = Number(
        ttlSeconds !== null && ttlSeconds !== undefined
            ? ttlSeconds
            : resolveJobTtl(job)
    );

    if (
        !Number.isInteger(ttl) ||
        ttl <= 0
    ) {
        throw new Error('Nederīgs job TTL.');
    }

    const key = jobKey(jobId);

    const stored = {
        ...job,
        version: Number.isInteger(job.version) ? job.version : 0
    };

    try {
        const result = await client.set(
            key,
            JSON.stringify(stored),
            {
                nx: true,
                ex: ttl
            }
        );

        if (result !== 'OK') {
            throw new Error(
                'Job ar šādu ID jau eksistē.'
            );
        }

        try {
            await writeJobOwnerLookup(client, jobId, stored, ttl);
        } catch (indexError) {
            // The job record is authoritative; the owner index is a recovery
            // accelerator and may be rebuilt when the job is next read.
            console.error('Redis job owner lookup izveide neizdevās:', indexError);
        }
        return true;
    } catch (error) {
        console.error(
            'Redis createJob kļūda:',
            error
        );

        throw new Error(
            'Backup job izveide neizdevās.'
        );
    }
}

export async function getJob(jobId) {
    const client = requireRedis();

    if (
        typeof jobId !== 'string' ||
        !/^[a-f0-9-]{20,100}$/i.test(jobId)
    ) {
        throw new Error('Nederīgs jobId.');
    }

    try {
        const value =
            await client.get(
                jobKey(jobId)
            );

        if (!value) {
            return null;
        }

        const job = typeof value === 'object'
            ? value
            : JSON.parse(String(value));

        // Backfill the owner index for jobs created before Redis-first recovery
        // was deployed. The job record remains the source of truth.
        try {
            await writeJobOwnerLookup(client, jobId, job, resolveJobTtl(job));
        } catch (indexError) {
            console.error('Redis job owner lookup backfill neizdevās:', indexError);
        }

        return job;
    } catch (error) {
        console.error(
            'Redis getJob kļūda:',
            error
        );

        throw new Error(
            'Backup job nolasīšana neizdevās.'
        );
    }
}

/**
 * Atomisks updateJob ar optimistisku concurrency kontroli.
 *
 * Ja padots lockToken, atjauninājums notiek tikai tad, ja Redis slēdzenē
 * joprojām ir tas pats token. Tas novērš stāvokļa pārrakstīšanu pēc
 * slēdzenes zaudēšanas.
 *
 * Ja lockToken nav padots, atjauninājums joprojām ir atomisks (pārbauda
 * versiju), bet ne pārbauda slēdzeni.
 */
export async function updateJob(
    jobId,
    patch,
    ttlSeconds = null,
    options = {}
) {
    const client = requireRedis();

    if (
        !patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch)
    ) {
        throw new Error(
            'Nederīgs job patch.'
        );
    }

    const lockToken =
        typeof options?.lockToken === 'string' && options.lockToken.length > 0
            ? options.lockToken
            : null;

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const current = await getJob(jobId);

            if (!current) {
                throw new Error(
                    'Backup job nav atrasts.'
                );
            }

            if (patch.status && patch.status !== current.status) {
                if (
                    patch.status === 'failed' &&
                    current.status === 'blockchain-finalizing' &&
                    current.backupTxHash
                ) {
                    throw new Error(
                        'Blockchain transaction exists — recovery required, not failed.'
                    );
                }

                validateStateTransition(current.status, patch.status);
            }

            const currentVersion = Number.isInteger(current.version)
                ? current.version
                : 0;

            const next = {
                ...current,
                ...patch,
                version: currentVersion + 1,
                updatedAt: Date.now()
            };

            const ttl = Number(
                ttlSeconds !== null && ttlSeconds !== undefined
                    ? ttlSeconds
                    : resolveJobTtl(next)
            );

            if (ttl < 0) {
                throw new Error('Nederīgs job TTL.');
            }

            const nextJson = JSON.stringify(next);

            let result;
            if (lockToken) {
                result = await client.eval(
                    UPDATE_JOB_LOCKED_LUA,
                    [jobKey(jobId), jobLockKey(jobId)],
                    [String(currentVersion), nextJson, String(ttl), lockToken]
                );
            } else {
                result = await client.eval(
                    UPDATE_JOB_LUA,
                    [jobKey(jobId)],
                    [String(currentVersion), nextJson, String(ttl)]
                );
            }

            if (result === 1) {
                try {
                    await writeJobOwnerLookup(client, jobId, next, ttl);
                } catch (indexError) {
                    console.error('Redis job owner lookup atjaunošana neizdevās:', indexError);
                }
                return next;
            }

            if (result === -1) {
                throw new Error('Backup job nav atrasts.');
            }

            if (result === -3) {
                throw new Error('Job slēdzene vairs nepieder mums.');
            }

            if (result === 0) {
                // Versija mainījusies starp nolasīšanu un rakstīšanu.
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    continue;
                }
                throw new Error('Job versija mainījās — atjauninājums neizdevās.');
            }

            throw new Error('Neizdevās atjaunināt job stāvokli.');
        } catch (error) {
            lastError = error;

            if (
                error.message &&
                (error.message.includes('Nederīga state pāreja') ||
                 error.message.includes('Backup job nav atrasts') ||
                 error.message.includes('recovery required') ||
                 error.message.includes('vairs nepieder mums') ||
                 error.message.includes('Nederīgs job TTL'))
            ) {
                throw error;
            }

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    throw lastError || new Error('updateJob neizdevās pēc vairākiem mēģinājumiem.');
}

// -----------------------------------------------------------------------------
// Job lock ar heartbeat
// -----------------------------------------------------------------------------

export async function acquireJobLock(
    jobId,
    ttlSeconds = JOB_LOCK_TTL
) {
    const client = requireRedis();

    if (
        typeof jobId !== 'string' ||
        !/^[a-f0-9-]{20,100}$/i.test(jobId)
    ) {
        throw new Error(
            'Nederīgs jobId.'
        );
    }

    const key =
        jobLockKey(jobId);

    const token =
        crypto.randomUUID();

    const ttl =
        Number(ttlSeconds);

    if (
        !Number.isInteger(ttl) ||
        ttl <= 0
    ) {
        throw new Error(
            'Nederīgs job lock TTL.'
        );
    }

    try {
        const result =
            await client.set(
                key,
                token,
                {
                    nx: true,
                    ex: ttl
                }
            );

        if (result === 'OK') {
            return token;
        }

        return null;
    } catch (error) {
        console.error(
            'Redis job lock iegūšanas kļūda:',
            error
        );

        throw new Error(
            'Redis job slēdzeni nevar iegūt.'
        );
    }
}

export async function extendJobLock(
    jobId,
    token,
    ttlSeconds = JOB_LOCK_TTL
) {
    const client = requireRedis();

    if (
        typeof token !== 'string' ||
        token.length === 0
    ) {
        return false;
    }

    const key = jobLockKey(jobId);

    const ttl = Number(ttlSeconds);

    if (
        !Number.isInteger(ttl) ||
        ttl <= 0
    ) {
        throw new Error('Nederīgs job lock TTL.');
    }

    const script = `
        local current = redis.call("GET", KEYS[1])
        if current == ARGV[1] then
            redis.call("EXPIRE", KEYS[1], ARGV[2])
            return 1
        end
        return 0
    `;

    try {
        const result = await client.eval(
            script,
            [key],
            [token, ttl.toString()]
        );

        return result === 1;
    } catch (error) {
        console.error(
            'Redis job lock pagarināšanas kļūda:',
            error
        );
        return false;
    }
}

export async function releaseJobLock(
    jobId,
    token
) {
    const client =
        requireRedis();

    if (
        typeof token !== 'string' ||
        token.length === 0
    ) {
        return;
    }

    const key =
        jobLockKey(jobId);

    const script = `
        local current = redis.call("GET", KEYS[1])
        if current == ARGV[1] then
            redis.call("DEL", KEYS[1])
            return 1
        end
        return 0
    `;

    try {
        await client.eval(
            script,
            [key],
            [token]
        );
    } catch (error) {
        console.error(
            'Redis job lock atbrīvošanas kļūda:',
            error
        );
    }
}

// -----------------------------------------------------------------------------
// Eksporti
// -----------------------------------------------------------------------------

export {
    VALID_JOB_STATUSES,
    VALID_TRANSITIONS,
    DEFAULT_JOB_TTL,
    COMPLETED_JOB_TTL,
    FAILED_JOB_TTL,
    ACTIVE_JOB_TTL,
    JOB_LOCK_TTL
};
