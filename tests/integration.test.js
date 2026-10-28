import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, backupSource, routeSource } from './helpers.js';

const manifestRoute = routeSource("app.post('/api/save-manifest-tx'");

test('I01 — backup platformas kritiskie faili atrodas repozitorijā', () => {
  for (const file of [
    'server.js', 'accounting-redis.js', 'src/BackupPage.jsx',
    'public/contracts/50-5-PermRepoNFT.sol', 'public/contracts/10-PermRepo-Subscription.sol'
  ]) assert.ok(fs.existsSync(path.join(root, file)), `Trūkst backup platformas faila: ${file}`);
});

test('I02 — save-manifest-tx validē ievadi un manifestu pirms job stāvokļa maiņas', () => {
  const inputValidation = manifestRoute.indexOf('validateJobTxInput(jobId, manifestTxId)');
  const manifestValidation = manifestRoute.indexOf('validateManifest(manifest)');
  const lock = manifestRoute.indexOf('withJobLock(jobId');
  assert.ok(inputValidation >= 0, 'Trūkst job/transakcijas ID validācijas.');
  assert.ok(manifestValidation > inputValidation, 'Manifests jāvalidē pēc ievades nolasīšanas.');
  assert.ok(lock > manifestValidation, 'Job lock/stāvokļa apstrāde sākas pirms manifesta validācijas.');
});

test('I03 — manifests tiek piesaistīts ZIP transakcijai gan parastajā, gan recovery plūsmā', () => {
  assert.match(manifestRoute, /manifest\.archive\?\.id\s*!==\s*job\.zipTxId/,
    'Trūkst archive.id un job.zipTxId sakritības pārbaudes.');
  const matches = manifestRoute.match(/manifest\.archive\?\.id\s*!==\s*job\.zipTxId/g) ?? [];
  assert.ok(matches.length >= 2, 'ZIP transakcijas pārbaudei jābūt gan recovery, gan parastajā plūsmā.');
});

test('I04 — repositoryId sasaistes pārbaude notiek pirms ZIP/manifesta stāvokļa izmaiņām', () => {
  const repoBinding = manifestRoute.indexOf('manifestRepositoryId');
  const zipRequired = manifestRoute.indexOf('if (!job.zipTxId)');
  const update = manifestRoute.indexOf('await updateJob');
  assert.ok(repoBinding >= 0, 'Nav atrasta repositoryId sasaistes pārbaude.');
  assert.ok(zipRequired > repoBinding, 'ZIP statusa pārbaude apsteidz repositoryId sasaisti.');
  assert.ok(update > repoBinding, 'Job var tikt atjaunināts pirms repositoryId sasaistes.');
});

test('I05 — manifestTx idempotence neļauj mainīt jau pabeigtu manifesta transakciju', () => {
  assert.match(manifestRoute, /job\.status\s*===\s*'manifest-uploaded'/);
  assert.match(manifestRoute, /job\.status\s*===\s*'blockchain-finalizing'/);
  assert.match(manifestRoute, /job\.status\s*===\s*'completed'/);
  assert.match(manifestRoute, /job\.manifestTxId\s*===\s*manifestTxId/);
  assert.match(manifestRoute, /Nevar mainīt manifestu pēc statusa/);
});

test('I06 — recovery no failed statusa pārbauda ZIP ID pirms atjaunošanas', () => {
  const recovery = manifestRoute.indexOf("job.status === 'failed'");
  const zipCheck = manifestRoute.indexOf('manifest.archive?.id !== job.zipTxId', recovery);
  const update = manifestRoute.indexOf("status: 'manifest-uploaded'", recovery);
  assert.ok(recovery >= 0, 'Trūkst failed job recovery plūsmas.');
  assert.ok(zipCheck > recovery && zipCheck < update, 'Recovery atjauno stāvokli pirms ZIP ID pārbaudes.');
});

test('I07 — piekļuves maršrutam ir same-origin un GitHub sesijas pārbaudes', () => {
  assert.match(manifestRoute, /assertSameOrigin\(req\)/);
  assert.match(manifestRoute, /requireGithubSession\(req, res\)/);
  assert.match(manifestRoute, /verifyJobAuthorization\(req, job\)/);
  assert.match(manifestRoute, /verifyJobNFTAuthorization/);
});

test('I08 — iepriekšējais manifests tiek validēts pirms inkrementālā backup lietošanas', () => {
  const loaderStart = backupSource.indexOf('async function loadPreviousManifest(lastManifest) {');
  const loaderEnd = backupSource.indexOf('\nconst NFT_ABI', loaderStart);
  const loader = backupSource.slice(loaderStart, loaderEnd);
  assert.match(loader, /validateManifest\(manifest\)/);
  assert.ok(loader.indexOf('validateManifest(manifest)') < loader.indexOf('return manifest'));
});

