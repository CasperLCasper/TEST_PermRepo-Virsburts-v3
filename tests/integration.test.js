import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, backupSource } from './helpers.js';

test('I01 — atrodamas backup platformas būtiskās avota mapes un faili', () => {
  for (const file of [
    'server.js',
    'accounting-redis.js',
    'src/BackupPage.jsx',
    'public/contracts/50-4-PermRepoNFT.sol',
    'public/contracts/10-PermRepo-Subscription.sol'
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `Trūkst backup platformas faila: ${file}`);
  }
});

test('I02 — save-manifest-tx validē manifestu pirms tā izmantošanas', () => {
  const routeStart = backupSource.indexOf("app.post('/api/save-manifest-tx'");
  assert.ok(routeStart >= 0, 'Nav atrasts /api/save-manifest-tx maršruts.');
  const routeEnd = backupSource.indexOf('app.post(', routeStart + 10);
  const route = backupSource.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);
  assert.ok(route.indexOf('validateManifest(manifest)') >= 0,
    'save-manifest-tx maršrutam jāvalidē manifests pirms tā saglabāšanas.');
});

test('I03 — save-manifest-tx pārbauda, ka manifesta archive.id sakrīt ar ZIP transakcijas ID', () => {
  const routeStart = backupSource.indexOf("app.post('/api/save-manifest-tx'");
  assert.ok(routeStart >= 0, 'Nav atrasts /api/save-manifest-tx maršruts.');
  const routeEnd = backupSource.indexOf('app.post(', routeStart + 10);
  const route = backupSource.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);
  assert.match(route, /manifest\.archive\?\.id\s*!==\s*job\.zipTxId/,
    'Nav atrasta manifesta archive.id un job.zipTxId sakritības pārbaude.');
});
