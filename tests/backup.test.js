import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backupSource, validManifest, ZIP_ID, OTHER_ZIP_ID,
  makeBackupValidator, extractB06Guard, makePreviousManifestLoader,
  calculateArchiveMerkleRoot
} from './helpers.js';

const validateManifest = makeBackupValidator();

test('B01 — derīgs pilns manifests tiek pieņemts', () => {
  assert.equal(validateManifest(validManifest()), true);
});

test('B01a — manifests ar vairākām ZIP atsaucēm un atbilstošiem IV tiek pieņemts', () => {
  const m = validManifest();
  m.paths['src/app.js'] = { zipId: OTHER_ZIP_ID, hash: 'b'.repeat(64) };
  m.encryption.ivs[OTHER_ZIP_ID] = Array.from({ length: 12 }, (_, i) => i);
  m.archive.contains.push({ path: 'src/app.js', hash: 'b'.repeat(64) });
  m.merkleRoot = calculateArchiveMerkleRoot(m.archive.contains);
  assert.equal(validateManifest(m), true);
});

test('B01b — null, masīvs un primitīvas vērtības tiek noraidītas', () => {
  for (const value of [null, [], 'manifest', 42, true]) assert.throws(() => validateManifest(value));
});

test('B01c — nepareizs manifesta tips un versija tiek noraidīti', () => {
  const a = validManifest(); a.manifest = 'application/json'; assert.throws(() => validateManifest(a));
  const b = validManifest(); b.version = '9.9.9'; assert.throws(() => validateManifest(b));
});

test('B01d — manifests bez metadata vai ar nederīgu repositoryId tiek noraidīts', () => {
  for (const repositoryId of [undefined, null, '', '0', 0, -1, '1.2', '1e3', {}, []]) {
    const m = validManifest();
    if (repositoryId === undefined) delete m.metadata.repositoryId;
    else m.metadata.repositoryId = repositoryId;
    assert.throws(() => validateManifest(m), `repositoryId=${String(repositoryId)}`);
  }
});

test('B01e — tukšs vai masīva tipa paths tiek noraidīts', () => {
  for (const paths of [{}, [], null, 'x']) {
    const m = validManifest(); m.paths = paths;
    assert.throws(() => validateManifest(m));
  }
});

test('B02 — traversal, absolūtie ceļi, Windows ceļi un vadības simboli tiek noraidīti', () => {
  const badPaths = [
    '../outside.txt', 'folder/../outside.txt', './secret.txt', '/etc/passwd',
    '\\server\\share\\file.txt', 'C:\\Windows\\win.ini', 'folder\\file.txt',
    'folder/./file.txt', 'bad\u0000name.txt', 'bad\nname.txt'
  ];
  for (const filePath of badPaths) {
    const m = validManifest(); m.paths = { [filePath]: { zipId: ZIP_ID, hash: 'a'.repeat(64) } };
    assert.throws(() => validateManifest(m), `Ceļam jābūt noraidītam: ${JSON.stringify(filePath)}`);
  }
});

test('B02a — pārāk garš ceļš tiek noraidīts', () => {
  const m = validManifest(); m.paths = { ['x'.repeat(1001)]: { zipId: ZIP_ID, hash: 'a'.repeat(64) } };
  assert.throws(() => validateManifest(m));
});

test('B03 — nederīgs SHA-256 formāts tiek noraidīts', () => {
  for (const hash of ['not-a-hash', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 123, null]) {
    const m = validManifest(); m.paths['README.md'].hash = hash;
    assert.throws(() => validateManifest(m), `Hash jābūt noraidītam: ${String(hash)}`);
  }
});

test('B04 — AES-GCM/ KDF versija un keyVerifier tiek stingri validēti', () => {
  const mutations = [
    m => { m.encryption.algorithm = 'AES-CBC'; },
    m => { m.encryption.kdf = 'PBKDF2'; },
    m => { m.encryption.version = 2; },
    m => { m.encryption.keyVerifier = '0x1234'; },
    m => { m.encryption.ivs = []; },
    m => { m.encryption = null; }
  ];
  for (const mutate of mutations) { const m = validManifest(); mutate(m); assert.throws(() => validateManifest(m)); }
});

