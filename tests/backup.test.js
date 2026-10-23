import test from 'node:test';
import assert from 'node:assert/strict';
import { backupSource, validManifest, ZIP_ID, AR_ID, makeBackupValidator, extractBetween } from './helpers.js';

const validateManifest = makeBackupValidator();

test('B01 — derīgs manifests tiek pieņemts', () => {
  assert.equal(validateManifest(validManifest()), true);
});

test('B02 — manifests ar ../ ceļu tiek noraidīts', () => {
  const manifest = validManifest();
  manifest.paths = { '../outside.txt': { zipId: ZIP_ID, hash: 'a'.repeat(64) } };
  assert.throws(() => validateManifest(manifest));
});

test('B03 — nepareiza SHA-256 kontrolsumma tiek noraidīta', () => {
  const manifest = validManifest();
  manifest.paths['README.md'].hash = 'not-a-hash';
  assert.throws(() => validateManifest(manifest));
});

test('B04 — nederīgs AES-GCM IV tiek noraidīts', () => {
  const manifest = validManifest();
  manifest.encryption.ivs[ZIP_ID] = [1, 2, 3];
  assert.throws(() => validateManifest(manifest));
});

test('B05 — nederīgs repositoryId tiek noraidīts', () => {
  const manifest = validManifest();
  manifest.metadata.repositoryId = '0';
  assert.throws(() => validateManifest(manifest));
});

test('B06 — save-manifest-tx sasaista manifesta repositoryId ar konkrēto backup job', () => {
  const start = backupSource.indexOf("app.post('/api/save-manifest-tx'");
  assert.notEqual(start, -1, 'Nav atrasts /api/save-manifest-tx maršruts.');
  const end = backupSource.indexOf('app.post(', start + 10);
  const route = backupSource.slice(start, end === -1 ? undefined : end);
  const hasBinding = /manifest\.metadata\??\.repositoryId\s*===?\s*job\.githubRepositoryId/.test(route) ||
    /job\.githubRepositoryId\s*===?\s*manifest\.metadata\??\.repositoryId/.test(route);
  assert.equal(hasBinding, true,
    'Nav atrasta pārbaude, ka manifest.metadata.repositoryId atbilst job.githubRepositoryId.');
});

test('B07 — iepriekšējais manifests tiek validēts pirms tā izmantošanas', async () => {
  const previousSource = extractBetween(
    backupSource,
    'async function loadPreviousManifest(lastManifest) {',
    '\nconst NFT_ABI'
  );
  let validationCalls = 0;
  const loadPreviousManifest = new Function(
    'validateArweaveId', 'getValidatedManifestUrl', 'fetch', 'AbortSignal', 'console', 'errorMessage', 'validateManifest',
    `return (${previousSource});`
  )(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    id => `https://gateway.invalid/raw/${id}`,
    async () => ({ ok: true, json: async () => ({ manifest: 'incomplete' }) }),
    { timeout: () => undefined },
    { warn() {} },
    String,
    () => { validationCalls++; }
  );
  const result = await loadPreviousManifest(`ar://${AR_ID}`);
  assert.ok(result === null || validationCalls > 0,
    'Iepriekšējais manifests tiek atgriezts bez pilnas validateManifest pārbaudes.');
});
