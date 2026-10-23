import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run inside the actual backup-platform repository.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const backupRoot = root;
export const backupSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

export function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Avotā nav atrasta sākuma atzīme: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Avotā nav atrasta beigu atzīme: ${endMarker}`);
  return source.slice(start, end).trim();
}

export const AR_ID = 'A'.repeat(43);
export const ZIP_ID = 'B'.repeat(43);

export const validManifest = () => ({
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
  archive: { id: ZIP_ID }
});

export function makeBackupValidator() {
  const source = extractBetween(
    backupSource,
    'function validateManifest(manifest) {',
    '\nasync function '
  );
  return new Function('validateArweaveId', 'MAX_MANIFEST_BYTES', `return (${source});`)(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    10 * 1024 * 1024
  );
}