test('B04a — IV ir tieši 12 baiti un katrs baits ir vesels skaitlis 0..255', () => {
  const invalidIvs = [[], Array(11).fill(1), Array(13).fill(1), Array(12).fill(-1), Array(12).fill(256), Array(12).fill(1.5), '123456789012', null];
  for (const iv of invalidIvs) {
    const m = validManifest(); m.encryption.ivs[ZIP_ID] = iv;
    assert.throws(() => validateManifest(m), `IV jābūt noraidītam: ${String(iv)}`);
  }
});

test('B04b — katram izmantotajam ZIP ir vajadzīgs atbilstošs IV', () => {
  const m = validManifest(); delete m.encryption.ivs[ZIP_ID];
  assert.throws(() => validateManifest(m));
});

test('B05 — ZIP ID un manifesta archive.id tiek validēti', () => {
  const m1 = validManifest(); m1.paths['README.md'].zipId = '../bad'; assert.throws(() => validateManifest(m1));
  const m2 = validManifest(); m2.archive.id = 'bad-id'; assert.throws(() => validateManifest(m2));
});

test('B05a — nederīgs faila ieraksts un trūkstošs hash tiek noraidīts', () => {
  for (const entry of [null, [], 'text', { zipId: ZIP_ID }, { zipId: ZIP_ID, hash: 'x' }]) {
    const m = validManifest(); m.paths['README.md'] = entry;
    assert.throws(() => validateManifest(m));
  }
});

test('B05b — manifesta maksimālais izmērs tiek ievērots', () => {
  const tinyLimitValidator = new Function(
    'validateArweaveId', 'MAX_MANIFEST_BYTES', 'Buffer', 'calculateArchiveMerkleRoot', 'ethers',
    `return (${backupSource.slice(backupSource.indexOf('function validateManifest(manifest) {'), backupSource.indexOf('\nasync function verifyJobAuthorization'))});`
  )(
    id => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id),
    200,
    Buffer,
    calculateArchiveMerkleRoot,
    { keccak256: () => '0x' + '0'.repeat(64), toUtf8Bytes: () => new Uint8Array(0), AbiCoder: { defaultAbiCoder: { encode: () => '0x' + '0'.repeat(64) } } }
  );
  assert.throws(() => tinyLimitValidator(validManifest()));
});

test('B06 — manifest repositoryId ir saistīts ar konkrētā job GitHub repositoryId', () => {
  const guard = extractB06Guard();
  assert.equal(guard(validManifest(), { githubRepositoryId: '1421380729' }), true);
  assert.equal(guard(validManifest(), { githubRepositoryId: 1421380729 }), true);
  assert.throws(() => guard(validManifest(), { githubRepositoryId: '1421380730' }), /nesakrīt/);
  assert.throws(() => guard(validManifest(), { githubRepositoryId: 'not-an-id' }), /nesakrīt/);
  assert.throws(() => guard(validManifest(), { githubRepositoryId: '' }), /nesakrīt/);
});

test('B07 — iepriekšējais manifests tiek pilnībā validēts pirms atgriešanas', async () => {
  let calls = 0;
  const validator = makeBackupValidator();
  const loader = makePreviousManifestLoader({ validateManifest: m => { calls++; return validator(m); } });
  const result = await loader(`ar://${'A'.repeat(43)}`);
  assert.ok(result);
  assert.equal(calls, 1);
});

test('B07a — iepriekšējais manifests ar nederīgu struktūru netiek izmantots', async () => {
  const warnings = [];
  const loader = makePreviousManifestLoader({
    fetchImpl: async () => new Response(JSON.stringify({ ...validManifest(), paths: {} }), { status: 200 }),
    warnings
  });
  await assert.rejects(loader(`ar://${'A'.repeat(43)}`), /backup ir apturēts/);
  assert.ok(warnings.length > 0);
});

