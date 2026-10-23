import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The tests are intended to be copied into the actual backup-platform repository.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const backupSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

export function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Avotā nav atrasta sākuma atzīme: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Avotā nav atrasta beigu atzīme: ${endMarker}`);
  return source.slice(start, end).trim();
}

export function routeSource(routeMarker) {
  const start = backupSource.indexOf(routeMarker);
  if (start < 0) throw new Error(`Avotā nav atrasts maršruts: ${routeMarker}`);
  const next = backupSource.indexOf("app.post(", start + routeMarker.length);
  const nextGet = backupSource.indexOf("app.get(", start + routeMarker.length);
  const ends = [next, nextGet].filter(n => n >= 0);
  const end = ends.length ? Math.min(...ends) : backupSource.length;
  return backupSource.slice(start, end);
}

export const AR_ID = 'A'.repeat(43);
export const ZIP_ID = 'B'.repeat(43);
export const OTHER_ZIP_ID = 'C'.repeat(43);

export const validManifest = (overrides = {}) => ({
  manifest: 'arweave/paths',
  version: '0.2.0',
  metadata: { repo: 'test/repo', repositoryId: 1421380729 },
  encryption: {
    algorithm: 'AES-GCM',
    kdf: 'HKDF-SHA-256',
    version: 1,
    keyVerifier: `0x${'c'.repeat(64)}`,
    ivs: { [ZIP_ID]: Array(12).fill(7) }
  },
  paths: { 'README.md': { zipId: ZIP_ID, hash: 'a'.repeat(64) } },
  archive: { id: ZIP_ID },
  ...overrides
});

export function makeBackupValidator(source = backupSource) {
  const fn = extractBetween(source, 'function validateManifest(manifest) {', '\nasync function verifyJobAuthorization');
  return new Function('validateArweaveId', 'MAX_MANIFEST_BYTES', 'Buffer', `return (${fn});`)(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    10 * 1024 * 1024,
    Buffer
  );
}

export function extractB06Guard(source = backupSource) {
  const startMarker = '// B06: piesaista manifestu tieši GitHub repozitorijam,';
  const endMarker = '\n            if (!job.zipTxId)';
  const guard = extractBetween(source, startMarker, endMarker);
  return new Function('manifest', 'job', `${guard}\nreturn true;`);
}

export function makePreviousManifestLoader({ source = backupSource, fetchImpl, validateManifest, warnings = [] } = {}) {
  const fn = extractBetween(source, 'async function loadPreviousManifest(lastManifest) {', '\nconst NFT_ABI');
  const fakeFetch = fetchImpl ?? (async () => ({ ok: true, json: async () => validManifest() }));
  const validator = validateManifest ?? makeBackupValidator(source);
  return new Function(
    'validateArweaveId', 'getValidatedManifestUrl', 'fetch', 'AbortSignal', 'console', 'errorMessage', 'validateManifest',
    `return (${fn});`
  )(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    id => `https://gateway.invalid/raw/${id}`,
    fakeFetch,
    { timeout: () => undefined },
    { warn: (...args) => warnings.push(args) },
    error => error instanceof Error ? error.message : String(error),
    validator
  );
}
