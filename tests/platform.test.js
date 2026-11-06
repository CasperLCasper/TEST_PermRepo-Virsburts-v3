import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { translations } from '../src/translations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

// Restore platforma atrodas atsevišķi (Arweave permanent web).
// Ja tās faili ir iekļauti repozitorijā, tos pārbaudām; ja nav — izlaižam.
const RESTORE_TRANSLATIONS_PATH = 'restore/translations.js';
const RESTORE_JS_PATH = 'restore.js';
const hasRestoreFiles = exists(RESTORE_JS_PATH);

function loadRestoreTranslations() {
  if (!exists(RESTORE_TRANSLATIONS_PATH)) return null;
  try {
    const source = read(RESTORE_TRANSLATIONS_PATH);
    const start = source.indexOf('export const translations = {');
    if (start < 0) return null;
    const jsonStart = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = jsonStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return null;
    const objectLiteral = source.slice(jsonStart, end + 1);
    return new Function(`return (${objectLiteral});`)();
  } catch {
    return null;
  }
}

test('P01 — galvenie backup JavaScript moduļi iziet Node sintakses pārbaudi', () => {
  for (const file of ['server.js', 'accounting-redis.js']) {
    const result = spawnSync(
      process.execPath,
      ['--check', path.join(root, file)],
      { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' }
    );
    if (result.error) {
      assert.fail(`${file}: neizdevās palaist node --check (${result.error.message})`);
    }
    if (result.status !== 0) {
      const raw = (result.stderr || result.stdout || '').trim();
      const firstLine = raw.split('\n')[0] || 'nezināma kļūda';
      const snippet = firstLine.slice(0, 300);
      assert.fail(`${file}: sintakses kļūda — ${snippet}`);
    }
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

test('P02a — restore platformas tulkojumu atslēgas sakrīt starp valodām', { skip: !exists(RESTORE_TRANSLATIONS_PATH) }, () => {
  const restoreTranslations = loadRestoreTranslations();
  assert.ok(restoreTranslations, 'Neizdevās ielādēt restore/translations.js.');
  const locales = Object.keys(restoreTranslations);
  assert.ok(locales.includes('lv') && locales.length >= 2, 'Sagaidītas vismaz latviešu un vēl viena valoda.');
  const baseline = Object.keys(restoreTranslations[locales[0]]).sort();
  for (const locale of locales.slice(1)) {
    assert.deepEqual(Object.keys(restoreTranslations[locale]).sort(), baseline, `Restore tulkojumu atslēgas atšķiras valodai ${locale}`);
  }
});

test('P02b — restore tulkojumos ir B03 atslēgas', { skip: !exists(RESTORE_TRANSLATIONS_PATH) }, () => {
  const restoreTranslations = loadRestoreTranslations();
  assert.ok(restoreTranslations, 'Neizdevās ielādēt restore/translations.js.');
  for (const locale of Object.keys(restoreTranslations)) {
    assert.ok(restoreTranslations[locale]['deleted-files'], `Trūkst 'deleted-files' valodai ${locale}`);
    assert.ok(restoreTranslations[locale]['debug-deleted-files-count'], `Trūkst 'debug-deleted-files-count' valodai ${locale}`);
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
  ]) {
    assert.ok(source.includes(route), `Trūkst vai mainīts API ceļš: ${route}`);
  }
});

test('P06 — NFT līgums saglabā migrāciju, ne-tirgojamu NFT aizsardzību un backup metadatu lasītājus', () => {
  const source = read('public/contracts/60-1-PermRepoNFT.sol');
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
  const transitionsStart = source.indexOf('const VALID_TRANSITIONS = {');
  const transitionsEnd = source.indexOf('};', transitionsStart);
  const block = source.slice(transitionsStart, transitionsEnd + 2);

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

  assert.match(
    source,
    /async function readResponseBytesWithLimit\s*\(\s*response\s*,\s*maxBytes/
  );
  assert.match(source, /totalBytes\s*\+=\s*value\.byteLength/);
  assert.match(source, /totalBytes\s*>\s*maxBytes/);
  assert.match(
    source,
    /readResponseBytesWithLimit\s*\(\s*response\s*,\s*MAX_MANIFEST_BYTES/
  );
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

  assert.equal(
    (await readLimited(new Response('{"ok":true}'), 20)).toString('utf8'),
    '{"ok":true}'
  );
});

test('P14 — ANS-104 verifikators ir definēts un pārbauda Data Item autentiskumu', () => {
  const source = read('server.js');

  assert.match(
    source,
    /import\s*\{\s*DataItem\s*\}\s*from\s*['"]@dha-team\/arbundles['"]/,
    'Nav importēts ANS-104 DataItem verifikators.'
  );

  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);

  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');

  const verifier = source.slice(start, end);

  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /await item\.isValid\(\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /item\.rawData\)\.equals\(manifestBytes\)/);
});

test('P15 — izolētais ANS-104 palīgs atbalsta AR.IO offsets endpoint', () => {
  const source = read('server.js');
  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);

  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');

  const verifier = source.slice(start, end);

  assert.match(verifier, /\/ar-io\/offsets\//);
  assert.match(verifier, /offsets\?\.rootTxId/);
  assert.match(verifier, /offsets\?\.rootOffset/);
  assert.match(verifier, /offsets\?\.size/);
  assert.match(verifier, /redirect: 'follow'/);
  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /await item\.isValid\(\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /item\.rawData\)\.equals\(manifestBytes\)/);
});

test('P16 — izolētais ANS-104 palīgs atbalsta HEAD /raw rezerves ceļu', () => {
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

test('P17 — izolētais ANS-104 palīgs atpazīst Data-Item pozīcijas galvenes', () => {
  const source = read('server.js');
  const start = source.indexOf('async function verifyArweaveDataItem(');
  const end = source.indexOf('\nasync function loadPreviousManifest', start);

  assert.ok(start >= 0 && end > start, 'Nav atrasta ANS-104 autentiskuma pārbaude.');

  const verifier = source.slice(start, end);

  assert.match(verifier, /x-ar-io-data-item-offset/);
  assert.match(verifier, /x-ar-io-data-item-size/);
  assert.match(verifier, /X-AR-IO-Root-Transaction-Id/);
  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /await item\.isValid\(\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /item\.rawData\)\.equals\(manifestBytes\)/);
});

test('P18 — iepriekšējais manifests tiek ielādēts caur konfigurēto vārteju un verificēts pirms JSON parsēšanas un validācijas', () => {
  const source = read('server.js');

  const verifierStart = source.indexOf('async function verifyArweaveDataItem(');
  const loaderStart = source.indexOf('async function loadPreviousManifest(');
  const loaderEnd = source.indexOf('\nconst NFT_ABI', loaderStart);

  assert.ok(verifierStart >= 0, 'Nav atrasta verifyArweaveDataItem funkcija.');
  assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, 'Nav atrasta loadPreviousManifest funkcija.');

  const loader = source.slice(loaderStart, loaderEnd);

  assert.match(
    loader,
    /getValidatedManifestUrl\s*\(\s*prevManifestId\s*\)/,
    'Manifesta URL netiek iegūts caur getValidatedManifestUrl().'
  );

  assert.match(
    loader,
    /readResponseBytesWithLimit\s*\(\s*response\s*,\s*MAX_MANIFEST_BYTES\s*,/,
    'Manifesta atbilde netiek nolasīta ar MAX_MANIFEST_BYTES limitu.'
  );

  assert.match(
    loader,
    /await verifyArweaveDataItem\s*\(\s*response\s*,\s*manifestBytes\s*,\s*prevManifestId\s*,\s*fetch\s*,\s*AR_IO_GATEWAY\s*\)/,
    'Manifesta ielādes plūsma neizsauc ANS-104 verifikāciju ar nepieciešamajiem argumentiem.'
  );

  assert.match(loader, /JSON\.parse\s*\(/, 'Pēc verifikācijas netiek parsēts manifesta JSON.');
  assert.match(loader, /validateManifest\s*\(\s*manifest\s*\)/, 'Manifests netiek validēts.');
  assert.match(loader, /backup ir apturēts/, 'Nav atrasts backup apturēšanas kļūdas paziņojums.');

  const verificationPosition = loader.indexOf('await verifyArweaveDataItem(');
  const parsingPosition = loader.indexOf('JSON.parse');
  const validationPosition = loader.indexOf('validateManifest(manifest)');

  assert.ok(
    verificationPosition >= 0 &&
    parsingPosition > verificationPosition &&
    validationPosition > parsingPosition,
    'Nepareiza secība: vispirms jāverificē ANS-104, tad jāparsē JSON un jāvalidē manifests.'
  );
});


// S01: Lock zaudēšanas testi platformas līmenī

test('P19 — withJobLock atceļ darbu, kad lock tiek zaudēts (S01)', () => {
  const source = read('server.js');
  const start = source.indexOf('async function withJobLock(jobId, fn) {');

  assert.ok(start >= 0, 'Nav atrasta withJobLock funkcija.');

  const lockFn = source.slice(start, start + 4500);

  assert.match(lockFn, /lockLostController\.abort/);
  assert.match(lockFn, /lockSignal:\s*lockLostController\.signal/);
  assert.match(lockFn, /lockToken:\s*token/);
});

test('P20 — throwIfLockLost ir definēta un izmanto signal.aborted (S01)', () => {
  const source = read('server.js');

  assert.match(source, /function throwIfLockLost\(signal\)\s*\{/);

  const start = source.indexOf('function throwIfLockLost(signal)');
  const end = source.indexOf('}', source.indexOf('throw', start));
  const fn = source.slice(start, end);

  assert.match(fn, /signal\?\.aborted/);
  assert.match(fn, /throw/);
});


// B03: deletedFiles testi platformas līmenī

test('P21 — BackupPage sūta deletedFiles manifestā (B03)', () => {
  const page = read('src/BackupPage.jsx');

  assert.match(page, /deletedFiles:\s*deletedFiles/, 'Manifestā netiek iekļauts deletedFiles.');
  assert.match(page, /const deletedFiles = Object\.keys\(previousPaths\)\.filter/, 'Nav deletedFiles aprēķina.');
  assert.match(page, /setDeletedFilesForUpload\(deletedFiles\)/, 'deletedFiles netiek saglabāts state.');
});

test('P22 — restore.js atbalsta deletedFiles (B03)', { skip: !hasRestoreFiles }, () => {
  const source = read(RESTORE_JS_PATH);

  assert.match(source, /manifest\.deletedFiles/, 'restore.js nelasa manifest.deletedFiles.');
  assert.match(source, /deletedCount/, 'restore.js neuzrāda deletedCount.');
  assert.match(source, /for \(const filePath of manifest\.deletedFiles\)/, 'Nav deletedFiles validācijas cikla.');
});


// R01: archive.contains un merkleRoot testi platformas līmenī

test('P23 — BackupPage veido archive.contains un merkleRoot (R01)', () => {
  const page = read('src/BackupPage.jsx');

  assert.match(page, /const archiveContains = changedFiles\.map/, 'Nav archive.contains veidošanas.');
  assert.match(page, /contains:\s*archiveContains/, 'archive.contains netiek iekļauts manifestā.');
  assert.match(page, /merkleRoot:\s*merkleRoot/, 'merkleRoot netiek iekļauts manifestā.');
});

test('P24 — restore.js prasa archive.contains un merkleRoot (R01)', { skip: !hasRestoreFiles }, () => {
  const source = read(RESTORE_JS_PATH);

  assert.match(
    source,
    /if \(!Array\.isArray\(manifest\.archive\.contains\) \|\| manifest\.archive\.contains\.length === 0\)/,
    'restore.js neprasa archive.contains.'
  );

  assert.match(
    source,
    /typeof manifest\.merkleRoot !== 'string' \|\| !\/\^0x\[0-9a-fA-F\]\{64\}\$\/\.test\(manifest\.merkleRoot\)/,
    'restore.js neprasa merkleRoot.'
  );

  assert.match(
    source,
    /calculatedRoot\.toLowerCase\(\) !== manifest\.merkleRoot\.toLowerCase\(\)/,
    'restore.js nepārbauda merkleRoot atbilstību archive.contains.'
  );
});


test('P25 — backup atkopšana vispirms atrod job Redis pēc lietotāja, repozitorija un maka', () => {
  const server = read('server.js');
  const redis = read('accounting-redis.js');
  const client = read('src/BackupPage.jsx');

  assert.match(server, /app\.get\('\/api\/recover-job'/);
  assert.match(server, /findJobByOwner\(/);
  assert.match(redis, /permrepo:job-owner:/);
  assert.match(redis, /export async function findJobByOwner/);
  assert.match(client, /\/api\/recover-job\?repositoryId=/);
  assert.match(client, /recoveryJobIdForPrepare = storedJobId/);
  assert.match(client, /recoveryJobId: recoveryJobIdForPrepare/);
});

test('P26 — ZIP atslēgas verifikators tiek saglabāts Redis job un atgriezts atkopšanas atbildē', () => {
  const server = read('server.js');
  const client = read('src/BackupPage.jsx');

  assert.match(server, /zipKeyVerifier: job\.zipKeyVerifier \|\| null/);
  assert.match(server, /cryptoVersion, zipKeyVerifier \} = req\.body/);
  assert.match(server, /zipKeyVerifier \? \{ zipKeyVerifier \} : \{\}/);
  assert.match(client, /cryptoVersion: 1, zipKeyVerifier/);
});

test('P27 — galvenā lapa atrod nepabeigtu backup Redis arī bez localStorage jobId', () => {
  const app = read('src/App.jsx');

  assert.match(app, /\/api\/recover-job\?repositoryId=/, 'Galvenā lapa neveic Redis job meklēšanu.');
  assert.match(app, /walletAddress=\$\{encodeURIComponent\(userAddress\)\}/, 'Redis meklēšanai netiek izmantots pieslēgtais maks.');
  assert.match(app, /localStorage\.setItem\(`permrepo-job-\$\{repoKey\}`, storedJobId\)/, 'Atrastais Redis jobId netiek saglabāts kā lokāls rezerves kontrolpunkts.');
  assert.match(app, /jobStatus\.zipTxId \|\| jobStatus\.manifestTxId \|\| jobStatus\.backupTxHash/, 'Nepabeigts backup netiek atpazīts pēc ZIP/manifesta/transakcijas kontrolpunkta.');
});

// Chain-aware ANS-104 signature verification: skip signature only on devnet.
test('P28 — ANS-104 paraksta pārbaude ir ieslēgta Base mainnet, bet struktūra un ID/data binding vienmēr obligāti', () => {
  const server = read('server.js');
  const verifier = server.slice(server.indexOf('async function verifyArweaveDataItem('), server.indexOf('async function loadPreviousManifest('));

  assert.match(server, /BigInt\(CHAIN_ID\) === 8453n/);
  assert.match(verifier, /DataItem\.verify\(rawItem\)/);
  assert.match(verifier, /item\.id !== manifestId/);
  assert.match(verifier, /Buffer\.from\(item\.rawData\)\.equals\(manifestBytes\)/);
  assert.match(verifier, /if \(VERIFY_ANS104_SIGNATURES && !\(await item\.isValid\(\)\)\)/);
  assert.doesNotMatch(verifier, /return false/);
  assert.match(server, /verifyAns104Signatures: VERIFY_ANS104_SIGNATURES/);
});

test('P29 — avārijas dzēšana skenē visus repo job un pārbauda, ka atlikumu nav', () => {
  const redis = read('accounting-redis.js');
  const server = read('server.js');
  const app = read('src/App.jsx');

  assert.match(redis, /export async function deleteJobsForRepository/);
  assert.match(redis, /client\.scan\(cursor,\s*\{\s*match,\s*count:\s*250\s*\}\)/);
  assert.match(redis, /getJobRepositoryId\(job\) !== repoId/);
  assert.match(redis, /remainingCount !== 0/);
  assert.match(redis, /remainingIndexCount !== 0/);
  assert.match(redis, /remainingLockCount !== 0/);
  assert.match(redis, /client\.mget\(\.\.\.batch\)/);
  assert.match(server, /app\.post\('\/api\/delete-repository-jobs'/);
  assert.match(server, /repoData\.permissions\?\.admin/);
  const purgeRoute = server.slice(server.indexOf("app.post('/api/delete-repository-jobs'"), server.indexOf("app.post('/api/delete-job'"));
  assert.match(purgeRoute, /extendRepositoryOperationLock\(repositoryId, operationLockToken\)/);
  assert.match(purgeRoute, /requestRepositoryCancellation\(repositoryId, 900\)/);
  assert.match(purgeRoute, /acquireEmergencyRepositoryOperationLock\(repositoryId\)/);
  assert.match(purgeRoute, /stopDeadline/);
  assert.match(purgeRoute, /clearRepositoryCancellation\(repositoryId\)/);
  assert.match(redis, /export async function isRepositoryCancellationRequested/);
  assert.match(redis, /export async function requestRepositoryCancellation/);
  assert.match(app, /\/api\/delete-repository-jobs/);
  assert.match(app, /deletion\.remainingIndexCount/);
  assert.match(app, /deletion\.remainingLockCount/);
});

test('P30 — backup sagatavošana izmanto repo un wallet atomiskās slēdzenes', () => {
  const redis = read('accounting-redis.js');
  const server = read('server.js');

  assert.match(redis, /export async function acquireRepositoryOperationLock/);
  assert.match(redis, /export async function acquireRepositoryLock/);
  assert.match(redis, /CREATE_JOB_WITH_REPOSITORY_LOCK_LUA/);
  assert.match(redis, /currentOperationLock ~= ARGV\[3\]/);
  assert.match(redis, /currentWalletLock ~= ARGV\[4\]/);
  assert.match(server, /acquireRepositoryOperationLock\(id\)/);
  assert.match(server, /acquireRepositoryLock\(githubUserId, id, normalizedWallet\)/);
  assert.match(server, /repositoryOperationLockToken,/);
  assert.match(server, /repositoryLockToken,/);
  assert.match(server, /extendRepositoryOperationLock\(id, repositoryOperationLockToken\)/);
  const jobLock = server.slice(server.indexOf('async function withJobLock'), server.indexOf('// Encrypt session records'));
  assert.match(jobLock, /acquireRepositoryOperationLock\(repositoryId\)/);
  assert.match(jobLock, /extendRepositoryOperationLock\(repositoryId, repositoryOperationLockToken\)/);
});

test('P31 — GitHub ZIP pagaidu fails tiek glabāts privātā direktorijā ar 0600 režīmu', () => {
  const server = read('server.js');
  assert.match(server, /fs\.promises\.mkdtemp\(path\.join\(os\.tmpdir\(\), 'permrepo-'\)\)/);
  assert.match(server, /fs\.promises\.chmod\(tempDir, 0o700\)/);
  assert.match(server, /createWriteStream\(tempPath, \{ flags: 'wx', mode: 0o600 \}\)/);
  assert.match(server, /fs\.promises\.chmod\(tempPath, 0o600\)/);
  assert.match(server, /fs\.promises\.rm\(archive\.tempDir, \{ recursive: true, force: true \}\)/);
});

test('P32 — nederīga manifesta history aptur inkrementālo backup un netiek aizstāta ar tukšu masīvu', () => {
  const server = read('server.js');
  const client = read('src/BackupPage.jsx');
  assert.match(server, /manifest\.history !== undefined/);
  assert.match(server, /Manifesta history nav masīvs/);
  assert.match(client, /function validateManifestHistory\(history\)/);
  assert.match(client, /const validatedHistory = validateManifestHistory/);
  assert.match(client, /backup turpināts netiks, lai nepazaudētu vēsturi/);
  assert.match(client, /if \(!manifestResponse\.ok\)/);
  assert.match(client, /Number\(jobStatus\.backupCount \|\| 0\) > 0/);
  assert.match(client, /Number\(metadata\.backupCount \|\| 0\) > 0/);
});

test('P33 — Standard Backup izmanto GitHub noklusējuma zaru, nevis klienta norādītu zaru', () => {
  const server = read('server.js');
  assert.match(server, /githubToken, repoData\.ownerLogin, repoName,\s*repoData\.defaultBranch/);
  assert.doesNotMatch(server, /req\.body\.defaultBranch \|\| repoData\.defaultBranch/);
});

test('P34 — lockfile darbplūsma sagatavo pārskatāmu PR, nevis commit uz main', () => {
  const workflow = read('.github/workflows/update-lock.yml');
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /git switch -c/);
  assert.match(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /git push\s*$/m);
});

test('P35 — NFT minting nav abonementa; abonements tiek pārbaudīts backup darbībai', () => {
  const app = read('src/App.jsx');
  const server = read('server.js');
  const mintStart = app.indexOf('const mintNFT = useCallback');
  const mintEnd = app.indexOf('const createBackup = useCallback', mintStart);
  const mintHandler = app.slice(mintStart, mintEnd);
  const prepareStart = server.indexOf("app.post('/api/prepare-backup'");
  const prepareEnd = server.indexOf("app.post('/api/", prepareStart + 20);
  const prepareRoute = server.slice(prepareStart, prepareEnd);

  assert.doesNotMatch(mintHandler, /subscriptionStatus|subscription-required/);
  assert.match(app, /mint-no-subscription-needed/);
  assert.match(app, /onClick=\{\(\) => mintNFT\(selectedRepo\.name\)\}/);
  assert.match(prepareRoute, /verifySubscription|isSubscribed|subscription/i);
});

test('P36 — GitHub OAuth sesijas Redis tiek šifrētas ar AES-256-GCM un vecie ieraksti migrēti', () => {
  const server = read('server.js');
  const codec = read('session-crypto.js');
  assert.match(server, /createSessionRecordCodec\(SESSION_SECRET\)/);
  assert.match(codec, /crypto\.hkdfSync\(\s*'sha256'/);
  assert.match(codec, /createCipheriv\('aes-256-gcm'/);
  assert.match(codec, /createDecipheriv\('aes-256-gcm'/);
  assert.match(codec, /SESSION_ENVELOPE_FORMAT/);
  assert.match(server, /if \(decoded\.legacyPlaintext\)/);
  assert.match(server, /encryptSessionRecord\(decoded\.sessionData\)/);
});

test('P37 — avārijas dzēšana ir pieejama arī arhivētam repo, ja lietotājam ir admin tiesības', () => {
  const server = read('server.js');
  assert.match(server, /async function getGitHubRepositoryById\(githubToken, repositoryId, options = \{\}\)/);
  assert.match(server, /data\.archived && options\.allowArchived !== true/);
  assert.match(server, /getGitHubRepositoryById\(req\.session\.githubToken, numericRepositoryId, \{ allowArchived: true \}\)/);
});

test('P38 — server pārbauda manifesta history nepārtrauktību pret iepriekšējo manifestu', () => {
  const server = read('server.js');
  assert.match(server, /previousManifestHistory: Array\.isArray\(previousManifest\?\.history\)/);
  assert.match(server, /async function validateManifestHistoryContinuity/);
  assert.match(server, /stableJson\(preservedEntry\) !== stableJson\(previousEntry\)/);
  assert.match(server, /manifestHistory\.length !== expectedIds\.size/);
  const routeStart = server.indexOf("app.post('/api/save-manifest-tx'");
  const routeEnd = server.indexOf("app.post('/api/", routeStart + 20);
  const route = server.slice(routeStart, routeEnd);
  assert.ok(route.indexOf('verifyJobAuthorization') < route.indexOf('validateManifestHistoryContinuity'));
  assert.match(route, /validateManifestHistoryContinuity\(manifest, job\)/);
});
