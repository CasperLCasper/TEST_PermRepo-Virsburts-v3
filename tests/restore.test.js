import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreSource, validManifest, makeRestoreValidator } from './helpers.js';

const validateManifestStructure = makeRestoreValidator();

test('R01 — nederīga manifesta pamata struktūra tiek noraidīta', () => {
  assert.throws(() => validateManifestStructure({}));
});

test('R02 — keyVerifier formāts tiek validēts kā 0x + 64 heksadecimāli simboli', () => {
  const manifest = validManifest();
  manifest.encryption.keyVerifier = 'not-hex';
  assert.throws(() => validateManifestStructure(manifest),
    'Nederīgam keyVerifier formātam jābūt noraidītam struktūras validācijā.');
});

test('R03 — Master Key pārbaude notiek pirms ZIP atšifrēšanas cikla', () => {
  const keyCheck = restoreSource.indexOf('const keyIsValid = await verifyMasterKey(');
  const zipLoop = restoreSource.indexOf('for (const zipId of zipIds)', keyCheck);
  assert.ok(keyCheck >= 0, 'Nav atrasta neatkarīgā Master Key pārbaude.');
  assert.ok(zipLoop > keyCheck, 'ZIP cikls nedrīkst sākties pirms Master Key pārbaudes.');
});

test('R04 — viena ZIP kļūme tiek reģistrēta, nevis uzreiz pārtrauc visu atjaunošanu', () => {
  const zipLoop = restoreSource.indexOf('for (const zipId of zipIds)');
  assert.ok(zipLoop >= 0, 'Nav atrasts ZIP apstrādes cikls.');
  const section = restoreSource.slice(zipLoop, zipLoop + 12000);
  assert.match(section, /failedZipIds\.add\(zipId\)/,
    'Nav atrasta kļūdainā ZIP reģistrēšana turpmākai pārējo ZIP apstrādei.');
});

test('R05 — restore atbalsta norādītā vēsturiskā manifesta on-chain pārbaudi', () => {
  assert.match(restoreSource, /async function verifyManifestOnChain\(requestedManifestId, requestedManifest\)/);
  assert.match(restoreSource, /requestedManifestId === latestId/);
  assert.match(restoreSource, /matchingEvents\.length !== 1/);
});

test('R06 — manifests ar norādītu Merkle root tiek salīdzināts ar on-chain notikumu', () => {
  assert.match(restoreSource, /requestedManifest\.merkleRoot\s*\?\?/);
  assert.match(restoreSource, /normalizedManifestRoot !== eventMerkleRoot/);
});
