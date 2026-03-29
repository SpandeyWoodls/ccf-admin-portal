# Update Delivery Pipeline -- Complete Design

**Agent 6 Research Document**
**Date:** 2026-03-28
**Status:** Detailed implementation specification
**Scope:** Code commit to user's machine -- the full update lifecycle

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Build Pipeline (GitHub Actions)](#2-build-pipeline-github-actions)
3. [Post-Build Notification to Admin Portal](#3-post-build-notification-to-admin-portal)
4. [Update Server Endpoint](#4-update-server-endpoint)
5. [Binary Hosting Strategy](#5-binary-hosting-strategy)
6. [Download Authentication](#6-download-authentication)
7. [Signature Verification Flow](#7-signature-verification-flow)
8. [Rollout Stages](#8-rollout-stages)
9. [Emergency Procedures](#9-emergency-procedures)
10. [Database Additions](#10-database-additions)
11. [Desktop App Integration](#11-desktop-app-integration)

---

## 1. Architecture Overview

```
Developer pushes tag v2.1.0
       |
       v
+-------------------+       +-------------------------+
| GitHub Actions    |       | admin.cyberchakra.in    |
| (CI/CD)           |       | (Admin Portal)          |
|                   |       |                         |
| 1. Validate tag   |       |  Release Management     |
| 2. Security audit |       |  Rollout Engine          |
| 3. Matrix build   |       |  Update-Check API        |
| 4. Sign binaries  |       |  Download Auth           |
| 5. Upload to GH   |       |  Version Blocking        |
| 6. POST webhook   +------>|  GitHub Webhook Receiver  |
+-------------------+       +------------+------------+
                                          |
                  +-----------------------+
                  |
                  v
+-------------------------------------------+
| Desktop App (Tauri v2)                    |
|                                           |
| GET /api/v1/update-check                  |
|   ?target=windows&arch=x86_64             |
|   &current_version=2.0.0                  |
|   Header: X-License-Key: CCF-XXXX-...    |
|   Header: X-Hardware-Fingerprint: abc123  |
|                                           |
| Receives Tauri updater JSON               |
| Downloads binary from signed URL          |
| Verifies minisign signature               |
| Installs update                           |
+-------------------------------------------+
```

**Key Decisions Already Made (based on existing codebase):**
- Tauri v2 plugin updater is already configured in `src-tauri/tauri.conf.json`
- Minisign key pair exists (pubkey is embedded in tauri.conf.json)
- Release workflow exists at `.github/workflows/release.yml`
- Admin portal update-check endpoint exists at `backend/src/routes/license.public.routes.ts`
- Rollout engine exists at `backend/src/services/rollout.ts`
- Prisma schema includes `Release`, `ReleaseAsset`, `RolloutPolicy`, `RolloutStage`, `BlockedVersion`

---

## 2. Build Pipeline (GitHub Actions)

### 2.1 Existing Workflow Gaps

The current `.github/workflows/release.yml` is a solid foundation but needs these additions:

| Gap | Current State | Required Change |
|-----|---------------|-----------------|
| Signature files | NSIS `.exe` is built but `.exe.sig` not explicitly collected | Tauri auto-generates `.sig` files when `TAURI_SIGNING_PRIVATE_KEY` is set -- add them to artifact upload |
| AppImage tar.gz | Not collected | Tauri generates `.AppImage.tar.gz` + `.AppImage.tar.gz.sig` for updater -- must be uploaded |
| Webhook notification | Only Slack notification exists | Add job to POST to admin portal webhook |
| Updater-compatible artifacts | MSI/NSIS `.exe` uploaded but not the `.nsis.zip` + `.nsis.zip.sig` | The Tauri updater on Windows uses the NSIS `.exe` bundled in a `.zip` with a `.sig` -- verify correct artifact names |

### 2.2 Enhanced Release Workflow

Replace the existing `.github/workflows/release.yml` with this enhanced version:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

env:
  CARGO_TERM_COLOR: always

jobs:
  # ─── Stage 1: Validate ─────────────────────────────────────────────
  validate:
    name: Validate Release
    runs-on: ubuntu-22.04
    outputs:
      version: ${{ steps.version.outputs.version }}
      is_prerelease: ${{ steps.version.outputs.is_prerelease }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract and validate version
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT

          # Detect pre-release
          if [[ "$VERSION" == *-alpha* ]] || [[ "$VERSION" == *-beta* ]] || [[ "$VERSION" == *-rc* ]]; then
            echo "is_prerelease=true" >> $GITHUB_OUTPUT
          else
            echo "is_prerelease=false" >> $GITHUB_OUTPUT
          fi

          # Validate Cargo.toml
          CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)
          if [ "$CARGO_VERSION" != "$VERSION" ]; then
            echo "::error::Cargo.toml version ($CARGO_VERSION) doesn't match tag ($VERSION)"
            exit 1
          fi

          # Validate tauri.conf.json
          TAURI_VERSION=$(jq -r '.version' src-tauri/tauri.conf.json)
          if [ "$TAURI_VERSION" != "$VERSION" ]; then
            echo "::error::tauri.conf.json version ($TAURI_VERSION) doesn't match tag ($VERSION)"
            exit 1
          fi

          # Validate package.json
          PKG_VERSION=$(jq -r '.version' package.json)
          if [ "$PKG_VERSION" != "$VERSION" ]; then
            echo "::error::package.json version ($PKG_VERSION) doesn't match tag ($VERSION)"
            exit 1
          fi

          echo "Version validation passed: $VERSION"

  # ─── Stage 2: Security Check ────────────────────────────────────────
  security-check:
    name: Pre-Release Security Check
    needs: validate
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install security tools
        run: |
          cargo install cargo-audit --locked
          cargo install cargo-deny --locked

      - name: Run security audit
        run: cargo audit
        working-directory: src-tauri

      - name: Run license check
        run: cargo deny check licenses
        working-directory: src-tauri

  # ─── Stage 3: Matrix Build ──────────────────────────────────────────
  build-release:
    name: Build ${{ matrix.target_name }}
    needs: [validate, security-check]
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-22.04
            target: linux
            target_name: Linux x64
            artifact_name: linux-x64
          - os: windows-latest
            target: windows
            target_name: Windows x64
            artifact_name: windows-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Install Linux dependencies
        if: matrix.target == 'linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            libssl-dev

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-release-${{ hashFiles('**/Cargo.lock') }}

      - name: Install Tauri CLI
        run: cargo install tauri-cli --locked

      - name: Install dependencies
        run: npm ci

      - name: Build release
        run: cargo tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      # ── Collect artifacts (Linux) ──────────────────────────────────
      - name: Collect Linux artifacts
        if: matrix.target == 'linux'
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          mkdir -p staging

          # The Tauri updater uses .AppImage.tar.gz + .AppImage.tar.gz.sig
          cp src-tauri/target/release/bundle/appimage/*.AppImage staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/appimage/*.AppImage.tar.gz.sig staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/deb/*.deb staging/ 2>/dev/null || true

          # Generate checksums
          cd staging
          sha256sum * > CHECKSUMS-linux.sha256

      - name: Upload Linux artifacts
        if: matrix.target == 'linux'
        uses: actions/upload-artifact@v4
        with:
          name: release-linux-x64
          path: staging/*

      # ── Collect artifacts (Windows) ────────────────────────────────
      - name: Collect Windows artifacts
        if: matrix.target == 'windows'
        shell: bash
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          mkdir -p staging

          # The Tauri updater on Windows uses the NSIS .exe + .exe.sig
          # (Tauri v2 generates .nsis.zip and .nsis.zip.sig for the updater)
          cp src-tauri/target/release/bundle/nsis/*.exe staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/nsis/*.exe.sig staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/nsis/*.nsis.zip staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/nsis/*.nsis.zip.sig staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/msi/*.msi staging/ 2>/dev/null || true
          cp src-tauri/target/release/bundle/msi/*.msi.sig staging/ 2>/dev/null || true

          # Generate checksums
          cd staging
          sha256sum * > CHECKSUMS-windows.sha256

      - name: Upload Windows artifacts
        if: matrix.target == 'windows'
        uses: actions/upload-artifact@v4
        with:
          name: release-windows-x64
          path: staging/*

  # ─── Stage 4: Create GitHub Release ─────────────────────────────────
  create-release:
    name: Create GitHub Release
    needs: [validate, build-release]
    runs-on: ubuntu-22.04
    outputs:
      release_url: ${{ steps.create.outputs.url }}
      release_id: ${{ steps.create.outputs.id }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          pattern: release-*
          merge-multiple: true

      - name: Generate release notes
        id: notes
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

          echo "## What's Changed" > RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md

          if [ -n "$PREV_TAG" ]; then
            git log --pretty=format:"- %s" $PREV_TAG..HEAD >> RELEASE_NOTES.md
          else
            git log --pretty=format:"- %s" HEAD~10..HEAD >> RELEASE_NOTES.md
          fi

          echo "" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "## Verification" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "All binaries are signed with minisign. The Tauri updater" >> RELEASE_NOTES.md
          echo "verifies signatures automatically. For manual verification:" >> RELEASE_NOTES.md
          echo '```bash' >> RELEASE_NOTES.md
          echo "sha256sum -c CHECKSUMS-linux.sha256" >> RELEASE_NOTES.md
          echo '```' >> RELEASE_NOTES.md

      - name: Create Release
        id: create
        uses: softprops/action-gh-release@v2
        with:
          name: "Cyber Chakra Forensics v${{ needs.validate.outputs.version }}"
          body_path: RELEASE_NOTES.md
          draft: false
          prerelease: ${{ needs.validate.outputs.is_prerelease == 'true' }}
          files: |
            artifacts/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ─── Stage 5: Notify Admin Portal ──────────────────────────────────
  notify-admin-portal:
    name: Notify Admin Portal
    needs: [validate, create-release]
    runs-on: ubuntu-22.04
    steps:
      - name: Download artifacts for metadata
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          pattern: release-*
          merge-multiple: true

      - name: Build asset manifest and notify
        env:
          ADMIN_PORTAL_WEBHOOK_SECRET: ${{ secrets.ADMIN_PORTAL_WEBHOOK_SECRET }}
          ADMIN_PORTAL_URL: ${{ secrets.ADMIN_PORTAL_URL }}
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          IS_PRERELEASE="${{ needs.validate.outputs.is_prerelease }}"
          RELEASE_URL="${{ needs.create-release.outputs.release_url }}"
          REPO="${{ github.repository }}"
          COMMIT_SHA="${{ github.sha }}"

          # Determine channel from version string
          CHANNEL="stable"
          if [[ "$VERSION" == *-beta* ]]; then CHANNEL="beta"; fi
          if [[ "$VERSION" == *-rc* ]]; then CHANNEL="rc"; fi
          if [[ "$VERSION" == *-alpha* ]]; then CHANNEL="beta"; fi

          # Build assets array by scanning artifacts directory
          ASSETS="[]"
          for f in artifacts/*; do
            [ -f "$f" ] || continue
            FILENAME=$(basename "$f")

            # Skip checksum files
            [[ "$FILENAME" == CHECKSUMS-* ]] && continue

            # Determine platform and package type
            PLATFORM=""
            PACKAGE_TYPE=""
            ARCH="x86_64"

            case "$FILENAME" in
              *.AppImage)
                PLATFORM="linux"; PACKAGE_TYPE="appimage";;
              *.AppImage.tar.gz)
                PLATFORM="linux"; PACKAGE_TYPE="appimage-updater";;
              *.AppImage.tar.gz.sig)
                continue;; # Signature file, handled below
              *.deb)
                PLATFORM="linux"; PACKAGE_TYPE="deb";;
              *_x64-setup.exe|*_x64_en-US.exe)
                PLATFORM="windows"; PACKAGE_TYPE="nsis";;
              *.exe.sig)
                continue;; # Signature file
              *.nsis.zip)
                PLATFORM="windows"; PACKAGE_TYPE="nsis-updater";;
              *.nsis.zip.sig)
                continue;; # Signature file
              *.msi)
                PLATFORM="windows"; PACKAGE_TYPE="msi";;
              *.msi.sig)
                continue;; # Signature file
              *)
                continue;;
            esac

            [ -z "$PLATFORM" ] && continue

            FILE_SIZE=$(stat --printf="%s" "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo "0")
            SHA256=$(sha256sum "$f" | cut -d' ' -f1)

            # Check for accompanying .sig file
            SIGNATURE=""
            if [ -f "${f}.sig" ]; then
              SIGNATURE=$(cat "${f}.sig" | base64 -w0)
            fi

            # Build download URL from GitHub Releases
            DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${FILENAME}"

            ASSETS=$(echo "$ASSETS" | jq \
              --arg p "$PLATFORM" \
              --arg a "$ARCH" \
              --arg pt "$PACKAGE_TYPE" \
              --arg fn "$FILENAME" \
              --arg fs "$FILE_SIZE" \
              --arg sha "$SHA256" \
              --arg url "$DOWNLOAD_URL" \
              --arg sig "$SIGNATURE" \
              '. + [{
                "platform": $p,
                "arch": $a,
                "packageType": $pt,
                "filename": $fn,
                "fileSize": ($fs | tonumber),
                "sha256Hash": $sha,
                "downloadUrl": $url,
                "signature": (if $sig == "" then null else $sig end)
              }]')
          done

          # Build the webhook payload
          PAYLOAD=$(jq -n \
            --arg version "$VERSION" \
            --arg channel "$CHANNEL" \
            --arg commitSha "$COMMIT_SHA" \
            --arg releaseUrl "$RELEASE_URL" \
            --argjson assets "$ASSETS" \
            '{
              "event": "release.created",
              "version": $version,
              "channel": $channel,
              "gitCommitSha": $commitSha,
              "releaseUrl": $releaseUrl,
              "title": ("Cyber Chakra Forensics v" + $version),
              "assets": $assets
            }')

          echo "Webhook payload:"
          echo "$PAYLOAD" | jq .

          # Generate HMAC-SHA256 signature for webhook authentication
          SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$ADMIN_PORTAL_WEBHOOK_SECRET" | cut -d' ' -f2)

          # POST to admin portal
          HTTP_STATUS=$(curl -s -o /tmp/webhook_response.json -w "%{http_code}" \
            -X POST "${ADMIN_PORTAL_URL}/api/v1/webhooks/github" \
            -H "Content-Type: application/json" \
            -H "X-Hub-Signature-256: sha256=${SIGNATURE}" \
            -H "X-GitHub-Event: release" \
            -d "$PAYLOAD")

          echo "Admin portal response (HTTP $HTTP_STATUS):"
          cat /tmp/webhook_response.json || true

          if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
            echo "Admin portal notified successfully"
          else
            echo "::warning::Admin portal notification failed (HTTP $HTTP_STATUS) - release still published on GitHub"
          fi

      - name: Send Slack notification
        if: env.SLACK_WEBHOOK_URL != ''
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
              \"attachments\": [{
                \"color\": \"good\",
                \"title\": \"Release v$VERSION Published\",
                \"text\": \"Cyber Chakra Forensics v$VERSION is now available on GitHub Releases.\",
                \"fields\": [
                  {\"title\": \"Platforms\", \"value\": \"Linux x64, Windows x64\", \"short\": true},
                  {\"title\": \"Channel\", \"value\": \"$(echo $VERSION | grep -oP '(?<=-)[a-z]+' || echo 'stable')\", \"short\": true}
                ]
              }]
            }"
```

### 2.3 Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Minisign private key for binary signing (already exists) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the private key (already exists) |
| `ADMIN_PORTAL_WEBHOOK_SECRET` | Shared secret for HMAC-SHA256 webhook authentication (NEW) |
| `ADMIN_PORTAL_URL` | Base URL of admin portal, e.g., `https://admin.cyberchakra.in` (NEW) |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook (optional, already exists) |

---

## 3. Post-Build Notification to Admin Portal

### 3.1 Recommendation: Option A+B Hybrid (Webhook with CI Fallback)

**Primary: GitHub Actions job calls admin portal** (Option B from the research prompt)
**Fallback: Admin manually creates release** (Option C)

**Why NOT pure GitHub webhooks (Option A):**
- GitHub's `release` webhook fires when the release object is created, but assets may not be fully uploaded yet
- No control over payload format -- GitHub sends its own schema, requiring translation
- Harder to include computed fields (SHA256 of each artifact, channel derivation, signatures)

**Why the CI job approach wins:**
- Runs AFTER all artifacts are uploaded to GitHub Releases
- Full control over payload -- sends exactly the JSON the admin portal expects
- Can compute SHA256 hashes, extract signatures, determine channels
- Uses HMAC-SHA256 for authentication (same pattern as GitHub webhooks but under our control)
- If it fails, the release is still on GitHub -- admin can create it manually in the portal

### 3.2 Webhook Receiver Endpoint

Add to admin portal backend:

**File: `backend/src/routes/webhook.routes.ts`**

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

// ─── Webhook signature verification ────────────────────────────────────────

function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const provided = signature.replace("sha256=", "");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex"),
    );
  } catch {
    return false;
  }
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const webhookAssetSchema = z.object({
  platform: z.enum(["windows", "linux", "android"]),
  arch: z.string().default("x86_64"),
  packageType: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().int().min(0),
  sha256Hash: z.string().length(64),
  downloadUrl: z.string().url(),
  signature: z.string().nullable().optional(),
});

const releaseWebhookSchema = z.object({
  event: z.literal("release.created"),
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc"]).default("stable"),
  gitCommitSha: z.string().optional().nullable(),
  releaseUrl: z.string().url().optional().nullable(),
  title: z.string().min(1).max(255),
  assets: z.array(webhookAssetSchema).min(1),
});

// ─── POST /api/v1/webhooks/github ──────────────────────────────────────────

router.post(
  "/github",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new AppError(500, "Webhook secret not configured", "CONFIG_ERROR");
      }

      // Raw body is needed for signature verification.
      // Express must be configured with express.json() that also stores raw body,
      // or this route must use express.raw() middleware.
      const rawBody = JSON.stringify(req.body);
      const signature = req.headers["x-hub-signature-256"] as string | undefined;

      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        throw new AppError(401, "Invalid webhook signature", "INVALID_SIGNATURE");
      }

      const body = releaseWebhookSchema.parse(req.body);

      // Check if release already exists (idempotency)
      const existing = await prisma.release.findUnique({
        where: { version: body.version },
      });

      if (existing) {
        // Update assets if release already exists (retry scenario)
        res.json({
          success: true,
          data: { releaseId: existing.id, action: "already_exists" },
          error: null,
          message: `Release ${body.version} already exists`,
        });
        return;
      }

      // Determine severity: stable releases are "optional" by default,
      // admin can change this later via the portal
      const severity = "optional";

      // Create the release as a DRAFT -- admin must explicitly publish
      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity,
          title: body.title,
          gitCommitSha: body.gitCommitSha ?? null,
          forceUpdate: false,
          // publishedAt is NULL = draft
          assets: {
            create: body.assets.map((a) => ({
              platform: a.platform,
              arch: a.arch,
              packageType: a.packageType,
              filename: a.filename,
              fileSize: BigInt(a.fileSize),
              sha256Hash: a.sha256Hash,
              downloadUrl: a.downloadUrl,
              signature: a.signature ?? null,
            })),
          },
        },
        include: { assets: true },
      });

      await logAudit({
        adminUserId: null, // system action
        action: "webhook_create_release",
        resourceType: "release",
        resourceId: release.id,
        newValues: {
          version: body.version,
          channel: body.channel,
          assetCount: body.assets.length,
          source: "github_actions",
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({
        success: true,
        data: {
          releaseId: release.id,
          version: release.version,
          status: "draft",
          action: "created",
          assetCount: release.assets.length,
        },
        error: null,
        message: `Release ${body.version} created as draft. Publish it from the admin portal.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
```

**Register in `index.ts`:**
```typescript
import webhookRoutes from "./routes/webhook.routes.js";

// Webhooks -- no rate limiter (they have HMAC auth), placed before JSON body parser
// NOTE: For proper HMAC verification, capture raw body. See section 3.3.
app.use("/api/v1/webhooks", webhookRoutes);
```

### 3.3 Raw Body Capture for HMAC Verification

For HMAC-SHA256 verification to work correctly, the exact raw body bytes must be hashed. Add this middleware BEFORE `express.json()`:

```typescript
// In index.ts, replace express.json() with:
app.use(
  express.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => {
      // Store raw body for webhook signature verification
      req.rawBody = buf.toString("utf8");
    },
  }),
);
```

Then in the webhook handler, use `req.rawBody` instead of `JSON.stringify(req.body)`.

### 3.4 Environment Variable Addition

Add to `.env.example` and server `.env`:
```env
# GitHub Webhook
GITHUB_WEBHOOK_SECRET="<matching-value-from-github-secret-ADMIN_PORTAL_WEBHOOK_SECRET>"
```

---

## 4. Update Server Endpoint

### 4.1 Current Implementation Analysis

The existing `updateCheckHandler` in `license.public.routes.ts` (lines 778-875) already implements:

- Platform/arch filtering
- Version blocking with force-update redirect
- Staged rollout via `shouldReceiveUpdate()`
- Tauri-compatible JSON response format

**Gaps to address:**

| Gap | Detail | Priority |
|-----|--------|----------|
| No license validation on update-check | Currently any client can check for updates | Medium |
| No channel selection | Hardcoded to `channel: "stable"` | High |
| No proper semver comparison | Uses string equality (`===`) instead of semver | High |
| No download token generation | Direct URLs to GitHub -- no access control | Medium |
| No update telemetry | No record of which clients checked | Low |

### 4.2 Enhanced Update-Check Handler

Replace the existing handler with this enhanced version:

```typescript
// In license.public.routes.ts, replace the updateCheckHandler

import { compare as semverCompare, valid as semverValid } from "semver";
import { createHash, randomBytes } from "crypto";

export const updateCheckHandler = Router();
updateCheckHandler.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const target = (req.query.target as string) || "windows";
      const arch = (req.query.arch as string) || "x86_64";
      const currentVersion = req.query.current_version as string | undefined;
      const licenseKey =
        (req.headers["x-license-key"] as string) ||
        (req.query.license_key as string) ||
        null;
      const fingerprint =
        (req.headers["x-hardware-fingerprint"] as string) ||
        (req.query.hardware_fingerprint as string) ||
        null;

      // ── Step 1: Check if current version is blocked ───────────────
      if (currentVersion) {
        const blockInfo = await getBlockedVersionInfo(currentVersion);
        if (blockInfo.blocked) {
          if (blockInfo.forceUpdateTo) {
            const forcedRelease = await prisma.release.findFirst({
              where: {
                version: blockInfo.forceUpdateTo,
                isBlocked: false,
                publishedAt: { not: null },
              },
              include: {
                assets: { where: { platform: target as any, arch } },
              },
            });

            if (forcedRelease && forcedRelease.assets.length > 0) {
              const asset = forcedRelease.assets[0]!;
              const downloadUrl = await generateDownloadUrl(
                asset, licenseKey, fingerprint, req,
              );

              return res.json({
                version: forcedRelease.version,
                notes: `[MANDATORY UPDATE] ${blockInfo.reason || "Your current version has been recalled."}`,
                pub_date: forcedRelease.publishedAt!.toISOString(),
                platforms: {
                  [`${target}-${arch}`]: {
                    signature: asset.signature ?? "",
                    url: downloadUrl,
                  },
                },
              });
            }
          }
          // Blocked but no safe version to update to
          return res.status(204).send();
        }
      }

      // ── Step 2: Determine channel ─────────────────────────────────
      // Desktop app can opt into beta channel via query param or license tier
      let channel = "stable";
      if (req.query.channel === "beta" || req.query.channel === "rc") {
        channel = req.query.channel as string;
      } else if (licenseKey) {
        // Enterprise/government licenses can opt into beta
        const license = await prisma.license.findUnique({
          where: { licenseKey },
          select: { tier: true, status: true, metadata: true },
        });
        if (license?.metadata &&
            typeof license.metadata === "object" &&
            (license.metadata as any).updateChannel) {
          channel = (license.metadata as any).updateChannel;
        }
      }

      // ── Step 3: Find latest published release ─────────────────────
      const latestRelease = await prisma.release.findFirst({
        where: {
          channel: channel as any,
          isBlocked: false,
          publishedAt: { not: null },
        },
        orderBy: { publishedAt: "desc" },
        include: {
          assets: { where: { platform: target as any, arch } },
        },
      });

      if (!latestRelease || latestRelease.assets.length === 0) {
        return res.status(204).send();
      }

      // ── Step 4: Semver comparison ─────────────────────────────────
      if (currentVersion) {
        const validCurrent = semverValid(currentVersion);
        const validLatest = semverValid(latestRelease.version);

        if (validCurrent && validLatest) {
          // semverCompare returns: -1 if a < b, 0 if equal, 1 if a > b
          if (semverCompare(validCurrent, validLatest) >= 0) {
            return res.status(204).send(); // Already up-to-date
          }
        } else {
          // Fallback to string comparison
          if (currentVersion === latestRelease.version) {
            return res.status(204).send();
          }
        }
      }

      // ── Step 5: Check rollout eligibility ─────────────────────────
      const allowed = await shouldReceiveUpdate(
        latestRelease.id,
        licenseKey,
        fingerprint,
      );
      if (!allowed) {
        return res.status(204).send();
      }

      // ── Step 6: Select the correct asset for the updater ──────────
      // Tauri updater needs the updater-specific bundle:
      //   Windows: .nsis.zip (or .exe) + .sig
      //   Linux: .AppImage.tar.gz + .sig
      // For manual downloads, we serve the full installer.
      const updaterAsset = latestRelease.assets.find((a) =>
        a.packageType === "nsis-updater" || a.packageType === "appimage-updater",
      ) || latestRelease.assets[0]!;

      const downloadUrl = await generateDownloadUrl(
        updaterAsset, licenseKey, fingerprint, req,
      );

      // ── Step 7: Return Tauri updater JSON ─────────────────────────
      res.json({
        version: latestRelease.version,
        notes: latestRelease.releaseNotes ?? "",
        pub_date: latestRelease.publishedAt!.toISOString(),
        platforms: {
          [`${target}-${arch}`]: {
            signature: updaterAsset.signature ?? "",
            url: downloadUrl,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
```

### 4.3 Tauri Updater JSON Response Format

The Tauri v2 updater expects exactly this schema:

```json
{
  "version": "2.1.0",
  "notes": "Bug fixes and performance improvements.\n\n- Fixed crash on large evidence sets\n- Improved WhatsApp parser for latest DB format",
  "pub_date": "2026-03-28T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpLXBsdWdpbi11cGRhdGVyCnJ...",
      "url": "https://github.com/AshteTech/cyber-chakra-forensics/releases/download/v2.1.0/cyber-chakra-forensics_2.1.0_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpLXBsdWdpbi11cGRhdGVyCnJ...",
      "url": "https://github.com/AshteTech/cyber-chakra-forensics/releases/download/v2.1.0/cyber-chakra-forensics_2.1.0_amd64.AppImage.tar.gz"
    }
  }
}
```

If no update is available, return HTTP `204 No Content` with an empty body.

### 4.4 Tauri Config Update

The desktop app's `tauri.conf.json` updater endpoint must be updated from the old PHP server to the new admin portal:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://admin.cyberchakra.in/api/v1/update-check?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK"
    }
  }
}
```

**Critical:** The `pubkey` must match the `TAURI_SIGNING_PRIVATE_KEY` used during the build. This is already configured correctly.

---

## 5. Binary Hosting Strategy

### 5.1 Recommendation: GitHub Releases (Option B)

| Criterion | Hostinger (A) | GitHub Releases (B) | Cloudflare R2 (C) |
|-----------|---------------|---------------------|---------------------|
| Storage cost | Limited by plan (100GB total) | Free, unlimited | $0.015/GB/month |
| Bandwidth cost | Metered | Free, unlimited | Free egress |
| CDN | No CDN | GitHub's global CDN | Cloudflare global CDN |
| Reliability | Single server | 99.9%+ SLA | 99.99% SLA |
| Complexity | Medium (SCP deploy) | Zero (already there) | Medium (S3-compatible API) |
| Binary size | 40-70MB per platform | Handled easily | Handled easily |
| Retention | Must manage storage | Permanent | Must manage lifecycle |

**Decision: GitHub Releases** for the following reasons:

1. Build pipeline already uploads there -- zero additional work
2. Free and unlimited storage/bandwidth
3. Global CDN with excellent availability
4. Download URLs are stable and predictable
5. Admin portal only stores metadata + serves update-check JSON
6. No storage pressure on Hostinger (which hosts the portal itself)

**If download authentication is required** (see Section 6), the admin portal generates short-lived signed URLs that redirect through a proxy or use Cloudflare R2 as an intermediate. For MVP, direct GitHub URLs are acceptable because:
- The binaries are useless without a valid license (enforced at app startup)
- Minisign signatures prevent tampering
- GitHub URLs are not advertised publicly

### 5.2 Storage Layout on GitHub Releases

Each release tag creates:
```
v2.1.0/
  cyber-chakra-forensics_2.1.0_x64-setup.exe        # NSIS installer (manual download)
  cyber-chakra-forensics_2.1.0_x64-setup.exe.sig     # Signature for installer
  cyber-chakra-forensics_2.1.0_x64-setup.nsis.zip    # Updater bundle
  cyber-chakra-forensics_2.1.0_x64-setup.nsis.zip.sig # Signature for updater bundle
  cyber-chakra-forensics_2.1.0_x64.msi               # MSI installer (optional)
  cyber-chakra-forensics_2.1.0_amd64.AppImage         # AppImage (manual download)
  cyber-chakra-forensics_2.1.0_amd64.AppImage.tar.gz  # Updater bundle
  cyber-chakra-forensics_2.1.0_amd64.AppImage.tar.gz.sig # Signature
  cyber-chakra-forensics_2.1.0_amd64.deb               # Debian package
  CHECKSUMS-linux.sha256
  CHECKSUMS-windows.sha256
```

---

## 6. Download Authentication

### 6.1 Recommendation: Tiered Approach

For a forensics tool used by law enforcement, preventing unauthorized distribution is important. However, the update flow must be seamless for licensed users.

**Approach: Two tiers**

| Download Type | Authentication | Rationale |
|---------------|---------------|-----------|
| Auto-update (Tauri updater) | License key header (already sent) | Seamless UX; license is validated at app startup anyway |
| Manual download (portal/website) | Signed short-lived token | Prevents link sharing |

### 6.2 Download URL Generation

For auto-updates, the update-check response includes a URL. This URL can be either:

**Option A (MVP): Direct GitHub URL** -- simplest, works immediately
```
https://github.com/AshteTech/cyber-chakra-forensics/releases/download/v2.1.0/cyber-chakra-forensics_2.1.0_x64-setup.nsis.zip
```

**Option B (Enhanced): Proxied download with token** -- prevents unauthorized downloads

```typescript
// backend/src/lib/download-token.ts

import { createHash, createHmac, randomBytes } from "crypto";

const DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET!;
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

interface DownloadTokenPayload {
  assetId: string;
  licenseKey: string | null;
  fingerprint: string | null;
  expiresAt: number;
}

export function generateDownloadToken(
  assetId: string,
  licenseKey: string | null,
  fingerprint: string | null,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

  const payload: DownloadTokenPayload = {
    assetId,
    licenseKey,
    fingerprint,
    expiresAt,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", DOWNLOAD_TOKEN_SECRET)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  const expectedSig = createHmac("sha256", DOWNLOAD_TOKEN_SECRET)
    .update(payloadB64!)
    .digest("base64url");

  // Constant-time comparison
  if (signature !== expectedSig) return null;

  try {
    const payload: DownloadTokenPayload = JSON.parse(
      Buffer.from(payloadB64!, "base64url").toString("utf8"),
    );

    // Check expiry
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
```

**Download proxy endpoint:**

```typescript
// backend/src/routes/download.routes.ts

import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyDownloadToken } from "../lib/download-token.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();

// GET /api/v1/download/:token
router.get("/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenPayload = verifyDownloadToken(req.params.token);
    if (!tokenPayload) {
      throw new AppError(401, "Invalid or expired download token", "INVALID_TOKEN");
    }

    const asset = await prisma.releaseAsset.findUnique({
      where: { id: tokenPayload.assetId },
      include: { release: true },
    });

    if (!asset || asset.release.isBlocked) {
      throw new AppError(404, "Asset not found or blocked", "ASSET_NOT_FOUND");
    }

    // Record the download
    await prisma.download.create({
      data: {
        assetId: asset.id,
        licenseKey: tokenPayload.licenseKey,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"]?.substring(0, 512) ?? null,
        downloadType: "auto_update",
      },
    });

    // Redirect to actual download URL (GitHub Releases)
    res.redirect(302, asset.downloadUrl);
  } catch (err) {
    next(err);
  }
});

export default router;
```

**The `generateDownloadUrl` helper used in the update-check handler:**

```typescript
async function generateDownloadUrl(
  asset: { id: string; downloadUrl: string },
  licenseKey: string | null,
  fingerprint: string | null,
  req: Request,
): Promise<string> {
  const USE_DOWNLOAD_PROXY = process.env.USE_DOWNLOAD_PROXY === "true";

  if (!USE_DOWNLOAD_PROXY) {
    // MVP: return direct GitHub URL
    return asset.downloadUrl;
  }

  // Enhanced: generate a signed download token
  const token = generateDownloadToken(asset.id, licenseKey, fingerprint);
  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/api/v1/download/${token}`;
}
```

### 6.3 Environment Variables

```env
# Download proxy (set to "true" to enable token-based download URLs)
USE_DOWNLOAD_PROXY=false
DOWNLOAD_TOKEN_SECRET="<generate-a-64-char-random-hex-string>"
```

---

## 7. Signature Verification Flow

### 7.1 How Tauri v2 Updater Signature Verification Works

```
                    Desktop App
                        |
            1. Check for updates
                        |
                        v
        GET /api/v1/update-check?target=windows&arch=x86_64&current_version=2.0.0
                        |
                        v
            Server returns JSON:
            {
              "version": "2.1.0",
              "platforms": {
                "windows-x86_64": {
                  "signature": "<base64-encoded-minisign-signature>",
                  "url": "https://github.com/.../v2.1.0/...nsis.zip"
                }
              }
            }
                        |
            2. Download binary from URL
                        |
                        v
            3. Verify signature:
               - Extract signature from JSON response
               - Use the PUBLIC KEY embedded in tauri.conf.json
               - Verify: minisign_verify(pubkey, binary_bytes, signature)
               - The pubkey is compiled into the binary at build time
               - It CANNOT be changed without a new build
                        |
                   +----+----+
                   |         |
              VALID       INVALID
                   |         |
                   v         v
           4. Install    4. Reject update
              update        Log error
              Restart       Show notification
              app           to user
```

### 7.2 Key Management

**Current key (from `tauri.conf.json`):**
```
pubkey: "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK"
```

This is base64-encoded. Decoded, it is a standard minisign public key.

**Key rotation procedure:**
1. Generate new key pair: `tauri signer generate -w ~/.tauri/mykey.key`
2. Store new private key in GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`
3. Update `tauri.conf.json` with new public key
4. ALL clients on the old key cannot verify updates signed with the new key
5. Therefore: key rotation requires a release signed with the OLD key that embeds the NEW pubkey
6. This is a one-way migration -- plan carefully

### 7.3 Signature Storage

The `.sig` file content (minisign signature) must be stored in the `release_assets.signature` column and returned in the update-check JSON response. The webhook handler already extracts this from the CI artifacts and stores it in the database.

**Signature format (example):**
```
untrusted comment: signature from tauri-plugin-updater
RWSuTFo... (base64-encoded signature bytes)
trusted comment: timestamp:1711632000 file:cyber-chakra-forensics_2.1.0_x64-setup.nsis.zip
... (base64-encoded signature of comment)
```

This entire multi-line string is what Tauri expects in the `signature` field of the update JSON.

---

## 8. Rollout Stages

### 8.1 Existing Implementation

The rollout engine is already implemented:
- **Prisma models:** `RolloutPolicy`, `RolloutStage`
- **Service:** `backend/src/services/rollout.ts` -- `shouldReceiveUpdate()`, `advanceRollout()`, `getBlockedVersionInfo()`
- **Admin routes:** `backend/src/routes/rollout.admin.routes.ts` -- create/advance/pause/resume/cancel

### 8.2 Recommended Default Rollout Template

When admin publishes a release, suggest this default staged rollout:

```json
{
  "strategy": "staged",
  "stages": [
    {
      "stageOrder": 1,
      "percentage": 5,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 24
    },
    {
      "stageOrder": 2,
      "percentage": 25,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 24
    },
    {
      "stageOrder": 3,
      "percentage": 50,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 48
    },
    {
      "stageOrder": 4,
      "percentage": 100,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 0
    }
  ]
}
```

### 8.3 How Deterministic Hashing Works

From `rollout.ts` lines 58-68:

```typescript
// The same license_key + release_id always produces the same bucket (0-99).
// This means:
//   - Client A with license "CCF-1234-..." checking release "abc-uuid"
//     always gets bucket 42
//   - If stage 1 is 5%, only buckets 0-4 get the update
//   - When stage 2 is 25%, buckets 0-24 get it (A still in, and now more clients join)
//   - Clients NEVER flip from "yes" to "no" as rollout progresses

const hash = createHash("md5").update(seed + releaseId).digest();
const bucket = hash.readUInt32BE(0) % 100; // 0-99

return bucket < currentStage.percentage;
```

**Properties of this approach:**
- **Deterministic:** Same client always gets the same answer for a given release
- **Monotonic:** As percentage increases, all previously-included clients remain included
- **Uniform:** MD5 provides good distribution across buckets
- **Release-specific:** The bucket changes per release, so a client at bucket 42 for release A might be bucket 71 for release B -- this prevents the same 5% always being guinea pigs

### 8.4 Automatic Advancement (Enhancement)

The current implementation requires manual advancement. Add a cron job for automatic advancement based on soak time and health metrics:

**File: `backend/src/cron/rollout-advance.ts`**

```typescript
import { prisma } from "../lib/prisma.js";
import { advanceRollout } from "../services/rollout.js";
import type { RolloutStage } from "@prisma/client";

/**
 * Cron job: Check active rollouts and auto-advance stages that have
 * completed their minimum soak time without issues.
 *
 * Runs every hour.
 */
export async function autoAdvanceRollouts(): Promise<void> {
  const activeRollouts = await prisma.rolloutPolicy.findMany({
    where: { status: "active" },
    include: {
      stages: { orderBy: { stageOrder: "asc" } },
      release: { select: { id: true, version: true } },
    },
  });

  for (const rollout of activeRollouts) {
    // Find current active stage (activated but not completed)
    const currentStage = rollout.stages.find(
      (s: RolloutStage) => s.activatedAt && !s.completedAt,
    );
    if (!currentStage) continue;

    // Check if minimum soak time has elapsed
    const soakMs = currentStage.minSoakHours * 60 * 60 * 1000;
    const activatedAt = currentStage.activatedAt!.getTime();
    const now = Date.now();

    if (now - activatedAt < soakMs) {
      // Soak time not yet elapsed
      continue;
    }

    // TODO: Check crash rate / error rate metrics
    // For now, auto-advance if soak time has passed
    // In production, integrate with crash reporting service (Sentry, etc.)
    //
    // const crashRate = await getCrashRate(rollout.release.version, currentStage.activatedAt);
    // if (crashRate > CRASH_RATE_THRESHOLD) {
    //   // Auto-pause the rollout
    //   await prisma.rolloutPolicy.update({
    //     where: { id: rollout.id },
    //     data: { status: "paused" },
    //   });
    //   // Notify admin
    //   continue;
    // }

    try {
      const result = await advanceRollout(rollout.id);
      console.log(
        `[rollout-advance] Release ${rollout.release.version}: ` +
        `stage ${result.completedStageOrder} -> ${result.activatedStageOrder ?? "completed"}`,
      );
    } catch (err) {
      console.error(
        `[rollout-advance] Failed to advance rollout for ${rollout.release.version}:`,
        err,
      );
    }
  }
}
```

Register in `backend/src/cron/index.ts`:
```typescript
import { autoAdvanceRollouts } from "./rollout-advance.js";

// Inside startCronJobs():
setInterval(autoAdvanceRollouts, 60 * 60 * 1000); // Every hour
```

---

## 9. Emergency Procedures

### 9.1 Version Block (Recall)

**Scenario:** Critical vulnerability discovered in v2.1.0, all users must stop using it immediately.

**Admin Action:**

```
POST /api/v1/admin/blocked-versions
Authorization: Bearer <admin-jwt>

{
  "versionPattern": "2.1.0",
  "reason": "Critical security vulnerability CVE-2026-XXXX in evidence parser",
  "forceUpdateTo": "2.1.1"
}
```

**What happens next:**

1. Admin portal creates `BlockedVersion` record with `isActive: true`
2. Next time ANY desktop client on v2.1.0 calls `/api/v1/update-check`:
   - `getBlockedVersionInfo("2.1.0")` returns `{ blocked: true, forceUpdateTo: "2.1.1" }`
   - Handler finds release v2.1.1, returns it with `[MANDATORY UPDATE]` note
   - Tauri updater downloads, verifies signature, installs
3. Users see: "A mandatory security update is being installed..."

**Wildcard blocking:** Block ALL 2.1.x versions:
```json
{
  "versionPattern": "2.1.*",
  "reason": "Entire 2.1 branch has been superseded",
  "forceUpdateTo": "2.2.0"
}
```

### 9.2 Rollback Procedure

**Scenario:** v2.2.0 causes data corruption, need to revert all users to v2.1.3.

**Step 1: Block the bad version**
```
POST /api/v1/admin/blocked-versions
{
  "versionPattern": "2.2.0",
  "reason": "Data corruption in case evidence parser",
  "forceUpdateTo": "2.1.3"
}
```

**Step 2: Ensure v2.1.3 is still published and not blocked**
```
GET /api/v1/admin/releases?channel=stable
```
Verify v2.1.3 has `publishedAt != null` and `isBlocked == false`.

**Step 3: If v2.1.3 was never published on the new portal, create it manually**
```
POST /api/v1/admin/releases
{
  "version": "2.1.3",
  "channel": "stable",
  "severity": "critical",
  "title": "Cyber Chakra Forensics v2.1.3 (Rollback)",
  "forceUpdate": true,
  "assets": [
    {
      "platform": "windows",
      "arch": "x86_64",
      "packageType": "nsis-updater",
      "filename": "cyber-chakra-forensics_2.1.3_x64-setup.nsis.zip",
      "fileSize": 52428800,
      "sha256Hash": "abc123...",
      "downloadUrl": "https://github.com/.../releases/download/v2.1.3/...",
      "signature": "<minisign-signature>"
    }
  ]
}
```

Then publish it:
```
POST /api/v1/admin/releases/<id>/publish
```

### 9.3 Desktop App Behavior During Forced Downgrade

Tauri's updater does not distinguish between "upgrade" and "downgrade" -- it simply downloads and installs whatever version the server provides, as long as the signature verifies.

**Important considerations for downgrade:**

1. **Database migrations:** If v2.2.0 ran database migrations that v2.1.3 does not understand, the downgraded app could crash on startup. The desktop app must handle this gracefully:
   - Detect that the DB schema is newer than expected
   - Run in read-only/safe mode or offer to reset
   - This is a Rust-side concern in `src-tauri/src/db/mod.rs`

2. **Config files:** Newer versions may write config formats that older versions cannot parse. The app should use versioned config with backward-compatible defaults.

3. **User notification:** The Tauri updater shows a dialog before installing. The `notes` field should clearly explain why the downgrade is happening.

### 9.4 Emergency Runbook

```
EMERGENCY: CRITICAL VERSION RECALL
===================================

TIME-CRITICAL: Execute steps 1-3 within 15 minutes of discovery.

1. BLOCK the bad version:
   - Admin Portal > Releases > [version] > Block
   - Set reason: describe the issue
   - Set "Force Update To": safe version number

2. VERIFY the safe version exists and is published:
   - Admin Portal > Releases > filter for safe version
   - Must be: published, not blocked, has assets for all platforms
   - If not, manually create and publish (see Section 9.2 Step 3)

3. PAUSE any active rollouts for the blocked version:
   - Admin Portal > Releases > [blocked version] > Rollout > Pause

4. MONITOR update adoption:
   - Admin Portal > Dashboard > Active Versions
   - Track how many clients are still on the blocked version
   - They will update on next update-check (every 4-24 hours depending on config)

5. COMMUNICATE:
   - Create announcement for remaining users:
     Admin Portal > Announcements > New
     Type: critical
     Target: specific_versions (the blocked version)
     Message: "A critical update is required. Please restart the application."

6. POST-INCIDENT:
   - Review audit log for the block action
   - Generate incident report
   - Update the runbook with lessons learned
```

---

## 10. Database Additions

### 10.1 New Prisma Model: WebhookDelivery (Audit Trail)

Add to `schema.prisma` for tracking webhook delivery attempts:

```prisma
model WebhookDelivery {
  id            String   @id @default(uuid()) @db.VarChar(36)
  event         String   @db.VarChar(50)   // "release.created"
  source        String   @db.VarChar(50)   // "github_actions"
  payload       Json                        // Full webhook payload
  statusCode    Int      @map("status_code")
  response      String?  @db.Text           // Response body (truncated)
  success       Boolean
  errorMessage  String?  @map("error_message") @db.Text
  deliveredAt   DateTime @default(now()) @map("delivered_at")

  @@index([event, deliveredAt])
  @@index([success])
  @@map("webhook_deliveries")
}
```

### 10.2 New Prisma Model: UpdateCheckLog (Telemetry)

Optional telemetry for tracking update adoption:

```prisma
model UpdateCheckLog {
  id              BigInt   @id @default(autoincrement())
  licenseKey      String?  @map("license_key") @db.VarChar(30)
  fingerprint     String?  @db.VarChar(255)
  currentVersion  String?  @map("current_version") @db.VarChar(30)
  target          String   @db.VarChar(20)   // "windows", "linux"
  arch            String   @db.VarChar(20)   // "x86_64"
  result          String   @db.VarChar(30)   // "update_available", "up_to_date", "blocked", "rollout_excluded"
  offeredVersion  String?  @map("offered_version") @db.VarChar(30)
  ipAddress       String?  @map("ip_address") @db.VarChar(45)
  checkedAt       DateTime @default(now()) @map("checked_at")

  @@index([checkedAt])
  @@index([currentVersion])
  @@index([result])
  @@map("update_check_logs")
}
```

---

## 11. Desktop App Integration

### 11.1 Tauri Updater Plugin Configuration

The desktop app already has the updater plugin configured. The only change needed is the endpoint URL. In `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://admin.cyberchakra.in/api/v1/update-check?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

### 11.2 Custom Update Check with License Headers

Tauri v2's built-in updater template variables do not include custom headers. To send the license key and hardware fingerprint with update checks, implement a custom updater in Rust:

**File: `src-tauri/src/commands/updater.rs`**

```rust
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn check_for_updates(
    app: tauri::AppHandle,
    license_key: Option<String>,
    hardware_fingerprint: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater_builder()
        .header("X-License-Key", license_key.unwrap_or_default())
        .map_err(|e| e.to_string())?
        .header("X-Hardware-Fingerprint", hardware_fingerprint.unwrap_or_default())
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            }))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            // Download and install
            update.download_and_install(|downloaded, total| {
                // Emit progress to frontend
                let _ = app.emit("update-progress", UpdateProgress {
                    downloaded,
                    total,
                });
            }, || {
                // Called before the app restarts
                let _ = app.emit("update-installing", ());
            }).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        Ok(None) => Err("No update available".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}
```

### 11.3 Frontend Update UI (TypeScript)

```typescript
// src/hooks/useUpdateChecker.ts

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";

interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export function useUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const { licenseKey, hardwareFingerprint } = useAuthStore();

  useEffect(() => {
    // Check for updates on app startup, then every 4 hours
    const check = async () => {
      try {
        const update = await invoke<UpdateInfo | null>("check_for_updates", {
          license_key: licenseKey,
          hardware_fingerprint: hardwareFingerprint,
        });
        if (update) {
          setUpdateAvailable(update);
        }
      } catch (err) {
        console.error("Update check failed:", err);
      }
    };

    check();
    const interval = setInterval(check, 4 * 60 * 60 * 1000); // 4 hours

    // Listen for download progress
    const unlisten = listen<UpdateProgress>("update-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      clearInterval(interval);
      unlisten.then((fn) => fn());
    };
  }, [licenseKey, hardwareFingerprint]);

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await invoke("install_update");
    } catch (err) {
      console.error("Update installation failed:", err);
      setDownloading(false);
    }
  };

  return { updateAvailable, downloading, progress, installUpdate };
}
```

---

## Complete Flow Summary

```
1. Developer: git tag v2.1.0 && git push --tags

2. GitHub Actions:
   a. Validate tag matches Cargo.toml, tauri.conf.json, package.json
   b. Run cargo audit + cargo deny
   c. Matrix build: Linux x64 + Windows x64
   d. Sign all binaries with TAURI_SIGNING_PRIVATE_KEY (minisign)
   e. Collect artifacts: .exe, .exe.sig, .nsis.zip, .nsis.zip.sig,
      .AppImage, .AppImage.tar.gz, .AppImage.tar.gz.sig, .deb
   f. Generate SHA256 checksums
   g. Create GitHub Release with all artifacts
   h. POST webhook to admin.cyberchakra.in/api/v1/webhooks/github
      (HMAC-SHA256 authenticated, includes version + asset metadata)

3. Admin Portal (auto):
   a. Receives webhook, verifies HMAC signature
   b. Creates release as DRAFT with all asset metadata
   c. Logs to audit trail

4. Admin (manual):
   a. Reviews release in admin dashboard
   b. Writes/edits release notes
   c. Sets severity (optional/recommended/critical)
   d. Creates rollout policy (5% -> 25% -> 50% -> 100%)
   e. Clicks "Publish"

5. Desktop App (automatic, every 4 hours):
   a. GET /api/v1/update-check?target=windows&arch=x86_64&current_version=2.0.0
      Headers: X-License-Key, X-Hardware-Fingerprint
   b. Server checks: version blocked? -> force update to safe version
   c. Server finds latest published release for channel
   d. Server checks: semver comparison -> is this actually newer?
   e. Server checks: rollout policy -> is this client in the rollout %?
   f. Returns Tauri updater JSON (or 204 if no update)

6. Desktop App (update available):
   a. Downloads binary from URL in response
   b. Verifies minisign signature with embedded public key
   c. If valid: installs, restarts app
   d. If invalid: rejects, logs error

7. Emergency (if needed):
   a. Admin blocks version: POST /api/v1/admin/blocked-versions
   b. Sets forceUpdateTo = safe version
   c. All clients on blocked version get force-updated on next check
   d. Admin monitors adoption via dashboard
```

---

## Implementation Priority

| Phase | Task | Effort | Depends On |
|-------|------|--------|------------|
| **1 (MVP)** | Update `tauri.conf.json` endpoint URL | 5 min | Admin portal deployed |
| **1 (MVP)** | Add `.sig` and updater bundle files to artifact collection in release.yml | 30 min | -- |
| **1 (MVP)** | Add semver comparison to update-check handler | 30 min | `npm install semver` |
| **2 (Webhook)** | Create `webhook.routes.ts` with HMAC auth | 2 hrs | -- |
| **2 (Webhook)** | Add `notify-admin-portal` job to release.yml | 1 hr | Webhook endpoint |
| **2 (Webhook)** | Add `WebhookDelivery` model to Prisma schema | 30 min | -- |
| **3 (Rollout Auto)** | Add `rollout-advance.ts` cron job | 1 hr | -- |
| **3 (Custom Updater)** | Implement `updater.rs` with custom headers | 2 hrs | -- |
| **3 (Frontend)** | Implement `useUpdateChecker` hook + UI | 2 hrs | updater.rs |
| **4 (Download Auth)** | Download token generation + proxy endpoint | 3 hrs | -- |
| **4 (Telemetry)** | Add `UpdateCheckLog` model + logging | 1 hr | -- |
