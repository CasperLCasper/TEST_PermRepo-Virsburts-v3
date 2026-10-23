import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { translations } from '../src/translations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

 test('P01 — galvenie backup JavaScript moduļi iziet Node sintakses pārbaudi', () => {
  for (const file of ['server.js', 'accounting-redis.js']) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

test('P02 — katrai valodai ir vienāds tulkojumu atslēgu kopums', () => {
  const locales = Object.keys(translations);
  assert.ok(locales.includes('lv') && locales.length >= 2, 'Sagaidītas vismaz latviešu un vēl viena valoda.');
  const baseline = Object.keys(translations[locales[0]]).sort();
  for (const locale of locales.slice(1)) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), baseline, `Tulkojumu atslēgas atšķiras valodai ${locale}`);
  }
});

test('P03 — BackupPage izmanto same-origin API pieprasījumus un atkopšanas kontrolpunktus', () => {
  const page = read('src/BackupPage.jsx');
  assert.match(page, /credentials:\s*['"]same-origin['"]/);
  assert.match(page, /recoveryJournalStorageKey/);
  assert.match(page, /recovery-required/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /localStorage\.removeItem/);
});

test('P04 — frontend nerenderē servera vai manifesta tekstu ar tiešu innerHTML', () => {
  for (const file of ['src/App.jsx', 'src/BackupPage.jsx', 'src/GuideButton.jsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /\.innerHTML\s*=/, `${file} satur tiešu innerHTML piešķīrumu`);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, `${file} satur dangerouslySetInnerHTML`);
  }
});

test('P05 — svarīgākie servera API ceļi paliek definēti', () => {
  const source = read('server.js');
  for (const route of [
    "app.post('/api/prepare-backup'",
    "app.post('/api/save-backup-tx'",
    "app.post('/api/save-manifest-tx'",
    "app.post('/api/complete-backup'",
    "app.get('/api/"
  ]) assert.ok(source.includes(route), `Trūkst vai mainīts API ceļš: ${route}`);
});

test('P06 — NFT līgums saglabā migrāciju, ne-tirgojamu NFT aizsardzību un backup metadatu lasītājus', () => {
  const source = read('public/contracts/50-4-PermRepoNFT.sol');
  assert.match(source, /function migrateNFT\(uint256 tokenId, address newOwner\) external nonReentrant/);
  assert.match(source, /function approve\(address, uint256\) public pure override/);
  assert.match(source, /function setApprovalForAll\(address, bool\) public pure override/);
  for (const fn of ['getBackupCount', 'getManifestURI', 'getLastMerkleRoot', 'getNonce']) {
    assert.match(source, new RegExp(`function\\s+${fn}\\s*\\(`), `Trūkst ${fn}`);
  }
});

test('P07 — abonementa līgumā ir atsevišķa abonēšanas un statusa pārbaudes loģika', () => {
  const source = read('public/contracts/10-PermRepo-Subscription.sol');
  assert.match(source, /function subscribe\(bytes32 githubHash\) external nonReentrant/);
  assert.match(source, /function isSubscribed\(bytes32 githubHash\) external view returns \(bool\)/);
  assert.match(source, /function getSubscriptionExpiry\(bytes32 githubHash\) external view returns \(uint256\)/);
});

test('P08 — konfigurācijas piemērs nesatur acīmredzamas reālas atslēgas vai tokenus', () => {
  const env = read('.env.example');
  assert.doesNotMatch(env, /(?:gh[pousr]_[A-Za-z0-9]{25,}|sk-[A-Za-z0-9]{20,}|0x[a-fA-F0-9]{64})/,
    '.env.example izskatās pēc reāla tokena vai privātās atslēgas');
});

test('P09 — frontend un servera avotos nav ieslēgts acīmredzams eval/Function izpildes ceļš', () => {
  for (const file of ['src/App.jsx', 'src/BackupPage.jsx', 'src/LanguageContext.jsx', 'src/GuideButton.jsx', 'server.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /\beval\s*\(/, `${file} satur eval()`);
    assert.doesNotMatch(source, /new\s+Function\s*\(/, `${file} satur new Function()`);
  }
});

test('P10 — accounting-redis saglabā atļautās backup state pārejas un aizliedz pabeigta job pārejas', () => {
  const source = read('accounting-redis.js');
  const block = source.slice(source.indexOf('const VALID_TRANSITIONS = {'), source.indexOf('};', source.indexOf('const VALID_TRANSITIONS = {')) + 2);
  assert.ok(block.includes("'prepared': ['zip-uploading', 'failed']"));
  assert.ok(block.includes("'zip-uploading': ['zip-uploaded', 'failed']"));
  assert.ok(block.includes("'zip-uploaded': ['manifest-uploading', 'failed']"));
  assert.ok(block.includes("'manifest-uploaded': ['blockchain-finalizing', 'failed']"));
  assert.match(block, /'completed':\s*\[\]/);
  assert.match(block, /'failed':\s*\[[\s\S]*?'manifest-uploaded'/);
});

 test('P11 — Vite konfigurācija un HTML sākumpunkts ir klātesoši', () => {
  const vite = read('vite.config.js');
  const html = read('index.html');
  assert.match(vite, /defineConfig/);
  assert.match(vite, /react\(/);
  assert.match(html, /id=["']root["']/);
  assert.match(html, /src=["']\/src\/main\.jsx["']/);
});


test('P12 — iepriekšējā manifesta atbilde tiek ierobežota pirms JSON parsēšanas', () => {
  const source = read('server.js');
  assert.match(source, /async function readJsonResponseWithLimit\(response, maxBytes\)/);
  assert.match(source, /totalBytes \+= value\.byteLength/);
  assert.match(source, /totalBytes > maxBytes/);
  assert.match(source, /readResponseBytesWithLimit\(response, MAX_MANIFEST_BYTES, 'Iepriekšējais manifests'\)/);
  assert.doesNotMatch(source, /const manifest = await response\.json\(\)/);
});

test('P13 — limita funkcija noraida pārāk lielu manifesta atbildi pirms parsēšanas', async () => {
  const source = read('server.js');
  const start = source.indexOf("async function readResponseBytesWithLimit(response, maxBytes, label = 'Manifests') {");
  const end = source.indexOf('\nasync function readJsonResponseWithLimit', start);
  assert.ok(start >= 0 && end > start, 'Nav atrasta manifesta izmēra limita funkcija.');
  const readLimited = new Function('Buffer', `return (${source.slice(start, end)});`)(Buffer);
  await assert.rejects(
    readLimited(new Response('x'.repeat(100)), 20, 'Iepriekšējais manifests'),
    /pārsniedz maksimālo izmēru/
  );
  assert.equal((await readLimited(new Response('{"ok":true}'), 20)).toString('utf8'), '{"ok":true}');
});


test('P14 — iepriekšējā manifesta saturs tiek pārbaudīts pret parakstīto ANS-104 datu vienumu', () => {
  const source = read('server.js');
  assert.match(source, /import \{ DataItem \} from '@dha-team\/arbundles';/);
  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);
  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');
  const verifier = source.slice(start, end);
  assert.match(verifier, /x-ar-io-root-transaction-id/);
  assert.match(verifier, /x-ar-io-root-item-offset/);
  assert.match(verifier, /x-ar-io-root-item-size/);
  assert.match(verifier, /Range:/);
  assert.match(verifier, /await item\.isValid\(\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /item\.rawData\)\.equals\(manifestBytes\)/);
});

test('P15 — ANS-104 pārbaude izmanto AR.IO offsets endpoint, ja atbildē trūkst root atrašanās vietas galveņu', () => {
  const source = read('server.js');
  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);
  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');
  const verifier = source.slice(start, end);
  assert.match(verifier, /\/ar-io\/offsets\//);
  assert.match(verifier, /offsets\?\.rootTxId/);
  assert.match(verifier, /offsets\?\.rootOffset/);
  assert.match(verifier, /offsets\?\.size/);
  assert.match(verifier, /redirect: 'error'/);
  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /await item\.isValid\(\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /item\.rawData\)\.equals\(manifestBytes\)/);
});

test('P16 — ja offsets indekss nedod atrašanās vietu, tiek mēģināts HEAD /raw bez autentiskuma apiešanas', () => {
  const source = read('server.js');
  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);
  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');
  const verifier = source.slice(start, end);
  assert.match(verifier, /method: 'HEAD'/);
  assert.match(verifier, /\/raw\/\$\{encodeURIComponent\(manifestId\)\}/);
  assert.match(verifier, /x-ar-io-root-data-item-offset/);
  assert.match(verifier, /x-ar-io-data-item-size/);
  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /await item\.isValid\(\)/);
});
