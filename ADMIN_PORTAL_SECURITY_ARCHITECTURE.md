# Update Chain Security Architecture
# Cyber Chakra Forensics -- Agent 12 Research

**Date:** 2026-03-28
**Status:** Proposed
**Scope:** End-to-end security of the software update pipeline, from developer commit to binary running on a law enforcement machine.

---

## Why This Matters More Than Usual

Cyber Chakra Forensics is forensic software used by law enforcement. A compromised update can:

1. **Tamper with evidence** -- Alter parsed WhatsApp/Instagram data to fabricate or suppress evidence.
2. **Exfiltrate case data** -- Steal FIR numbers, suspect names, device contents, and chain-of-custody records.
3. **Plant backdoors** -- Establish persistent access on police/forensic lab networks.
4. **Destroy legal admissibility** -- Under Section 65B of the Bharatiya Sakshya Adhiniyam 2023, defense attorneys can challenge evidence if the tool used to extract it was compromised. A single provably tampered binary invalidates every case processed by every machine running that version.

The update chain is the single highest-value attack surface in the entire product.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Current State Audit](#2-current-state-audit)
3. [Defense Layers](#3-defense-layers)
4. [Priority-Ranked Recommendations](#4-priority-ranked-recommendations)
5. [Signing Key Management](#5-signing-key-management)
6. [Build Provenance and SLSA](#6-build-provenance-and-slsa)
7. [Certificate Pinning](#7-certificate-pinning)
8. [Windows Code Signing](#8-windows-code-signing)
9. [Incident Response Playbook](#9-incident-response-playbook)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Threat Model

### 1.1 Attack Surface Map

```
Developer Machine
    |
    | git push
    v
GitHub Repository (private)
    |
    | GitHub Actions CI/CD
    v
Build Environment (GitHub-hosted runner)
    |
    | Signed binaries + signatures
    v
GitHub Releases (artifact storage)
    |
    | Admin uploads release metadata
    v
Admin Portal (admin.cyberchakra.in)
    |
    | Desktop app checks /api/v1/update-check
    v
Desktop App (Tauri updater)
    |
    | Verifies minisign signature
    v
Installed Binary (law enforcement machine)
```

### 1.2 Threat Scenarios

| # | Scenario | Attacker | Impact | Likelihood | Current Mitigation |
|---|----------|----------|--------|------------|-------------------|
| T1 | **GitHub compromise** -- attacker gains write access to repo | External (stolen PAT/SSH key) or insider | Can push malicious code that CI builds and signs | Medium | Branch protection, PR reviews |
| T2 | **Admin portal compromise** -- attacker gains admin access | External (credential stuffing, phishing) | Can modify update-check response to point to malicious URL | Medium | JWT auth, but **no MFA yet** |
| T3 | **DNS hijack** -- attacker redirects `admin.cyberchakra.in` | State-level or ISP-level | MITM the update-check endpoint, serve malicious binary | Low | TLS, but **no certificate pinning** |
| T4 | **Developer machine compromise** -- supply chain via dev laptop | External (malware, phishing) | Push malicious commits, steal signing keys if stored locally | Medium | None currently |
| T5 | **Signing key theft** -- `TAURI_SIGNING_PRIVATE_KEY` stolen from GitHub Secrets | GitHub breach or social engineering | Sign arbitrary malicious binaries that pass client verification | Low | Key is in GitHub Secrets (good) |
| T6 | **MITM on update endpoint** -- intercept HTTP(S) traffic | Network-level (police network, ISP) | Serve modified update-check JSON pointing to malicious binary | Low | HTTPS is used, but no pinning |
| T7 | **Rogue admin** -- insider with admin portal access | Trusted insider | Publish malicious release, modify rollout to target specific orgs | Medium | Audit logs exist, but **no dual-approval** |
| T8 | **Build environment poisoning** -- GitHub Actions runner is compromised | Supply chain attack on runner image or action | Inject code during build without modifying source | Low | Using official actions, but **no reproducible builds** |
| T9 | **Dependency confusion / typosquatting** -- malicious npm/crate dependency | External | Code execution during build, backdoor in binary | Medium | `cargo audit` + `cargo deny` in CI |
| T10 | **Rollback attack** -- force clients to "update" to an older vulnerable version | Attacker with admin portal access | Clients downgrade to version with known vulnerability | Medium | Version blocking exists, but **no minimum version enforcement in client** |

### 1.3 Trust Boundaries

```
+------------------------------------------------------------------+
|  TRUSTED: Build Environment (ephemeral GitHub Actions runner)     |
|  - Has access to TAURI_SIGNING_PRIVATE_KEY                       |
|  - Produces signed binaries                                       |
|  - This is the ONLY place signing happens                        |
+------------------------------------------------------------------+
                    |
                    | Signed artifacts + .sig files
                    v
+------------------------------------------------------------------+
|  SEMI-TRUSTED: Admin Portal                                       |
|  - Stores release metadata (version, URL, SHA256, signature)     |
|  - Controls rollout policy (who gets updates when)               |
|  - NEVER has the signing private key                              |
|  - CAN modify the download URL (attack vector T2)                |
+------------------------------------------------------------------+
                    |
                    | update-check JSON over HTTPS
                    v
+------------------------------------------------------------------+
|  UNTRUSTED: Network (internet, police network, ISP)              |
|  - Could be MITM'd (attack vectors T3, T6)                      |
|  - TLS protects, but CA compromise is possible                   |
+------------------------------------------------------------------+
                    |
                    v
+------------------------------------------------------------------+
|  CLIENT: Desktop App (Tauri)                                      |
|  - Has embedded minisign public key (hardcoded in tauri.conf.json)|
|  - Verifies signature before applying update                     |
|  - This is the FINAL trust anchor                                 |
+------------------------------------------------------------------+
```

**Key insight:** Even if the admin portal is fully compromised (T2), the attacker CANNOT push a malicious update that passes client-side signature verification -- because the minisign private key is only in GitHub Secrets. This is the strongest defense in the current architecture.

---

## 2. Current State Audit

### 2.1 What Already Exists (Good)

| Control | Status | Location | Notes |
|---------|--------|----------|-------|
| Minisign signing in CI | **Active** | `.github/workflows/release.yml` line 131 | `TAURI_SIGNING_PRIVATE_KEY` in GitHub Secrets |
| Minisign public key embedded | **Active** | `src-tauri/tauri.conf.json` line 103 | Client verifies before applying update |
| SHA256 checksums | **Active** | Release workflow generates `CHECKSUMS.sha256` | Per-platform, per-artifact |
| Build manifest (git commit SHA) | **Active** | `MANIFEST.json` in release artifacts | Links binary to source commit |
| Security audit in CI | **Active** | `.github/workflows/security-audit.yml` | `cargo audit`, `cargo deny`, `trufflehog` |
| Pre-release security gate | **Active** | `.github/workflows/release.yml` lines 49-76 | Blocks release if vulnerabilities found |
| Version blocking | **Active** | `rollout.admin.routes.ts` | Admin can block specific versions |
| Staged rollouts | **Active** | `rollout.admin.routes.ts` | Percentage-based, org-targeted |
| Immutable audit logs | **Active** | Admin portal `logAudit()` on all admin actions | Every release publish/block is logged |
| License-gated downloads | **Active** | `license.public.routes.ts` | Download requires valid license key |
| HMAC-SHA256 license validation | **Active** | `src-tauri/src/licensing/crypto.rs` | Prevents license forgery |
| Release assets store signature | **Active** | Prisma `ReleaseAsset.signature` field | Signature stored per-asset |

### 2.2 What Is Missing (Gaps)

| Gap | Risk | Priority |
|-----|------|----------|
| No MFA on admin portal | T2: Credential compromise gives full release control | **P0 -- Critical** |
| No dual-approval for release publish | T7: Single rogue admin can publish malicious release | **P0 -- Critical** |
| No Windows code signing (Authenticode) | SmartScreen blocks install; government IT rejects unsigned .exe | **P1 -- High** |
| No certificate pinning on update endpoint | T3/T6: DNS or CA compromise enables MITM | **P1 -- High** |
| `upload_release.sh` uses plain SCP to Hostinger | T4: Developer machine compromise leaks SSH credentials | **P1 -- High** |
| No reproducible builds | T8: Cannot verify CI output matches source | **P2 -- Medium** |
| No SLSA provenance attestation | Cannot prove binary origin to auditors/courts | **P2 -- Medium** |
| No minimum version enforcement in client | T10: Client accepts "downgrade" to vulnerable version | **P2 -- Medium** |
| No key rotation mechanism | T5: If key is compromised, no safe path to new key | **P2 -- Medium** |
| Admin portal `certificateThumbprint: null` in tauri.conf.json | Windows code signing not configured | **P1 -- High** |
| No webhook signature verification from GitHub to admin portal | T8: Forged webhook could trigger fake release creation | **P2 -- Medium** |
| No IP whitelisting on admin portal | Brute-force and credential stuffing from anywhere | **P3 -- Low** |

---

## 3. Defense Layers

### Layer Architecture

```
Layer 9: Reproducible Builds + SLSA Provenance    [NOT IMPLEMENTED]
Layer 8: Audit Trail (who published what, when)    [IMPLEMENTED]
Layer 7: Rollout Stages (limit blast radius)       [IMPLEMENTED]
Layer 6: Admin Portal MFA + Dual Approval          [NOT IMPLEMENTED]
Layer 5: Certificate Pinning                       [NOT IMPLEMENTED]
Layer 4: TLS/HTTPS (transport security)            [IMPLEMENTED]
Layer 3: Minisign Signature Verification           [IMPLEMENTED] <-- strongest defense
Layer 2: CI/CD Signing (key in GitHub Secrets)     [IMPLEMENTED]
Layer 1: Code Review (PR approvals required)       [PARTIALLY -- needs enforcement]
Layer 0: Windows Code Signing (Authenticode)       [NOT IMPLEMENTED]
```

### Defense-in-Depth Matrix

| Attack Scenario | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Layer 5 | Layer 6 | Layer 7 | Layer 8 |
|----------------|---------|---------|---------|---------|---------|---------|---------|---------|
| T1: GitHub compromise | BLOCKS | - | - | - | - | - | - | detects |
| T2: Admin portal compromise | - | - | **BLOCKS** | - | - | BLOCKS (MFA) | limits | detects |
| T3: DNS hijack | - | - | **BLOCKS** | partial | BLOCKS (pin) | - | - | - |
| T4: Dev machine compromise | partial | - | - | - | - | - | - | detects |
| T5: Signing key theft | - | - | FAILS | - | - | - | - | - |
| T6: MITM on update | - | - | **BLOCKS** | BLOCKS | BLOCKS (pin) | - | - | - |
| T7: Rogue admin | - | - | **BLOCKS** | - | - | BLOCKS (dual) | limits | detects |
| T8: Build env poisoning | - | - | - | - | - | - | - | Layer 9 detects |
| T9: Dependency confusion | partial | - | - | - | - | - | - | cargo audit |
| T10: Rollback attack | - | - | partial | - | - | - | - | - |

**Observation:** Layer 3 (minisign signature verification) is the single most critical defense. It blocks T2, T3, T6, and T7 even if all other layers fail. This is already implemented.

---

## 4. Priority-Ranked Recommendations

### P0 -- Critical (implement before first government deployment)

#### 4.1 Enforce MFA on Admin Portal

**Why:** A compromised admin account cannot push a binary that passes signature verification (minisign protects against that), but CAN:
- Block legitimate versions (denial of service for law enforcement)
- Modify rollout policies to exclude specific organizations
- Access analytics data (which organizations use the tool, usage patterns)
- Modify announcements (social engineering via in-app messages)
- Create/revoke licenses

**Implementation:**

```typescript
// middleware/auth.ts -- add to existing requireAuth middleware
export const requireMFA = async (req: Request, res: Response, next: NextFunction) => {
  const admin = req.admin!;
  if (!admin.mfaVerified) {
    throw new AppError(403, "MFA verification required", "MFA_REQUIRED");
  }
  next();
};

// All mutating admin routes must require MFA
router.post("/", requireAuth, requireMFA, requireRole("admin", "super_admin"), ...);
```

For the admin portal's proposed migration to Clerk: Clerk provides built-in MFA (TOTP + WebAuthn). Configure Clerk to **require** MFA for all admin users, with no "skip" option. For the current Express-based portal, use `speakeasy` or `otpauth` for TOTP.

**Cost:** 2-3 days of development.
**Blocks:** T2 (credential compromise), T7 (partially -- adds friction for insider)

#### 4.2 Dual-Approval for Release Publishing

**Why:** A single compromised or rogue admin should not be able to publish a release. The current `POST /:id/publish` endpoint requires only `requireRole("admin", "super_admin")` -- a single admin can publish.

**Implementation:**

```sql
-- Add to releases table
ALTER TABLE releases ADD COLUMN publish_requested_by VARCHAR(36);
ALTER TABLE releases ADD COLUMN publish_approved_by VARCHAR(36);
ALTER TABLE releases ADD COLUMN publish_requested_at TIMESTAMP;
ALTER TABLE releases ADD COLUMN requires_approval BOOLEAN DEFAULT true;
```

```typescript
// release.admin.routes.ts -- replace direct publish with request/approve flow

// Step 1: Admin A requests publish
router.post("/:id/request-publish", requireRole("admin", "super_admin"), async (req, res, next) => {
  // Sets publish_requested_by = req.admin.id, publish_requested_at = now()
  // Status changes to "pending_approval"
  // Sends notification to other admins
});

// Step 2: Admin B (different person) approves
router.post("/:id/approve-publish", requireRole("admin", "super_admin"), async (req, res, next) => {
  // CRITICAL: publish_approved_by MUST differ from publish_requested_by
  if (release.publishRequestedBy === req.admin!.id) {
    throw new AppError(403, "Cannot approve your own publish request", "SELF_APPROVAL");
  }
  // Sets publish_approved_by, publishedAt = now()
});
```

**Cost:** 3-4 days of development.
**Blocks:** T7 (rogue admin)

#### 4.3 Remove Manual Upload Script

**Why:** `upload_release.sh` at the project root contains hardcoded SSH credentials (`u596918293@153.92.214.12:65002`) and a manual SCP upload path. This is a severe risk:
- SSH credentials in source control (even if the repo is private)
- Manual upload bypasses all CI/CD security controls
- No signature verification on the uploaded binary

**Action:** Delete `upload_release.sh` immediately. All binary uploads MUST go through the CI/CD pipeline (GitHub Actions -> GitHub Releases -> Admin Portal references URL).

**Cost:** 5 minutes.
**Blocks:** T4 (developer machine compromise), T7 (insider bypass of CI)

### P1 -- High (implement within 30 days of first deployment)

#### 4.4 Windows Code Signing (Authenticode / EV Certificate)

**Why:**
- Windows SmartScreen blocks unsigned executables ("Windows protected your PC")
- Government IT departments require signed binaries for deployment
- Users who override SmartScreen warnings are trained to ignore security prompts
- Court challenges under Section 65B can question whether the binary is authentic if unsigned

**Implementation:** See [Section 8](#8-windows-code-signing) for full details.

**Cost:** $300-500/year for EV code signing certificate + 2-3 days CI/CD integration.

#### 4.5 Certificate Pinning for Update Endpoint

**Why:** TLS protects the update-check endpoint, but if an attacker compromises a certificate authority (or obtains a fraudulent certificate for `admin.cyberchakra.in`), they can MITM the connection. For forensic software used by law enforcement, this is a realistic threat (state-level attackers).

**Implementation:** See [Section 7](#7-certificate-pinning) for full details.

**Cost:** 3-5 days of development in the Rust updater code.

#### 4.6 Enforce Branch Protection Rules on GitHub

**Why:** Currently the release workflow triggers on tag push (`on: push: tags: ["v*"]`). If branch protection is not enforced, an attacker with write access can push a tag directly without PR review.

**Implementation:**
- Require 2+ PR approvals for `main` branch
- Require status checks to pass (CI, security audit)
- Require signed commits (GPG or SSH key signatures)
- Restrict who can push tags (only release managers)
- Enable "require branches to be up to date before merging"

GitHub Settings -> Branches -> Add rule for `main`:
```
[x] Require a pull request before merging
    [x] Required approving reviews: 2
    [x] Dismiss stale pull request approvals when new commits are pushed
    [x] Require review from Code Owners
[x] Require status checks to pass before merging
    [x] ci / build
    [x] security-check
[x] Require signed commits
[x] Restrict pushes that create matching refs (v*)
    Only: release-managers team
```

**Cost:** 30 minutes configuration.
**Blocks:** T1 (GitHub compromise)

#### 4.7 Minimum Version Enforcement in Desktop Client

**Why:** The current update-check endpoint can serve any version. If an attacker gains admin portal access, they could set `forceUpdateTo` to an older version with known vulnerabilities (rollback attack, T10). The desktop client should refuse to "update" to a version older than its current version.

**Implementation in Rust:**

```rust
// src-tauri/src/updater.rs (or wherever update logic lives)
use semver::Version;

fn should_apply_update(current: &str, offered: &str) -> bool {
    let current_ver = Version::parse(current).ok();
    let offered_ver = Version::parse(offered).ok();

    match (current_ver, offered_ver) {
        (Some(current), Some(offered)) => {
            // NEVER downgrade unless the update is explicitly marked as a security rollback
            // AND is signed with the current minisign key
            offered > current
        }
        _ => false, // If versions can't be parsed, reject
    }
}
```

**Exception:** A `forceDowngrade` flag signed by the minisign key (not just set in the portal database) would allow legitimate rollbacks. This requires extending the Tauri updater JSON format.

**Cost:** 1-2 days.
**Blocks:** T10 (rollback attack)

### P2 -- Medium (implement within 90 days)

#### 4.8 Build Provenance with GitHub Attestations

**Why:** To prove in court that a binary was built from a specific git commit using an unmodified CI pipeline. This is SLSA Level 2 compliance.

**Implementation:** GitHub Attestations (GA, available since 2024) provides this natively.

Add to `.github/workflows/release.yml`:

```yaml
- name: Generate artifact attestation
  uses: actions/attest-build-provenance@v2
  with:
    subject-path: |
      src-tauri/target/release/bundle/nsis/*.exe
      src-tauri/target/release/bundle/deb/*.deb
```

Verification:
```bash
gh attestation verify ./CyberChakraForensics_2.0.0_x64-setup.exe \
  --owner cyberchakra-technologies
```

This generates a Sigstore-backed attestation that proves:
- Which repository produced the binary
- Which workflow file built it
- Which git commit was used
- Which GitHub Actions runner executed the build

**Cost:** 1 day.
**Blocks:** T8 (build environment poisoning -- detectable)

#### 4.9 Key Rotation Mechanism

**Why:** If `TAURI_SIGNING_PRIVATE_KEY` is ever compromised, there is currently no way to ship a new public key to existing installations. The public key is hardcoded in `tauri.conf.json` (and thus baked into the binary).

**Dual-Key Solution:**

1. Generate a **secondary (backup) keypair** now, while nothing is compromised.
2. Embed BOTH public keys in the desktop app's binary.
3. The updater accepts a signature from EITHER key.
4. During normal operation, only the primary key is used for signing.
5. If the primary key is compromised:
   - Revoke the primary key (rotate GitHub Secret)
   - Sign an emergency release with the backup key
   - The emergency release ships a new primary key and a new backup key
   - All future updates use the new primary key

**Implementation in the Tauri updater verification:**

```rust
// Hardcode both public keys
const PRIMARY_PUBKEY: &str = "RWQf3GijZl1jaAZFFObwCCwpgyo1pRmGUZUKjVD7H1U1wZycrK8hvoJi";
const BACKUP_PUBKEY: &str = "<BACKUP_KEY_HERE>";  // Generated and stored offline

fn verify_update_signature(data: &[u8], signature: &str) -> bool {
    verify_with_key(data, signature, PRIMARY_PUBKEY)
        || verify_with_key(data, signature, BACKUP_PUBKEY)
}
```

**Backup key storage:**
- Generated on an air-gapped machine
- Private key encrypted with AES-256-GCM, passphrase split with Shamir's Secret Sharing (3-of-5)
- Stored in a physical safe with tamper-evident seals
- Access requires 2+ team members physically present
- Never stored digitally on any networked system

**Cost:** 3-4 days (including key ceremony).
**Blocks:** T5 (signing key theft -- provides recovery path)

#### 4.10 GitHub Webhook Signature Verification

**Why:** If the admin portal accepts GitHub webhooks to auto-create releases (as mentioned in the MASTER_PLAN), an attacker could forge a webhook payload to inject a fake release.

**Implementation:**

```typescript
// middleware/webhook.ts
import crypto from "crypto";

export const verifyGitHubWebhook = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  const secret = process.env.GITHUB_WEBHOOK_SECRET!;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(req.body));
  const expected = `sha256=${hmac.digest("hex")}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, "Invalid webhook signature", "WEBHOOK_INVALID");
  }

  next();
};
```

**Cost:** 1 day.
**Blocks:** T8 (forged webhook)

### P3 -- Low (implement within 6 months)

#### 4.11 Reproducible Builds

**Why:** Allows anyone (auditors, courts, defense attorneys) to independently verify that a binary was produced from a specific source commit without modification.

**Implementation:**
- Pin all dependency versions (Cargo.lock, package-lock.json -- already done)
- Pin the Rust toolchain version (use `rust-toolchain.toml`)
- Pin the runner image (use `ubuntu-22.04` not `ubuntu-latest` -- already done)
- Set `SOURCE_DATE_EPOCH` in CI to the commit timestamp
- Compare build output hashes across independent builds

```yaml
# .github/workflows/release.yml
- name: Set reproducible build environment
  run: |
    echo "SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)" >> $GITHUB_ENV
    echo "CARGO_INCREMENTAL=0" >> $GITHUB_ENV
```

**Cost:** 5-10 days (significant due to Tauri/NSIS/WebView complexity).
**Note:** Full reproducibility is difficult with NSIS installers. Focus on reproducing the Rust binary first, then the frontend bundle.

#### 4.12 IP Whitelisting for Admin Portal

**Why:** Limit admin access to known office/VPN IP ranges.

**Implementation:** Use Vercel middleware or Express middleware to check `req.ip` against an allowlist.

**Cost:** 1 day.

---

## 5. Signing Key Management

### 5.1 Current State

| Aspect | Status |
|--------|--------|
| **Signing tool** | Minisign (via `tauri-plugin-updater`) |
| **Private key location** | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY` |
| **Private key password** | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| **Public key** | Embedded in `tauri.conf.json` (`plugins.updater.pubkey`) |
| **Who can access private key** | Only GitHub Actions runners during build |
| **Admin portal has private key?** | **No** (correct -- admin portal never signs) |
| **Backup key exists?** | **No** (risk) |
| **Key rotation procedure?** | **None** (risk) |

### 5.2 Key Lifecycle

```
  GENERATION          STORAGE             USAGE              ROTATION
+----------+     +------------+     +-------------+     +------------+
| minisign  |---->| GitHub     |---->| CI runner   |     | New key    |
| keygen    |     | Secrets    |     | during      |     | generation |
| (offline) |     | (encrypted |     | `cargo      |     | + backup   |
|           |     |  at rest)  |     | tauri build`|     | key swap   |
+----------+     +------------+     +-------------+     +------------+
      |                                                        |
      |  Backup copy                                          |
      +----> Encrypted USB in physical safe                    |
             (3-of-5 Shamir split passphrase)                  |
                                                               |
      Public key ---> tauri.conf.json (hardcoded in binary)    |
                                                               v
                                                    Ship new binary with
                                                    new public key, signed
                                                    with BACKUP key
```

### 5.3 Key Generation Procedure

```bash
# On an air-gapped machine (no network connection)

# 1. Generate primary keypair
minisign -G -p ccf-primary.pub -s ccf-primary.key
# Enter a strong passphrase (generated by: openssl rand -base64 32)

# 2. Generate backup keypair
minisign -G -p ccf-backup.pub -s ccf-backup.key
# Enter a DIFFERENT strong passphrase

# 3. Base64 encode the keys for GitHub Secrets
base64 -w0 ccf-primary.key > ccf-primary.key.b64
base64 -w0 ccf-backup.key > ccf-backup.key.b64

# 4. Store primary key in GitHub Secrets:
#    TAURI_SIGNING_PRIVATE_KEY = contents of ccf-primary.key.b64
#    TAURI_SIGNING_PRIVATE_KEY_PASSWORD = passphrase used in step 1

# 5. Store backup key OFFLINE:
#    - Encrypt ccf-backup.key with gpg/age
#    - Split passphrase using Shamir's Secret Sharing (3-of-5)
#    - Distribute shares to 5 team members
#    - Store encrypted key on USB in a physical safe
#    - NEVER put backup key in any digital system

# 6. Record public keys:
#    - Primary: embed in tauri.conf.json
#    - Backup: embed in tauri.conf.json (dual-key system)
#    - Both: print on paper, store in safe

# 7. Securely delete key files from the air-gapped machine
shred -u ccf-primary.key ccf-primary.key.b64
shred -u ccf-backup.key ccf-backup.key.b64
```

### 5.4 Emergency Key Revocation Procedure

If `TAURI_SIGNING_PRIVATE_KEY` is confirmed or suspected compromised:

```
TIMELINE: HOURS, NOT DAYS

T+0:  Incident detected
T+0h: Rotate GitHub Secret to empty value (blocks CI from signing)
T+0h: Block all releases in admin portal (prevents attacker from serving
       updates signed with stolen key -- although note: existing signatures
       are still valid, so this blocks new releases only)
T+1h: Retrieve backup key from physical safe (requires 3-of-5 people)
T+2h: Upload backup key to GitHub Secrets as TAURI_SIGNING_PRIVATE_KEY
T+2h: Generate new primary and backup keypairs (air-gapped)
T+3h: Build emergency release signed with backup key
       - This release includes the new primary+backup public keys
       - This release removes the compromised primary public key
T+4h: Publish emergency release with severity=critical, forceUpdate=true
T+4h: Send critical announcement to all desktop app instances
T+5h: Store new backup key offline, distribute new Shamir shares
```

**The dual-key system makes this possible.** Without a backup key, step T+3h would require shipping an unsigned update (which the client would reject) or manually visiting every installation.

---

## 6. Build Provenance and SLSA

### 6.1 Current SLSA Level

| SLSA Requirement | Status | Level |
|-----------------|--------|-------|
| Source versioned | Yes (git) | L1+ |
| Build process is scripted | Yes (GitHub Actions) | L1+ |
| Build runs on a build service | Yes (GitHub-hosted runners) | L2+ |
| Provenance is generated by the build service | **No** | Blocks L2 |
| Build service is hardened | Partially (ephemeral runners) | L2 |
| Provenance is non-falsifiable | **No** (no attestation) | Blocks L3 |

**Current level: SLSA Level 1** (scripted build process with version control).
**Target level: SLSA Level 2** (generated provenance) within 90 days.
**Stretch goal: SLSA Level 3** (hardened build platform) within 6 months.

### 6.2 Achieving SLSA Level 2

Add GitHub Attestations to the release workflow:

```yaml
# .github/workflows/release.yml -- add after build step

permissions:
  contents: write
  attestations: write  # Required for attestation
  id-token: write      # Required for OIDC

jobs:
  build-release:
    steps:
      # ... existing build steps ...

      - name: Attest build provenance (Linux)
        if: matrix.target == 'linux'
        uses: actions/attest-build-provenance@v2
        with:
          subject-path: |
            src-tauri/target/release/bundle/deb/*.deb
            src-tauri/target/release/bundle/appimage/*.AppImage

      - name: Attest build provenance (Windows)
        if: matrix.target == 'windows'
        uses: actions/attest-build-provenance@v2
        with:
          subject-path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.msi
```

This produces a signed SLSA provenance document that proves:
- **Who built it:** GitHub Actions (verified by Sigstore OIDC)
- **What was built:** SHA256 of the output artifact
- **From what source:** Git repository + commit SHA
- **Using what process:** The exact workflow file + runner environment

### 6.3 Forensic Value of Build Provenance

In a court proceeding under Section 65B BSA 2023:

**Without provenance:**
- "Your Honor, the software used to extract this evidence could have been tampered with."
- "How do we know the binary running on the examiner's machine corresponds to the audited source code?"

**With SLSA Level 2 provenance:**
- "The binary's SHA256 hash matches the Sigstore attestation, which is an independently verifiable, cryptographically signed record that this binary was produced from commit `abc123` using the CI/CD pipeline at this GitHub repository, at this specific time."
- "The attestation is signed by GitHub's OIDC identity, which cannot be forged without compromising GitHub's infrastructure."

This is not theoretical. Defense attorneys in digital forensics cases have successfully challenged evidence on the basis that the extraction tool's integrity could not be verified.

---

## 7. Certificate Pinning

### 7.1 What and Why

Certificate pinning means the desktop app only trusts a specific TLS certificate (or public key) for `admin.cyberchakra.in`, rather than trusting any certificate signed by any CA in the system trust store.

**Without pinning:** An attacker who obtains a fraudulent certificate for `admin.cyberchakra.in` (via CA compromise, social engineering, or a state-level actor) can MITM the update-check endpoint.

**With pinning:** Even with a valid certificate from a legitimate CA, the MITM fails because the certificate's public key doesn't match the pinned key.

### 7.2 Implementation in Rust (reqwest with custom TLS)

The desktop app uses `reqwest` for all HTTP calls to the license/update server. Pinning can be implemented at the `reqwest::Client` level:

```rust
use reqwest::tls::Certificate;
use sha2::{Sha256, Digest};

// Pin the SPKI (Subject Public Key Info) hash of the server's certificate
// This survives certificate renewal as long as the same key pair is used
const PINNED_SPKI_HASHES: &[&str] = &[
    // Primary certificate (current)
    "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    // Backup pin (next certificate's key -- pre-generated)
    "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    // Let's Encrypt intermediate (backup for renewal)
    "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
];

fn verify_pin(cert_chain: &[Certificate]) -> bool {
    for cert in cert_chain {
        let spki_hash = compute_spki_hash(cert);
        if PINNED_SPKI_HASHES.contains(&spki_hash.as_str()) {
            return true;
        }
    }
    false
}
```

### 7.3 Pinning Strategy

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| Pin leaf certificate | Strictest | Breaks on every cert renewal (90 days for Let's Encrypt) | **No** |
| Pin leaf public key (SPKI) | Survives renewal if same key pair used | Must pre-generate key pair for renewal | **Yes (primary)** |
| Pin intermediate CA | Works across all certs from that CA | Less protection (CA compromise still works) | **Yes (backup)** |
| Pin root CA | Weakest protection | Only blocks other CAs | **No** |

**Recommended:** Pin the leaf's SPKI hash + the intermediate CA's SPKI hash. This gives:
- Strong protection (leaf key pin)
- Graceful fallback (intermediate CA pin allows renewal with new key pair)
- Always include 2+ pins to prevent lockout

### 7.4 Pin Rotation

If the TLS certificate's key pair needs to change:
1. Generate the new key pair BEFORE the current certificate expires.
2. Add the new SPKI hash to `PINNED_SPKI_HASHES` in a desktop app update.
3. Wait for the update to propagate (staged rollout reaches 100%).
4. Only THEN deploy the new certificate on the server.
5. Remove the old SPKI hash in the next desktop app update.

**Risk:** If the pin update doesn't reach all clients before the certificate changes, those clients will be unable to check for updates. Mitigation: Always include the intermediate CA pin as a backup.

### 7.5 Recommendation

**Yes, implement certificate pinning.** For forensic software used by Indian law enforcement, state-level MITM is a realistic threat. The risks (pin rotation complexity) are manageable with proper backup pins and the intermediate CA pin as fallback.

---

## 8. Windows Code Signing

### 8.1 Why It's Required

| Reason | Impact |
|--------|--------|
| SmartScreen warning | Users see "Windows protected your PC" -- many will not know how to bypass |
| Enterprise deployment | Government IT policies block unsigned executables |
| Authenticode trust | Windows shows publisher name in UAC prompt instead of "Unknown publisher" |
| Section 65B compliance | Defense can challenge unsigned binaries as unverifiable |
| Reputation system | Signed executables build SmartScreen reputation faster |

### 8.2 Certificate Types

| Type | Cost | Requirements | SmartScreen |
|------|------|-------------|-------------|
| Standard OV (Organization Validation) | $200-400/year | Business registration docs | Builds reputation over time |
| EV (Extended Validation) | $300-500/year | Business docs + hardware token | **Immediate trust** (no SmartScreen warning) |

**Recommendation:** Start with **EV Code Signing** from DigiCert, Sectigo, or GlobalSign. The EV certificate provides immediate SmartScreen trust, which is critical for first-time installs on government machines.

### 8.3 Recommended Vendors for India

| Vendor | EV Price | HSM Requirement | India Support |
|--------|----------|----------------|---------------|
| DigiCert | ~$500/year | SafeNet token (shipped) or cloud HSM | Good |
| Sectigo | ~$320/year | SafeNet token or Azure SignTool | Good |
| GlobalSign | ~$400/year | SafeNet token | Good |
| SSL.com | ~$350/year | Cloud HSM (eSigner) | Fair |

**Best option for CI/CD:** SSL.com eSigner or DigiCert KeyLocker -- both provide cloud HSM signing that can be called from GitHub Actions without a physical token.

### 8.4 CI/CD Integration

```yaml
# .github/workflows/release.yml -- add Windows code signing step

- name: Sign Windows binaries
  if: matrix.target == 'windows'
  env:
    # DigiCert KeyLocker or SSL.com eSigner credentials
    SIGNING_CERT_FINGERPRINT: ${{ secrets.WINDOWS_SIGNING_CERT_FINGERPRINT }}
    SIGNING_API_KEY: ${{ secrets.WINDOWS_SIGNING_API_KEY }}
  run: |
    # Option A: SignTool with cloud HSM (DigiCert KeyLocker)
    signtool sign /sha1 $SIGNING_CERT_FINGERPRINT /tr http://timestamp.digicert.com /td sha256 /fd sha256 \
      "src-tauri/target/release/bundle/nsis/*.exe"

    # Option B: SSL.com eSigner (CodeSignTool)
    CodeSignTool sign -input_file_path="src-tauri/target/release/bundle/nsis/*.exe" \
      -username=${{ secrets.ESIGNER_USERNAME }} \
      -password=${{ secrets.ESIGNER_PASSWORD }} \
      -credential_id=${{ secrets.ESIGNER_CREDENTIAL_ID }} \
      -totp_secret=${{ secrets.ESIGNER_TOTP_SECRET }}
```

Update `tauri.conf.json` to include the certificate thumbprint:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "<YOUR_EV_CERT_THUMBPRINT>",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

**Timestamping is critical:** Without it, signatures expire when the certificate expires. With timestamping, the signature remains valid forever as proof that the binary was signed while the certificate was valid.

### 8.5 Tauri-Specific Notes

Tauri v2 natively supports Windows code signing via `certificateThumbprint` in `tauri.conf.json`. The current config has `"certificateThumbprint": null`, which means signing is not configured. When a thumbprint is provided and the corresponding certificate is available in the runner's certificate store, `cargo tauri build` automatically signs the NSIS installer and the embedded executable.

---

## 9. Incident Response Playbook

### 9.1 Scenario: Signing Key Compromise

```
SEVERITY: CRITICAL
RESPONSE TIME: < 4 HOURS

WHO IS INVOLVED:
- Security Lead (coordinates response)
- CTO/CEO (authorizes emergency actions)
- DevOps (executes key rotation)
- 3 of 5 Shamir share holders (retrieve backup key)
- Support (communicates with customers)

STEPS:

1. CONTAIN (T+0 to T+30min)
   [ ] Rotate TAURI_SIGNING_PRIVATE_KEY in GitHub Secrets to random value
       -> This immediately prevents CI from signing new builds
   [ ] Disable GitHub Actions release workflow
       -> Prevents attacker from triggering a build with stolen key outside CI
   [ ] Block all currently published releases in admin portal
       -> Prevents serving updates signed with compromised key
   [ ] Send CRITICAL announcement via admin portal:
       "DO NOT UPDATE - security incident in progress. Await further instructions."

2. ASSESS (T+30min to T+1h)
   [ ] Determine HOW the key was compromised
   [ ] Determine IF any malicious builds were signed and distributed
   [ ] Check GitHub audit log for unauthorized workflow runs
   [ ] Check admin portal audit log for unauthorized release publishes
   [ ] If malicious binary was distributed: record SHA256 hashes of all affected versions

3. RECOVER (T+1h to T+4h)
   [ ] Retrieve backup signing key from physical safe
       -> Requires 3 of 5 Shamir share holders physically present
   [ ] Generate new primary + backup keypairs on air-gapped machine
   [ ] Upload backup key to GitHub Secrets (this becomes the temporary signing key)
   [ ] Build emergency release from known-good commit
       -> The emergency release embeds new primary + new backup public keys
   [ ] Sign emergency release with backup key
   [ ] Publish emergency release with forceUpdate=true, severity=critical
   [ ] Send announcement: "Emergency security update available. Please update immediately."

4. POST-INCIDENT (T+4h to T+48h)
   [ ] Complete incident report (CERT-In requires notification within 6 hours)
   [ ] Notify affected customers directly (especially government agencies)
   [ ] Replace backup key in physical safe with new backup key
   [ ] Update all documentation with new key fingerprints
   [ ] Conduct root cause analysis
   [ ] Implement additional controls to prevent recurrence

5. IF MALICIOUS BINARY WAS DISTRIBUTED:
   [ ] Publish SHA256 hashes of known-malicious binaries
   [ ] Contact all organizations that may have installed the malicious version
   [ ] Advise forensic examiners: all evidence processed with the compromised version
       must be re-examined with a clean version
   [ ] Provide Section 65B-compliant incident report for courts
```

### 9.2 Scenario: Admin Portal Compromise

```
SEVERITY: HIGH (but NOT as severe as signing key compromise)

WHY NOT CRITICAL: Minisign signature verification in the desktop client
means even a fully compromised admin portal CANNOT push a malicious binary
that passes verification. However, the attacker CAN:
- Block legitimate versions (denial of service)
- Access analytics and customer data
- Modify rollout policies
- Send malicious announcements (social engineering)
- Revoke licenses

STEPS:

1. CONTAIN (T+0 to T+30min)
   [ ] Disable compromised admin account
   [ ] Rotate all JWT secrets (JWT_SECRET, JWT_REFRESH_SECRET)
   [ ] Rotate CCF_HMAC_SECRET (if the attacker had access to it)
   [ ] Enable maintenance mode on admin portal

2. ASSESS (T+30min to T+2h)
   [ ] Review admin_audit_log for all actions by the compromised account
   [ ] Check for modified releases, rollout policies, blocked versions
   [ ] Check for created/revoked licenses
   [ ] Check for modified announcements (social engineering?)
   [ ] Verify the integrity of the update-check endpoint responses

3. RECOVER (T+2h to T+8h)
   [ ] Revert any malicious changes identified in audit log
   [ ] Unblock any incorrectly blocked versions
   [ ] Restore any incorrectly revoked licenses
   [ ] Re-enable admin portal with fresh credentials for all admins
   [ ] Require all admins to set up MFA (if not already required)

4. POST-INCIDENT
   [ ] CERT-In notification within 6 hours
   [ ] Customer notification if data was accessed
   [ ] Root cause analysis (how was the account compromised?)
   [ ] Implement MFA if not already done (this should prevent recurrence)
```

### 9.3 Scenario: Supply Chain Attack via Dependency

```
SEVERITY: HIGH

DETECTION: cargo audit or security-audit.yml workflow finds a
           compromised dependency (e.g., malicious crate published)

STEPS:

1. CONTAIN
   [ ] Immediately block any released version that includes the compromised dependency
   [ ] Check if the compromised dependency was in the final binary (not just dev-dependency)
   [ ] Pin the last known-good version of the dependency in Cargo.toml/Cargo.lock

2. ASSESS
   [ ] Determine what the malicious code does
   [ ] Was any data exfiltrated from build environment?
   [ ] Were any signing keys exposed?
   [ ] Which released versions are affected?

3. RECOVER
   [ ] Update to a clean version of the dependency (or replace it)
   [ ] Build and sign a clean release
   [ ] Force-update all affected clients

4. HARDEN
   [ ] Add the dependency to cargo-deny's ban list
   [ ] Consider vendoring critical dependencies
   [ ] Review dependency count and reduce where possible
```

---

## 10. Implementation Roadmap

### Phase 1: Pre-Deployment (Before First Government Customer)

| # | Task | Priority | Effort | Owner |
|---|------|----------|--------|-------|
| 1 | Delete `upload_release.sh` | P0 | 5 min | DevOps |
| 2 | Enforce MFA on admin portal | P0 | 3 days | Backend |
| 3 | Add dual-approval for release publishing | P0 | 4 days | Backend |
| 4 | Enforce GitHub branch protection rules | P1 | 30 min | DevOps |
| 5 | Purchase EV code signing certificate | P1 | 1 week (vendor process) | Management |
| 6 | Integrate Windows code signing in CI/CD | P1 | 3 days | DevOps |
| 7 | Add minimum version enforcement to desktop client | P1 | 2 days | Rust |
| 8 | Generate backup signing keypair + key ceremony | P2 | 1 day | Security |

**Total: ~2 weeks of work (parallelizable to 1 week with 2 engineers)**

### Phase 2: First 90 Days After Deployment

| # | Task | Priority | Effort | Owner |
|---|------|----------|--------|-------|
| 9 | Add GitHub Attestations to release workflow | P2 | 1 day | DevOps |
| 10 | Implement certificate pinning in desktop client | P1 | 5 days | Rust |
| 11 | Add GitHub webhook signature verification | P2 | 1 day | Backend |
| 12 | Implement dual-key signature verification in client | P2 | 3 days | Rust |
| 13 | Add IP whitelisting for admin portal | P3 | 1 day | Backend |
| 14 | Document key rotation procedure + drill it | P2 | 2 days | Security |
| 15 | Write incident response runbook for all scenarios | P2 | 2 days | Security |

### Phase 3: Long-Term (6 Months)

| # | Task | Priority | Effort | Owner |
|---|------|----------|--------|-------|
| 16 | Achieve reproducible builds (Rust binary) | P3 | 10 days | DevOps |
| 17 | SLSA Level 3 compliance | P3 | 5 days | DevOps |
| 18 | Penetration test by CERT-In empaneled vendor | P2 | External | Management |
| 19 | Third-party security audit of update chain | P2 | External | Management |
| 20 | Consider HSM for signing key (instead of GitHub Secrets) | P3 | 5 days | DevOps |

---

## Appendix A: Quick Reference -- What Blocks What

| If this is compromised... | ...the attacker CAN: | ...but CANNOT: |
|--------------------------|---------------------|----------------|
| GitHub repo (write access) | Push malicious code, trigger CI build, sign binary | N/A -- this is a full compromise |
| Admin portal | Modify update URLs, block versions, access data | Sign binaries, bypass client signature check |
| DNS for admin.cyberchakra.in | Redirect update checks | Forge minisign signatures, break pinned TLS |
| Developer laptop | Push code (if GitHub access), leak SSH keys | Access GitHub Secrets (signing keys) |
| TAURI_SIGNING_PRIVATE_KEY | Sign arbitrary binaries | Nothing -- this is a full compromise of the update chain |
| TLS certificate authority | Issue fake cert for MITM | Bypass certificate pinning (if implemented), forge signatures |
| Network (ISP/WiFi) | See encrypted traffic metadata | Break TLS, forge signatures |

## Appendix B: Cost Summary

| Item | One-Time | Annual | Priority |
|------|----------|--------|----------|
| EV Code Signing Certificate | $0 | $300-500 | P1 |
| Security audit (CERT-In empaneled) | $5,000-15,000 | $0 | P2 |
| Hardware security module (HSM) | $3,000-10,000 | $0 | P3 |
| Air-gapped machine for key ceremony | $500 | $0 | P2 |
| Tamper-evident safe for backup keys | $200 | $0 | P2 |
| **Total (P0-P1 only)** | **$0** | **$300-500** | -- |
| **Total (all priorities)** | **$8,700-25,700** | **$300-500** | -- |

## Appendix C: Compliance Mapping

| Requirement | Source | How This Architecture Addresses It |
|-------------|--------|------------------------------------|
| Tool integrity verification | Section 65B BSA 2023 | Minisign signature + SHA256 checksums + build provenance |
| Audit trail for tool distribution | ISO 27037 | Admin portal audit logs + GitHub Actions logs + SLSA attestation |
| Incident reporting within 6 hours | CERT-In April 2022 Directions | Incident response playbook with clear timeline |
| Log retention for 180 days | CERT-In April 2022 Directions | Admin portal audit logs retained indefinitely |
| Data residency in India | DPDP Act 2023 | Admin portal hosted on Indian infrastructure (AWS ap-south-1) |
| Two-person integrity | NIST SP 800-53 (CM-5) | Dual-approval for release publishing |
| Least privilege | NIST SP 800-53 (AC-6) | Signing key accessible only to CI, not to admin portal or developers |
| Cryptographic key management | NIST SP 800-57 | Key ceremony, backup keys, rotation procedure, Shamir splitting |

---

*This document should be reviewed and updated whenever the update chain architecture changes. Next review: 2026-06-28.*