test('I09 — avots nesatur acīmredzamu servera maksājumu wallet privāto atslēgu', () => {
  assert.doesNotMatch(backupSource, /process\.env\.(?:PRIVATE_KEY|WALLET_PRIVATE_KEY)\s*\|\|\s*['"]0x[a-fA-F0-9]{64}['"]/);
  assert.match(backupSource, /MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY/,
    'Sagaidāms atsevišķs mint autorizācijas parakstītāja konfigurācijas mainīgais.');
});

test('I10 — kritiskie maršruti un galvenās aizsardzības paliek avotā', () => {
  for (const route of [
    "app.post('/api/save-manifest-tx'",
    "app.post('/api/",
    'function validateManifest(manifest)',
    'async function loadPreviousManifest(lastManifest)',
    'validateJobTxInput(jobId, manifestTxId)'
  ]) assert.ok(backupSource.includes(route), `Trūkst kritiska avota elementa: ${route}`);
});

test('I11 — recovery restores missing ZIP crypto metadata from the local journal', () => {
  const client = fs.readFileSync(path.join(root, 'src/BackupPage.jsx'), 'utf8');
  assert.match(client, /if \(!hasValidZipIv\(jobStatus\.zipIv\) && hasValidZipIv\(recoveryJournal\.zipIv\)\)\s*\{\s*jobStatus\.zipIv = recoveryJournal\.zipIv;/,
    'Trūkst derīga ZIP IV atjaunošanas no lokālā recovery žurnāla.');
  assert.match(client, /if \(jobStatus\.cryptoVersion == null && recoveryJournal\.cryptoVersion != null\)\s*\{\s*jobStatus\.cryptoVersion = recoveryJournal\.cryptoVersion;/,
    'Trūkst cryptoVersion atjaunošanas no lokālā recovery žurnāla.');
});

test('I12 — existing recovered ZIP is not reused without its original IV', () => {
  const client = fs.readFileSync(path.join(root, 'src/BackupPage.jsx'), 'utf8');
  assert.match(client, /let iv = uploadedZipRef\.current\.iv \|\| recoveredJobData\?\.zipIv \|\| null;/,
    'Atkopšanas ZIP IV netiek paņemts no recoveredJobData.');
  assert.match(client, /if \(zipTxId && \(!iv \|\| iv\.length !== 12\)\)\s*\{\s*throw new Error\(t\('recovery-upload-incomplete'\)\);/,
    'Esošs ZIP bez derīga 12 baitu IV netiek apturēts pirms manifesta veidošanas.');
});

// ✅ I13: Deletion-only backup ar marķieri
test('I13 — deletion-only backup izmanto __permrepo_deletions__.json marķieri', () => {
  const client = fs.readFileSync(path.join(root, 'src/BackupPage.jsx'), 'utf8');
  assert.match(client, /__permrepo_deletions__\.json/, 'Trūkst deletion marker ceļa BackupPage.jsx.');
  assert.match(client, /PermRepo deletions v1/, 'Trūkst deletion marker formāta.');
  assert.match(client, /isDeletionOnly\s*=\s*changedFiles\.length === 0 && deletedFiles\.length > 0/, 'Trūkst isDeletionOnly pārbaudes.');
});

// ✅ I14: Pirmais backup atkopšana ar zipKeyVerifier
test('I14 — pirmā backup atkopšana pārbauda zipKeyVerifier', () => {
  const client = fs.readFileSync(path.join(root, 'src/BackupPage.jsx'), 'utf8');
  assert.match(client, /recoveredJobData\?\.zipKeyVerifier/, 'Trūkst recoveredJobData.zipKeyVerifier pārbaudes.');
  assert.match(client, /zipKeyVerifier/, 'Trūkst zipKeyVerifier saglabāšanas.');
  assert.match(client, /enteredVerifier\.toLowerCase\(\) !== recoveredVerifier\.toLowerCase\(\)/, 'Trūkst zipKeyVerifier salīdzināšanas.');
});

// ✅ I15: IV un Merkle saistība
test('I15 — serveris pārbauda IV un Merkle pret ZIP kontrolpunktu', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /function calculateArchiveMerkleRoot\(contains\)/, 'Trūkst calculateArchiveMerkleRoot funkcijas.');
  assert.match(server, /Manifesta ZIP IV nesakrīt ar saglabāto ZIP IV/, 'Trūkst IV pārbaudes.');
  assert.match(server, /Manifesta archive\.contains nesakrīt ar ZIP posmā saglabāto Merkle root/, 'Trūkst Merkle pārbaudes.');
  assert.match(server, /Manifesta merkleRoot nesakrīt ar aprēķināto no archive\.contains/, 'Trūkst merkleRoot pārrēķina.');
});

// ✅ I16: Neveiksmīga blockchain transakcija
test('I16 — neveiksmīga blockchain transakcija atgriež manifest-uploaded', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /receipt\.status !== 1/, 'Trūkst receipt.status pārbaudes.');
  assert.match(server, /status: 'manifest-uploaded',[\s\S]*retryableBlockchainFailure: true/, 'Trūkst retryableBlockchainFailure.');
});

// ✅ I17: State machine atļauj blockchain-finalizing → manifest-uploaded
test('I17 — state machine atļauj blockchain-finalizing → manifest-uploaded', () => {
  const redis = fs.readFileSync(path.join(root, 'accounting-redis.js'), 'utf8');
  assert.match(redis, /'blockchain-finalizing': \['completed', 'failed', 'manifest-uploaded'\]/, 'Trūkst state pārejas.');
});
