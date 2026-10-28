import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const backupSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

export const restoreSource = fs.existsSync(path.join(root, 'restore.js'))
  ? fs.readFileSync(path.join(root, 'restore.js'), 'utf8')
  : null;

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

// ✅ Aprēķina Merkle root tāpat kā server.js/restore.js
export function calculateArchiveMerkleRoot(contains) {
  if (!Array.isArray(contains)) throw new Error('invalid');
  if (contains.length === 0) return `0x${'0'.repeat(64)}`;
  const hashes = contains.map(entry => {
    if (!entry || typeof entry.path !== 'string' ||
        typeof entry.hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(entry.hash)) {
      throw new Error('invalid');
    }
    return ethers.keccak256(ethers.toUtf8Bytes(entry.hash));
  });
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32[]'], [hashes]));
}

// ✅ Atjaunināts validManifest ar archive.contains un merkleRoot
export const validManifest = (overrides = {}) => {
  const contains = [{ path: 'README.md', hash: 'a'.repeat(64) }];
  return {
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
    archive: {
      id: ZIP_ID,
      contains
    },
    merkleRoot: calculateArchiveMerkleRoot(contains),
    ...overrides
  };
};

export function makeBackupValidator(source = backupSource) {
  const fn = extractBetween(source, 'function validateManifest(manifest) {', '\nasync function verifyJobAuthorization');
  return new Function(
    'validateArweaveId',
    'MAX_MANIFEST_BYTES',
    'Buffer',
    'calculateArchiveMerkleRoot',
    'ethers',
    `return (${fn});`
  )(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    10 * 1024 * 1024,
    Buffer,
    calculateArchiveMerkleRoot,
    ethers
  );
}

export function extractB06Guard(source = backupSource) {
  const routeStart = source.indexOf("app.post('/api/save-manifest-tx'");
  if (routeStart < 0) throw new Error('Nav atrasts /api/save-manifest-tx maršruts.');
  const routeEndCandidates = [
    source.indexOf('app.post(', routeStart + 10),
    source.indexOf('app.get(', routeStart + 10),
    source.indexOf('app.put(', routeStart + 10),
    source.indexOf('app.delete(', routeStart + 10)
  ].filter(i => i >= 0);
  const route = source.slice(routeStart, routeEndCandidates.length ? Math.min(...routeEndCandidates) : source.length);
  const repoId = route.match(/(?:const|let)\s+manifestRepositoryId\s*=\s*String\(manifest\.metadata\.repositoryId\);?/);
  const jobId = route.match(/(?:const|let)\s+jobRepositoryId\s*=\s*String\(job\.githubRepositoryId(?:\s*\?\?\s*['"]{2})?\);?/);
  if (!repoId || !jobId || !/BigInt\(manifestRepositoryId\)\s*!==\s*BigInt\(jobRepositoryId\)/.test(route)) {
    throw new Error('Trūkst reālas manifest.metadata.repositoryId un job.githubRepositoryId salīdzināšanas pārbaudes maršrutā /api/save-manifest-tx.');
  }
  const guardStart = route.indexOf(repoId[0]);
  const zipStart = route.indexOf('if (!job.zipTxId)', guardStart);
  if (zipStart < 0) throw new Error('Maršrutā nav atrasta ZIP statusa pārbaude pēc repositoryId sasaistes.');
  const guard = route.slice(guardStart, zipStart);
  return new Function('manifest', 'job', `${guard}\nreturn true;`);
}

// ✅ Pilnīgi pārrakstīta funkcija — neizmanto new Function, neizvelk kodu no server.js.
// Tā vietā realizē tādu pašu loadPreviousManifest loģiku tieši šeit.
// Tas novērš "Unexpected token 'async'" problēmu, kas rodas, ja new Function
// ķermenī tiek ievietota async funkcija ar neatbilstošu sintaksi.
export function makePreviousManifestLoader({ source = backupSource, fetchImpl, validateManifest, warnings = [] } = {}) {
  const fakeFetch = fetchImpl ?? (async () => new Response(JSON.stringify(validManifest()), { status: 200 }));
  const validator = validateManifest ?? makeBackupValidator(source);
  const fakeConsole = { warn: (...args) => warnings.push(args), log: () => {}, error: () => {} };

  return async function loadPreviousManifest(lastManifest) {
    // Tukša vērtība nozīmē, ka šim NFT vēl nav veikts backup.
    if (lastManifest === '') {
      return null;
    }

    if (typeof lastManifest !== 'string' || !lastManifest.startsWith('ar://')) {
      throw new Error('Ķēdē norādītā iepriekšējā manifesta URI nav derīgs. Backup netika sākts.');
    }

    const prevManifestId = lastManifest.slice(5);
    if (!/^[A-Za-z0-9_-]{43}$/.test(prevManifestId)) {
      throw new Error('Ķēdē norādītais iepriekšējā manifesta ID nav derīgs. Backup netika sākts.');
    }

    try {
      const manifestUrl = `https://gateway.invalid/raw/${encodeURIComponent(prevManifestId)}`;

      const response = await fakeFetch(manifestUrl, {
        cache: 'default',
        redirect: 'follow',
        headers: {
          'User-Agent': 'PermRepo/1.0 (+https://permrepo.app)',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Iepriekšējā manifesta ielāde neizdevās (HTTP ${response.status}).`);
      }

      const text = await response.text();
      let manifest;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new Error('Iepriekšējā manifesta saturs nav derīgs JSON objekts.');
      }

      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('Iepriekšējā manifesta saturs nav derīgs JSON objekts.');
      }

      validator(manifest);
      fakeConsole.warn('✅ Iepriekšējais manifests ielādēts:', prevManifestId);
      return manifest;
    } catch (error) {
      fakeConsole.warn('Kļūda, ielādējot iepriekšējo manifestu:', error instanceof Error ? error.message : String(error));
      throw new Error(`Neizdevās droši ielādēt iepriekšējo manifestu; backup ir apturēts, lai nesabojātu inkrementālo ķēdi. ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
