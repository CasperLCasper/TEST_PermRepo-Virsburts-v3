
/**
 * PermRepo — atsevišķs blockchain atkopšanas pārbaudes fails.
 *
 * Palaišana:
 *   node --test tests/blockchain_recovery_test.js
 *
 * Šis fails nav pievienots package.json "npm test" komandai.
 * Esošie backup.test.js, integration.test.js un platform.test.js netiek mainīti.
 *
 * Svarīgi: šie ir avota plūsmas/regresijas testi. Tie nepieslēdzas MetaMask,
 * Redis vai Base Sepolia un paši neaizver pārlūku. Reālais pārlūka aizvēršanas
 * tests jāveic atsevišķi ar testa maku pēc šajā failā pārbaudīto nosacījumu
 * izvērtēšanas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const server = read('server.js');
const client = read('src/BackupPage.jsx');
const contract = read('public/contracts/50-5-PermRepoNFT.sol');

function route(source, marker, nextMarker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Nav atrasts maršruts/funkcija: ${marker}`);
  const end = source.indexOf(nextMarker, start + marker.length);
  assert.notEqual(end, -1, `Nav atrasta beigu robeža: ${nextMarker}`);
  return source.slice(start, end);
}

const finalizeRoute = route(
  server,
  "app.post('/api/start-blockchain-finalize'",
  "app.post('/api/save-backup-tx'"
);
const saveTxRoute = route(
  server,
  "app.post('/api/save-backup-tx'",
  "app.post('/api/complete-backup'"
);
const completeRoute = route(
  server,
  "app.post('/api/complete-backup'",
  "// =============================================================================\n// Failed"
);

// 1. Manifests ir saglabāts Redis pirms blockchain finalizācijas.
test('BC01 — manifesta saglabāšana Redis pāriet uz manifest-uploaded', () => {
  const saveManifestRoute = route(
    server,
    "app.post('/api/save-manifest-tx'",
    '// =============================================================================\n// Blockchain finalization state transitions'
  );
  assert.match(saveManifestRoute, /manifestTxId,\s*manifest,\s*status:\s*'manifest-uploaded'/);
  assert.match(saveManifestRoute, /job\.status === 'manifest-uploaded'/);
});

// 2. Serveris atzīmē blockchain-finalizing pirms klienta nosūta transakciju.
test('BC02 — serveris sāk blockchain-finalizing tikai no manifest-uploaded', () => {
  assert.match(finalizeRoute, /job\.status !== 'manifest-uploaded'/);
  assert.match(finalizeRoute, /status:\s*'blockchain-finalizing'/);
  assert.doesNotMatch(finalizeRoute, /job\.status === 'blockchain-finalizing'[\s\S]{0,300}idempotent/);
});

// 3. Pēc maka atbildes tx hash vispirms tiek ierakstīts lokāli, tad Redis.
test('BC03 — pēc wallet tx.hash saņemšanas tas tiek saglabāts localStorage pirms Redis pieprasījuma', () => {
  const walletSubmit = client.indexOf('const tx = await nftWrite.addBackup(');
  const localSave = client.indexOf("localStorage.setItem(\n                    `permrepo-backup-tx-${repoStorageKey}`,\n                    tx.hash", walletSubmit);
  const redisSave = client.indexOf("apiJsonWithRetry('/api/save-backup-tx'", walletSubmit);
  assert.ok(walletSubmit >= 0, 'Nav atrasta addBackup transakcijas nosūtīšana.');
  assert.ok(localSave > walletSubmit, 'tx.hash netiek saglabāts localStorage pēc wallet atbildes.');
  assert.ok(redisSave > localSave, 'Redis saglabāšana notiek pirms lokālā tx hash kontrolpunkta.');
});

// 4. Pēc pārlūka aizvēršanas hash var būt Redis vai localStorage.
test('BC04 — recovery atrod blockchain transakciju gan Redis, gan localStorage kontrolpunktā', () => {
  assert.match(client, /jobStatus\.status === 'blockchain-finalizing'[\s\S]{0,160}jobStatus\.backupTxHash/);
  assert.match(client, /jobStatus\.status === 'blockchain-finalizing'[\s\S]{0,240}!jobStatus\.backupTxHash[\s\S]{0,180}storedBackupTx/);
  assert.match(client, /apiJson\('\/api\/complete-backup'/);
  assert.match(client, /const txHash = recoveredJobData\?\.backupTxHash \|\|\s*localStorage\.getItem/);
});

// 5. Viena un tā pati transakcija ir idempotenta; cits hash tiek noraidīts.
test('BC05 — serveris pieņem jau saglabātu to pašu tx hash, bet noraida citu', () => {
  assert.match(saveTxRoute, /if \(job\.backupTxHash\)/);
  assert.match(saveTxRoute, /if \(job\.backupTxHash === txHash\)/);
  assert.match(saveTxRoute, /idempotent:\s*true/);
  assert.match(saveTxRoute, /Backup transakcijas hash jau ir saglabāts/);
});

// 6. Serveris pabeidz job tikai pēc sekmīga receipt un pareizā BackupAdded event.
test('BC06 — complete-backup pārbauda receipt un visus BackupAdded datus pirms completed', () => {
  assert.match(completeRoute, /getTransactionReceipt\(txHash\)/);
  assert.match(completeRoute, /if \(receipt\.status !== 1\)/);
  assert.match(completeRoute, /parsed\.name === 'BackupAdded'/);
  for (const field of ['tokenId', 'backupNumber', 'manifestHash', 'merkleRoot', 'manifestURI']) {
    assert.ok(completeRoute.includes(`backupAddedEvent.args.${field}`), `Trūkst BackupAdded ${field} pārbaudes.`);
  }
  assert.match(completeRoute, /status:\s*'completed'/);
});

// 7. Līguma EIP-712 parakstā ir backupNumber un nonce; veiksmīgs izsaukums tos patērē.
test('BC07 — NFT līgums aizsargā backup ierakstu ar backupNumber un nonce', () => {
  assert.match(contract, /uint256 currentNonce = nonces\[tokenId\]/);
  assert.match(contract, /nonces\[tokenId\] = currentNonce \+ 1/);
  assert.match(contract, /backupCount\[tokenId\] = backupNumber/);
  assert.match(contract, /backupCount\[tokenId\] \+ 1/);
  assert.match(contract, /nonces\[tokenId\]/);
});

// Šis ir sagaidāmais uzvedības tests, kas pašreizējā kodā vēl nav izpildāms:
// ja servera statuss ir blockchain-finalizing, bet tx hash nav ne Redis, ne
// localStorage, klientam nav droša tx hash, ko nodot complete-backup. Šo testu
// aktivizēsim tikai pēc tam, kad būs izstrādāta nepabeigtas parakstīšanas
// atkopšanas loģika; nedrīkst akli atkārtoti izsaukt addBackup.
test.todo('BC08 — pēc pārlūka aizvēršanas blockchain-finalizing bez txHash droši atsāk parakstīšanu/nosūtīšanu');