test('B07b — tikai tukšs manifests nozīmē pirmo backup; bojāta URI/HTTP/JSON kļūda aptur backup', async () => {
  const defaultLoader = makePreviousManifestLoader();
  assert.equal(await defaultLoader(''), null);
  await assert.rejects(defaultLoader('https://not-an-arweave-uri'), /URI nav derīgs/);
  await assert.rejects(defaultLoader('ar://bad'), /ID nav derīgs/);
  const httpLoader = makePreviousManifestLoader({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(httpLoader(`ar://${'A'.repeat(43)}`), /backup ir apturēts/);
  const jsonLoader = makePreviousManifestLoader({ fetchImpl: async () => new Response('{bad JSON', { status: 200 }) });
  await assert.rejects(jsonLoader(`ar://${'A'.repeat(43)}`), /backup ir apturēts/);
});

test('B07c — iepriekšējā manifesta fetch aizliedz HTTP pāradresācijas', async () => {
  let options;
  const loader = makePreviousManifestLoader({
    fetchImpl: async (_url, suppliedOptions) => {
      options = suppliedOptions;
      return new Response(JSON.stringify(validManifest()), { status: 200 });
    }
  });
  await loader(`ar://${'A'.repeat(43)}`);
  assert.equal(options.redirect, 'error');
});

// ✅ R01: archive.contains un merkleRoot obligāti

test('B08 — manifests bez archive.contains tiek noraidīts (R01)', () => {
  const m = validManifest();
  delete m.archive.contains;
  assert.throws(() => validateManifest(m), /archive\.contains/);
});

test('B08a — manifests ar tukšu archive.contains tiek noraidīts (R01)', () => {
  const m = validManifest();
  m.archive.contains = [];
  assert.throws(() => validateManifest(m), /archive\.contains/);
});

test('B08b — manifests bez merkleRoot tiek noraidīts (R01)', () => {
  const m = validManifest();
  delete m.merkleRoot;
  assert.throws(() => validateManifest(m), /merkleRoot/);
});

test('B08c — manifests ar nederīgu merkleRoot formātu tiek noraidīts (R01)', () => {
  const m = validManifest();
  m.merkleRoot = '0x1234';
  assert.throws(() => validateManifest(m), /merkleRoot/);
});

test('B08d — archive.contains hash nesakritība ar paths tiek noraidīta (R01)', () => {
  const m = validManifest();
  m.archive.contains = [{ path: 'README.md', hash: 'b'.repeat(64) }];
  m.merkleRoot = calculateArchiveMerkleRoot(m.archive.contains);
  assert.throws(() => validateManifest(m), /hash nesakrīt/);
});

test('B08e — archive.contains ceļš, kas nav paths, tiek noraidīts (R01)', () => {
  const m = validManifest();
  m.archive.contains = [{ path: 'other.txt', hash: 'a'.repeat(64) }];
  m.merkleRoot = calculateArchiveMerkleRoot(m.archive.contains);
  assert.throws(() => validateManifest(m), /hash nesakrīt/);
});

test('B08f — dublēts archive.contains ceļš tiek noraidīts (R01)', () => {
  const m = validManifest();
  m.archive.contains = [
    { path: 'README.md', hash: 'a'.repeat(64) },
    { path: 'README.md', hash: 'a'.repeat(64) }
  ];
  m.merkleRoot = calculateArchiveMerkleRoot(m.archive.contains);
  assert.throws(() => validateManifest(m), /dublētu/);
});

// ✅ B03: deletedFiles testi

test('B09 — manifests ar derīgu deletedFiles tiek pieņemts (B03)', () => {
  const m = validManifest();
  m.deletedFiles = ['old.txt'];
  assert.equal(validateManifest(m), true);
});

test('B09a — deletedFiles nevar pārklāties ar paths (B03)', () => {
  const m = validManifest();
  m.deletedFiles = ['README.md'];
  assert.throws(() => validateManifest(m), /nevar būt gan paths, gan deletedFiles/);
});

test('B09b — deletedFiles ar nederīgu ceļu tiek noraidīts (B03)', () => {
  for (const badPath of ['../outside.txt', '/etc/passwd', 'C:\\Windows', 'bad\u0000name']) {
    const m = validManifest();
    m.deletedFiles = [badPath];
    assert.throws(() => validateManifest(m), `Ceļam jābūt noraidītam: ${JSON.stringify(badPath)}`);
  }
});

test('B09c — deletedFiles nav masīvs tiek noraidīts (B03)', () => {
  const m = validManifest();
  m.deletedFiles = 'old.txt';
  assert.throws(() => validateManifest(m));
});

test('B09d — deletedFiles ar pārāk garu ceļu tiek noraidīts (B03)', () => {
  const m = validManifest();
  m.deletedFiles = ['x'.repeat(1001)];
  assert.throws(() => validateManifest(m));
});
