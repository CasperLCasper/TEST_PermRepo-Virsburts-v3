# PermRepo

> Permanent GitHub repository backups on Arweave + Base blockchain

---

## 🌍 Valodas / Languages / Lingvoj

- [🇱🇻 Latviešu](#-latviešu)
- [🇬🇧 English](#-english)
- [🌐 Esperanto](#-esperanto)

---

## 🇱🇻 Latviešu

### Kas ir PermRepo?

**PermRepo** ir platforma, kas veido **permanentus GitHub repozitoriju backupus** uz **Arweave** un reģistrē tos **Base** blokķēdē.

Katrs repozitorijs iegūst **On-chain Deskriptoru** — unikālu ierakstu Base blokķēdē, kas:
- Saista tavu maku ar GitHub repozitoriju
- Glabā backup metadatus (backupu skaits, pēdējais manifests, Merkle sakne)
- Nodrošina permanentus, pārbaudāmus backupus
- Bloķē parastu ERC-721 pārskaitīšanu un pārdošanu; īpašnieks var migrēt NFT uz citu maku. Tas neizslēdz ārpus ķēdes vienošanos par pārdošanu.

### Kāpēc PermRepo?

GitHub ir lielisks, bet tas **nav permanents**:
- ❌ GitHub var nomirt
- ❌ GitHub var dzēst tavu repo
- ❌ GitHub var mainīt noteikumus
- ❌ Tu **nepiederi** savu repo

**PermRepo nodrošina:**
- ✅ Permanentus backupus uz Arweave
- ✅ On-chain Deskriptorus uz Base
- ✅ Pārbaudāmus backupus (Merkle sakne)
- ✅ Decentralizētu glabāšanu
- ✅ Tu kontrolē savus datus

### Kā tas strādā?

#### Lietotāja plūsma

1. Savieno GitHub (OAuth)
2. Savieno maku (MetaMask uz Base)
3. Izvēlies repozitoriju
4. Izveido On-chain Deskriptoru (mintingam abonements nav nepieciešams)
5. Aktivizē abonementu (2.5 USDC / mēnesī)
6. Izveido backupu (ZIP + šifrē + augšupielādē uz Arweave)
7. Pārbaudi (Merkle sakne uz Base)

Abonements un aktīvs, makam piederošs On-chain Deskriptors ir nepieciešami backup veikšanai, nevis NFT mintingam.

#### Backup plūsma

~~~text
GitHub Repo
       ↓
Lejupielādē ZIP (GitHub API)
       ↓
Šifrē (AES-GCM ar Master Key)
       ↓
Augšupielādē uz Arweave (Turbo SDK)
       ↓
Izveido manifestu (JSON)
       ↓
Augšupielādē manifestu uz Arweave
       ↓
Reģistrē uz Base (addBackup)
       ↓
✅ Permanentais Backups
~~~


### Standard Backup tvērums un ierobežojumi

OAuth sesijas Redis glabājas ar AES-256-GCM šifrētu ierakstu; šifrēšanas atslēga tiek atvasināta no servera `SESSION_SECRET` un Redis saņem nevis atvērtu GitHub access token. Pašreizējais GitHub OAuth `repo` scope joprojām ir plašs un dod piekļuvi privāto repozitoriju saturam atbilstoši lietotāja tiesībām. GitHub App ar tikai lasīšanas `Contents` atļauju ir atsevišķs turpmāks uzdevums, jo tas prasa OAuth/autorizācijas arhitektūras maiņu.

Pašreizējā Standard Backup versija saglabā **GitHub repozitorija noklusējuma zara failu momentuzņēmumu**. Tā nav pilna Git arhīva kopija un nesaglabā Git commit vēsturi, citus zarus, tagus, Issues, Pull Requests, Wiki, Releases vai Git LFS objektus. Pašreizējie noklusējuma ierobežojumi ir 5 000 faili vienā repozitorijā, 500 MiB kopējais failu apjoms, 100 MiB vienam failam un 600 MiB lejupielādētajam ZIP arhīvam (konfigurējami ar servera vides mainīgajiem).

GitHub arhīvs serverī īslaicīgi tiek lejupielādēts un apstrādāts kā nešifrēts ZIP; faili tiek nosūtīti pārlūkam, kur tie tiek šifrēti ar lietotāja Master Key pirms augšupielādes uz Arweave. Tādēļ pašreizējo arhitektūru nedrīkst raksturot kā Zero-Knowledge: serveris apstrādes laikā redz repozitorija failu saturu. Master Key serverī netiek glabāta. Pazaudējot Master Key, datus nevar atšifrēt.

Merkle sakne tiek reģistrēta Base blokķēdē un Restore klients to pārbauda pret manifesta un atjaunoto failu datiem; viedais līgums pats nelejupielādē un nepārbauda Arweave failu saturu.

### Administratīvās uzticības un privātuma robežas

- `restorePageURI` pašlaik var mainīt tikai NFT līguma owner; līgumā nav iebūvēta multisig vai timelock. Production līguma owner atslēgai jābūt aizsargātai ar multisig. Jaunās Restore lapas hash pirms URI maiņas jāpārbauda neatkarīgi.
- `githubUserHash` ir deterministisks `keccak256` no publiska, skaitliski secīga GitHub lietotāja ID. Tas nav anonimizācijas risinājums — kandidāta ID var pārbaudīt pret on-chain hash. Esošo abonementu migrācijai uz citu identifikatoru vajadzīgs atsevišķs plāns.
- NFT bloķē parastu ERC-721 pārskaitīšanu un pārdošanu, bet īpašnieks var izmantot `migrateNFT`, lai pārvietotu NFT uz citu maku. Tas neizslēdz ārpus ķēdes vienošanos par pārdošanu.
- Mint signer ir servera hot key. Līguma owner var to nomainīt ar `setMintSigner`, un mint autorizācijas API ir ierobežots līdz 10 pieprasījumiem minūtē; jau izveidotus NFT šādi atsaukt nevar.

### Tehnoloģijas

**Frontend**
- React 18, Vite
- ethers.js v6
- Turbo SDK
- JSZip
- Web Crypto API (AES-GCM)

**Backend**
- Node.js 20+, Express
- Redis (Upstash)
- ethers.js v6
- yauzl

**Blokķēde**
- Base (L2)
- Solidity 0.8.35
- OpenZeppelin 5.x
- EIP-712

**Glabāšana**
- Arweave (permanent)
- Turbo (augšupielādes serviss)

### Kā sākt?

**Priekšnosacījumi**
- Node.js 20+
- Git
- MetaMask
- GitHub konts
- Upstash konts

**Uzstādīšana**

~~~bash
# Klonē repozitoriju
git clone https://github.com/CasperLCasper/PermRepo-Virsburts-v3.git
cd PermRepo-Virsburts-v3

# Instalē dependencies
npm install

# Kopē vides paraugu
cp .env.example .env

# Rediģē .env ar savām vērtībām
nano .env

# Būvē frontend
npm run build

# Palaid serveri
node server.js
~~~

**Vides mainīgie** (Skatīt `.env.example` pilnu sarakstu)

| Mainīgais | Apraksts |
|-----------|----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |
| `GITHUB_REDIRECT_URI` | GitHub OAuth callback URL |
| `SESSION_SECRET` | Sesijas noslēpums (32+ rakstzīmes) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token |
| `CHAIN_ID` | Base ķēdes ID |
| `RPC_URL` | Primary Base RPC URL |
| `RPC_FALLBACK_URLS` | Optional comma-separated fallback RPC endpoints |
| `TX_CONFIRMATIONS` | Minimum canonical block confirmations before backup completion |
| `NFT_ADDRESS` | PermRepoNFT kontrakta adrese |
| `SUBSCRIPTION_ADDRESS` | Subscription kontrakta adrese |
| `USDC_ADDRESS` | USDC kontrakta adrese |
| `MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY` | Backend maka privātā atslēga |
| `ARWEAVE_GATEWAY` | Primary Arweave gateway URL |
| `AR_IO_GATEWAY` | Secondary AR.IO gateway for ANS-104 verification/fallback reads |
| `TURBO_UPLOAD_URL` | Turbo upload URL |
| `TURBO_PAYMENT_URL` | Turbo payment URL |

### Viedie kontrakti

**PermRepoNFT**
ERC-721 NFT ar bloķētu parasto pārskaitīšanu, īpašnieka migrācijas funkciju, EIP-712 mint/backup autorizāciju un On-chain Deskriptoru katram repozitorijam.

~~~solidity
function mintRepository(address recipient, string repository, uint256 deadline, bytes signature) external returns (uint256);
function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string manifestURI, uint256 deadline, bytes signature) external;
function migrateNFT(uint256 tokenId, address newOwner) external;
~~~

**PermRepoSubscription**
USDC abonements (2.5 USDC / mēnesī), balstīts uz GitHub (nevis maku).

~~~solidity
function subscribe(bytes32 githubHash) external;
function isSubscribed(bytes32 githubHash) external view returns (bool);
~~~

### API endpointi

**GitHub OAuth**

| Metode | Endpoints | Apraksts |
|---|---|---|
| GET | `/api/github/login` | Sāk OAuth plūsmu |
| GET | `/api/github/callback` | OAuth callback |
| POST | `/api/github/logout` | Izrakstīties |
| GET | `/api/github/user` | Iegūst lietotāja info |
| GET | `/api/github/repos` | Saraksts ar lietotāja repo |

**Abonements & Autorizācija**

| Metode | Endpoints | Apraksts |
|---|---|---|
| GET | `/api/subscription/status` | Iegūst abonementa statusu |
| POST | `/api/mint-authorization` | Iegūst EIP-712 mint signature |

**Backups**

| Metode | Endpoints | Apraksts |
|---|---|---|
| POST | `/api/prepare-backup` | Sagatavo backupu (NDJSON straume) |
| POST | `/api/delete-repository-jobs` | Avārijas režīmā dzēš visus izvēlētā repo Redis job, indeksus un bloķēšanas atslēgas |
| GET | `/api/job-status` | Iegūst job statusu |
| POST | `/api/start-zip-upload` | Sāk ZIP augšupielādi |
| POST | `/api/save-zip-tx` | Saglabā ZIP transakciju |
| POST | `/api/start-manifest-upload` | Sāk manifesta augšupielādi |
| POST | `/api/save-manifest-tx` | Saglabā manifesta transakciju |
| POST | `/api/start-blockchain-finalize`| Sāk blockchain finalizāciju |
| POST | `/api/save-backup-tx` | Saglabā backup transakciju |
| POST | `/api/complete-backup` | Pabeidz backupu |
| POST | `/api/fail-backup` | Atzīmē backupu kā neizdevušos |

**Veselība**

| Metode | Endpoints | Apraksts |
|---|---|---|
| GET | `/api/health` | Veselības pārbaude |
| GET | `/api/config` | Iegūst konfigurāciju |

### Drošība

1. EIP-712 paraksti — tipizētu datu parakstīšana
2. Nonce aizsardzība — katram mint/backup ir unikāls nonce
3. Deadline ierobežojums — paraksti beidzas pēc 15 minūtēm
4. GitHub īpašumtiesību pārbaude — backend pārbauda repo īpašumtiesības
5. Šifrēti backupi — AES-GCM ar lietotāja Master Key
6. Tikai HTTPS — visi savienojumi šifrēti
7. CSP headers — Content Security Policy

### Backend maks

Backend maks (`MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY`):
- Paraksta EIP-712 mint autorizācijas
- **NEmaksā** gas
- **NEmintē** NFT
- **NEGlabā** līdzekļus
- Tikai paraksta pēc GitHub īpašumtiesību pārbaudes

### Master Key

Master Key:
- Ģenerēts pirmajā backupā
- Parādīts lietotājam vienreiz
- Nekad netiek sūtīts serverim
- Izmantots backupu šifrēšanai/dešifrēšanai
- **Ja pazaudēts — backupus nevar atšifrēt**

### Licence

MIT License
Copyright (c) 2026 Virsburts PermRepo

---

## 🇬🇧 English

### What is PermRepo?

**PermRepo** is a platform that creates **permanent backups of GitHub repositories** on **Arweave** and registers them on the **Base** blockchain.

Each repository gets an **On-chain Descriptor** — a unique record on the Base blockchain that:
- Links your wallet to a GitHub repository
- Stores backup metadata (backup count, last manifest, Merkle root)
- Enables permanent, verifiable backups
- Is **not saleable through ordinary ERC-721 transfers** (the owner can explicitly migrate it to another wallet)

### Why PermRepo?

GitHub is great, but it's **not permanent**:
- ❌ GitHub can shut down
- ❌ GitHub can delete your repository
- ❌ GitHub can change terms of service
- ❌ You **don't own** your repository

**PermRepo provides:**
- ✅ Permanent backups on Arweave
- ✅ On-chain Descriptors on Base
- ✅ Verifiable backups (Merkle root)
- ✅ Decentralized storage
- ✅ You control your data

### How It Works

#### User Flow

1. Connect GitHub (OAuth)
2. Connect Wallet (MetaMask on Base)
3. Select Repository
4. Create the On-chain Descriptor (minting does not require a subscription)
5. Activate a subscription (2.5 USDC / month)
6. Create a backup (ZIP + encrypt + upload to Arweave)
7. Verify (Merkle root on Base)

An active subscription and an active On-chain Descriptor owned by the connected wallet are required for backups, not for NFT minting.

#### Backup Flow

~~~text
GitHub Repo
       ↓
Download ZIP (GitHub API)
       ↓
Encrypt (AES-GCM with Master Key)
       ↓
Upload to Arweave (Turbo SDK)
       ↓
Create Manifest (JSON)
       ↓
Upload Manifest to Arweave
       ↓
Register on Base (addBackup)
       ↓
✅ Permanent Backup
~~~


### Standard Backup scope and limits

OAuth sessions are stored in Redis as AES-256-GCM encrypted records; the encryption key is derived from the server's `SESSION_SECRET`, so GitHub access tokens are not stored in plaintext. The current GitHub OAuth `repo` scope is still broad and grants access to private repository contents according to the user's permissions. Migrating to a GitHub App with read-only `Contents` permission remains a separate task because it requires an authorization architecture change.

The current Standard Backup version stores a **file snapshot of the GitHub repository's default branch**. It is not a complete Git repository archive and does not preserve commit history, other branches, tags, Issues, Pull Requests, Wiki, Releases, or Git LFS objects. Current default limits are 5,000 files per repository, 500 MiB total file data, 100 MiB per file, and 600 MiB for the downloaded ZIP archive (configurable through server environment variables).

The GitHub archive is temporarily downloaded and processed by the server as an unencrypted ZIP; files are sent to the browser, where they are encrypted with the user's Master Key before upload to Arweave. Therefore the current architecture must not be described as Zero-Knowledge: the server processes repository file contents in plaintext during preparation. The Master Key is not stored by the server. If the Master Key is lost, the data cannot be decrypted.

The Merkle root is registered on Base and checked by the Restore client against the manifest and restored file data; the smart contract does not itself download or verify Arweave file contents.

### Administrative trust and privacy boundaries

- `restorePageURI` can currently be changed only by the NFT contract owner; the contract has no built-in multisig or timelock. The production contract owner key should be protected by a multisig. Independently verify the new Restore release hash before changing the URI.
- `githubUserHash` is a deterministic `keccak256` of the public, sequential numeric GitHub user ID. It is not an anonymization mechanism: candidate IDs can be tested against the on-chain hash. Migrating existing subscriptions to a different identifier requires a separate migration plan.
- The NFT blocks ordinary ERC-721 transfers and sales, but its owner can use `migrateNFT` to move it to another wallet. This cannot prevent an off-chain agreement to sell it.
- The mint signer is a server hot key. The contract owner can rotate it with `setMintSigner`, and the mint authorization API is rate-limited to 10 requests per minute; already minted NFTs cannot be revoked this way.

### Tech Stack

**Frontend**
- React 18, Vite
- ethers.js v6
- Turbo SDK
- JSZip
- Web Crypto API (AES-GCM)

**Backend**
- Node.js 20+, Express
- Redis (Upstash)
- ethers.js v6
- yauzl

**Blockchain**
- Base (L2)
- Solidity 0.8.35
- OpenZeppelin 5.x
- EIP-712

**Storage**
- Arweave (permanent)
- Turbo (upload service)

### Getting Started

**Prerequisites**
- Node.js 20+
- Git
- MetaMask
- GitHub account
- Upstash account

**Installation**

~~~bash
# Clone repository
git clone https://github.com/CasperLCasper/PermRepo-Virsburts-v3.git
cd PermRepo-Virsburts-v3

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env

# Build frontend
npm run build

# Start server
node server.js
~~~

**Environment Variables** (See `.env.example` for full list)

**Session upgrade note:** plaintext legacy Redis sessions are no longer accepted. After deploying this version, users with an old session must sign in to GitHub again; new sessions are encrypted with AES-256-GCM.

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |
| `GITHUB_REDIRECT_URI` | GitHub OAuth callback URL |
| `SESSION_SECRET` | Session secret (32+ chars) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token |
| `CHAIN_ID` | Base chain ID |
| `RPC_URL` | Base RPC URL |
| `NFT_ADDRESS` | PermRepoNFT contract address |
| `SUBSCRIPTION_ADDRESS` | Subscription contract address |
| `USDC_ADDRESS` | USDC contract address |
| `MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY` | Backend wallet private key |
| `ARWEAVE_GATEWAY` | Arweave gateway URL |
| `TURBO_UPLOAD_URL` | Turbo upload URL |
| `TURBO_PAYMENT_URL` | Turbo payment URL |

### Smart Contracts

**PermRepoNFT**
ERC-721 NFT that blocks ordinary transfers and sales; the owner can explicitly migrate it to another wallet. It uses EIP-712 mint and backup authorizations and an On-chain Descriptor per repository.

~~~solidity
function mintRepository(address recipient, string repository, uint256 deadline, bytes signature) external returns (uint256);
function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string manifestURI, uint256 deadline, bytes signature) external;
function migrateNFT(uint256 tokenId, address newOwner) external;
~~~

**PermRepoSubscription**
USDC subscription (2.5 USDC / month), GitHub-based (not wallet-based).

~~~solidity
function subscribe(bytes32 githubHash) external;
function isSubscribed(bytes32 githubHash) external view returns (bool);
~~~

### API Endpoints

**GitHub OAuth**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/github/login` | Start OAuth flow |
| GET | `/api/github/callback` | OAuth callback |
| POST | `/api/github/logout` | Logout |
| GET | `/api/github/user` | Get user info |
| GET | `/api/github/repos` | List user repos |

**Subscription & Mint Authorization**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/subscription/status` | Get subscription status |
| POST | `/api/mint-authorization` | Get EIP-712 mint signature |

**Backups**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/prepare-backup` | Prepare backup (NDJSON stream) |
| POST | `/api/delete-repository-jobs` | Emergency-purges all Redis jobs, indexes, and lock keys for the selected repository |
| GET | `/api/job-status` | Get job status |
| POST | `/api/start-zip-upload` | Start ZIP upload |
| POST | `/api/save-zip-tx` | Save ZIP transaction |
| POST | `/api/start-manifest-upload`| Start manifest upload |
| POST | `/api/save-manifest-tx` | Save manifest transaction |
| POST | `/api/start-blockchain-finalize`| Start blockchain finalization |
| POST | `/api/save-backup-tx` | Save backup transaction |
| POST | `/api/complete-backup` | Complete backup |
| POST | `/api/fail-backup` | Mark backup as failed |

**Health**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Get configuration |

### Security

1. EIP-712 signatures — typed data signing
2. Nonce-based replay protection — each mint/backup has unique nonce
3. Deadline-based expiration — signatures expire after 15 minutes
4. GitHub ownership verification — backend verifies repo ownership
5. Encrypted backups — AES-GCM with user's Master Key
6. HTTPS only — all connections encrypted
7. CSP headers — Content Security Policy

### Backend Wallet

The backend wallet (`MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY`):
- Signs EIP-712 mint authorizations
- Does **NOT** pay gas
- Does **NOT** mint NFTs
- Does **NOT** hold funds
- Only signs after verifying GitHub ownership

### Master Key

The Master Key:
- Generated on first backup
- Shown to user once
- Never sent to server
- Used to encrypt/decrypt backups
- **If lost — backups cannot be decrypted**

### License

MIT License
Copyright (c) 2026 Virsburts PermRepo

---

## 🌐 Esperanto

### Kio estas PermRepo?

**PermRepo** estas platformo, kiu kreas **permanentajn sekurkopiojn de GitHub-deponejoj** sur **Arweave** kaj registras ilin sur la **Base** blokĉeno.

Ĉiu deponejo ricevas **On-chain Deskriptoron** — unikan registron sur la Base blokĉeno, kiu:
- Ligas vian monujon al GitHub-deponejo
- Konservas sekurkopiajn metadatumojn (nombro de sekurkopioj, lasta manifesto, Merkle-radiko)
- Ebligas permanentajn, konfirmeblajn sekurkopiojn
- Estas **nealienigebla** (povas nur migri, ne vendi)

### Kial PermRepo?

GitHub estas bonega, sed ĝi **ne estas permanenta**:
- ❌ GitHub povas fermiĝi
- ❌ GitHub povas forigi vian deponejon
- ❌ GitHub povas ŝanĝi kondiĉojn
- ❌ Vi **ne posedas** vian deponejon

**PermRepo provizas:**
- ✅ Permanentajn sekurkopiojn sur Arweave
- ✅ On-chain Deskriptorojn sur Base
- ✅ Konfirmeblajn sekurkopiojn (Merkle-radiko)
- ✅ Malcentralizitan konservadon
- ✅ Vi kontrolas viajn datumojn

### Kiel ĝi funkcias?

#### Uzanta fluo

1. Konekti GitHub (OAuth)
2. Konekti monujon (MetaMask sur Base)
3. Aĉeti abonon (2.5 USDC / monato)
4. Elekti deponejon
5. Krei On-chain Deskriptoron
6. Krei sekurkopion (ZIP + ĉifri + alŝuti al Arweave)
7. Kontroli (Merkle-radiko sur Base)

#### Sekurkopia fluo

~~~text
GitHub Deponejo
       ↓
Elŝuti ZIP (GitHub API)
       ↓
Ĉifri (AES-GCM kun Ĉefŝlosilo)
       ↓
Alŝuti al Arweave (Turbo SDK)
       ↓
Krei manifeston (JSON)
       ↓
Alŝuti manifeston al Arweave
       ↓
Registri sur Base (addBackup)
       ↓
✅ Permanentaj Sekurkopio
~~~

### Teknologioj

**Frontend**
- React 18, Vite
- ethers.js v6
- Turbo SDK
- JSZip
- Web Crypto API (AES-GCM)

**Backend**
- Node.js 20+, Express
- Redis (Upstash)
- ethers.js v6
- yauzl

**Blokĉeno**
- Base (L2)
- Solidity 0.8.35
- OpenZeppelin 5.x
- EIP-712

**Konservado**
- Arweave (permanenta)
- Turbo (alŝuta servo)

### Kiel komenci?

**Antaŭkondiĉoj**
- Node.js 20+
- Git
- MetaMask
- GitHub-konto
- Upstash-konto

**Instalado**

~~~bash
# Kloni deponejon
git clone https://github.com/CasperLCasper/PermRepo-Virsburts-v3.git
cd PermRepo-Virsburts-v3

# Instali dependecojn
npm install

# Kopiu median skizon
cp .env.example .env

# Redaktu .env kun viaj valoroj
nano .env

# Konstrui frontend
npm run build

# Lanĉi servilon
node server.js
~~~

**Mediaj variabloj** (Vidu `.env.example` por plena listo)

| Variablo | Priskribo |
|----------|-----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth Klienta ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Klienta Sekreto |
| `GITHUB_REDIRECT_URI` | GitHub OAuth callback URL |
| `SESSION_SECRET` | Sesia sekreto (32+ signoj) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Tokens |
| `CHAIN_ID` | Base ĉena ID |
| `RPC_URL` | Base RPC URL |
| `NFT_ADDRESS` | PermRepoNFT kontrakta adreso |
| `SUBSCRIPTION_ADDRESS` | Abona kontrakta adreso |
| `USDC_ADDRESS` | USDC-kontrakta adreso |
| `MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY` | Privata ŝlosilo de malantaŭa monujo |
| `ARWEAVE_GATEWAY` | Arweave-pordego URL |
| `TURBO_UPLOAD_URL` | Turbo alŝuta URL |
| `TURBO_PAYMENT_URL` | Turbo paga URL |

### Kontraktoj

**PermRepoNFT**
ERC-721 NFT (nealienigebla) kun EIP-712 mint-rauxo, EIP-712 sekurkopia rauxo, kaj On-chain Deskriptoro por ĉiu deponejo.

~~~solidity
function mintRepository(address recipient, string repository, uint256 deadline, bytes signature) external returns (uint256);
function addBackup(uint256 tokenId, bytes32 manifestHash, bytes32 merkleRoot, string manifestURI, uint256 deadline, bytes signature) external;
function migrateNFT(uint256 tokenId, address newOwner) external;
~~~

**PermRepoSubscription**
USDC-abono (2.5 USDC / monato), bazita sur GitHub (ne sur monujo).

~~~solidity
function subscribe(bytes32 githubHash) external;
function isSubscribed(bytes32 githubHash) external view returns (bool);
~~~

### API-finaĵoj

**GitHub OAuth**

| Metodo | Finaĵo | Priskribo |
|---|---|---|
| GET | `/api/github/login` | Komenci OAuth-fluon |
| GET | `/api/github/callback` | OAuth callback |
| POST | `/api/github/logout` | Elsaluti |
| GET | `/api/github/user` | Akiri uzantan informon |
| GET | `/api/github/repos` | Listo de uzantaj deponejoj |

**Abono & Mint-rauxo**

| Metodo | Finaĵo | Priskribo |
|---|---|---|
| GET | `/api/subscription/status` | Akiri abonan staton |
| POST | `/api/mint-authorization` | Akiri EIP-712 mint-subskribon |

**Sekurkopioj**

| Metodo | Finaĵo | Priskribo |
|---|---|---|
| POST | `/api/prepare-backup` | Prepari sekurkopion (NDJSON-fluo) |
| GET | `/api/job-status` | Akiri taskan staton |
| POST | `/api/start-zip-upload` | Komenci ZIP-alŝuton |
| POST | `/api/save-zip-tx` | Konservi ZIP-transakcion |
| POST | `/api/start-manifest-upload`| Komenci manifestan alŝuton |
| POST | `/api/save-manifest-tx` | Konservi manifestan transakcion |
| POST | `/api/start-blockchain-finalize`| Komenci blokĉenan finigon |
| POST | `/api/save-backup-tx` | Konservi sekurkopian transakcion |
| POST | `/api/complete-backup` | Fini sekurkopion |
| POST | `/api/fail-backup` | Marki sekurkopion kiel malsukcesan |

**Sano**

| Metodo | Finaĵo | Priskribo |
|---|---|---|
| GET | `/api/health` | Sana kontrolo |
| GET | `/api/config` | Akiri agordon |

### Sekureco

1. EIP-712 subskriboj — subskribo de tipigitaj datumoj
2. Nonce-bazita protekto — ĉiu mint/sekurkopio havas unikan nonce
3. Deadline-limigo — subskriboj finiĝas post 15 minutoj
4. GitHub-proprieta kontrolo — malantaŭo kontrolas deponejan proprieton
5. Ĉifritaj sekurkopioj — AES-GCM kun uzanta Ĉefŝlosilo
6. Nur HTTPS — ĉiuj konektoj ĉifritaj
7. CSP-kapoj — Content Security Policy

### Malantaŭa monujo

La malantaŭa monujo (`MINT_AUTHORIZATION_SIGNER_PRIVATE_KEY`):
- Subskribas EIP-712 mint-rauxojn
- **NE** pagas gas
- **NE** mintas NFT
- **NE** tenas monon
- Nur subskribas post kontrolo de GitHub-proprieto

### Ĉefŝlosilo

La Ĉefŝlosilo:
- Generita ĉe unua sekurkopio
- Montrita al uzanto unufoje
- Neniam sendita al servilo
- Uzata por ĉifri/malĉifri sekurkopiojn
- **Se perdita — sekurkopioj ne povas esti malĉifritaj**

### Licenco

MIT License
Copyright (c) 2026 Virsburts PermRepo

---

## 🔗 Links / Saites / Ligiloj

- **Website:** https://permrepo-virsburts-v3.onrender.com
- **GitHub:** https://github.com/CasperLCasper/PermRepo-Virsburts-v3
- **Base:** https://base.org
- **Arweave:** https://arweave.org
- **Turbo:** https://ardrive.io/turbo
- **ARIO:** https://ar.io
