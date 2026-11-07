export function normalizeRepositoryId(repositoryId) {
    const raw = String(repositoryId ?? '').trim();
    if (!/^\d+$/.test(raw)) throw new Error('Nederīgs GitHub repo ID.');
    const value = BigInt(raw);
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Nederīgs GitHub repo ID.');
    return value.toString();
}
