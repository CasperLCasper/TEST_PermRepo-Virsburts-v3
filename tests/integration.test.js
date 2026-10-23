import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { backupRoot, restoreRoot, backupSource, restoreSource } from './helpers.js';

test('I01 — testa komplektā ir backup un restore avota kopijas', () => {
  for (const file of ['server.js', 'accounting-redis.js', 'src/BackupPage.jsx']) {
    assert.equal(fs.existsSync(path.join(backupRoot, file)), true, `Trūkst backup avota kopijas: ${file}`);
  }
  for (const file of ['restore.js', 'restore.html', 'translations.js']) {
    assert.equal(fs.existsSync(path.join(restoreRoot, file)), true, `Trūkst restore avota kopijas: ${file}`);
  }
});

test('I02 — backup pusē manifests tiek validēts pirms saglabāšanas', () => {
  const routeStart = backupSource.indexOf("app.post('/api/save-manifest-tx'");
  const routeEnd = backupSource.indexOf('app.post(', routeStart + 10);
  const route = backupSource.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);
  assert.ok(route.indexOf('validateManifest(manifest)') >= 0,
    'save-manifest-tx maršrutam jāvalidē manifests pirms saglabāšanas.');
});

test('I03 — backup pusē ZIP transakcijas ID tiek sasaistīts ar manifesta archive.id', () => {
  const routeStart = backupSource.indexOf("app.post('/api/save-manifest-tx'");
  const routeEnd = backupSource.indexOf('app.post(', routeStart + 10);
  const route = backupSource.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);
  assert.match(route, /manifest\.archive\?\.id\s*!==\s*job\.zipTxId/);
});

test('I04 — restore pusē tiek pārbaudīta on-chain manifesta URI/hash informācija', () => {
  assert.match(restoreSource, /getCanonicalManifestURI\(requestedManifestId\)/);
  assert.match(restoreSource, /getManifestURIHash\(requestedManifestId\)/);
  assert.match(restoreSource, /verifyManifestOnChain\(/);
});
