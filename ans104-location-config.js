/**
 * Parse REQUIRE_ANS104_LOCATION. Missing/blank values default to the safe
 * behavior (required). Invalid values fail server startup rather than silently
 * weakening ANS-104 verification.
 */
export function parseRequireAns104Location(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return true;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;

    throw new Error(
        `Nederīga REQUIRE_ANS104_LOCATION vērtība: "${value}". Atļautas tikai true vai false.`
    );
}
