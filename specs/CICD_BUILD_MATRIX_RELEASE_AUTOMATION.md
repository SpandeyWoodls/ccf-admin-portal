# CI/CD Build Matrix & Release Automation

> Agent 9 Research Document
> Generated: 2026-03-28
> Status: Complete specification for GitHub Actions release pipeline

---

## Table of Contents

1. [Release Trigger Strategy](#1-release-trigger-strategy)
2. [Build Matrix Design](#2-build-matrix-design)
3. [Complete Release Workflow](#3-complete-release-workflow)
4. [Pre-release Beta Workflow](#4-pre-release-beta-workflow)
5. [Signing Configuration](#5-signing-configuration)
6. [Artifact Naming Convention](#6-artifact-naming-convention)
7. [Webhook to Admin Portal](#7-webhook-to-admin-portal)
8. [Version Sync Script](#8-version-sync-script)
9. [GitHub Secrets Inventory](#9-github-secrets-inventory)
10. [Local Verification Procedures](#10-local-verification-procedures)
11. [Existing Infrastructure Audit](#11-existing-infrastructure-audit)

---

## 1. Release Trigger Strategy

### Recommendation: Tag push (Option A)

Tag-push triggering is the correct choice for CMF for three reasons:

1. **Determinism** -- the tag is immutable and tied to a specific commit. A GitHub Release can be edited after the fact; a workflow_dispatch can be run on the wrong branch.
2. **Automation** -- the version sync script (section 8) creates the commit and pushes the tag in one atomic operation. No manual UI clicks required.
3. **Pre-release support** -- semver pre-release tags (`v2.1.0-beta.1`) are parsed by the same trigger with a regex, letting a single workflow handle both stable and beta channels.

The existing `release.yml` already uses `on: push: tags: ["v*"]`. The enhanced workflow below preserves this trigger.

### Tag Format Convention

```
Stable:      v2.1.0
Beta:        v2.1.0-beta.1
RC:          v2.1.0-rc.1
Alpha:       v2.1.0-alpha.1
```

The workflow extracts the channel from the tag suffix. Any tag without a pre-release suffix is treated as `stable`.

---

## 2. Build Matrix Design

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - os: windows-latest
        target: x86_64-pc-windows-msvc
        rust_target: x86_64-pc-windows-msvc
        bundle_formats: nsis
        platform_label: windows
        artifact_suffix: windows_x64
        shell: pwsh
      - os: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
        rust_target: x86_64-unknown-linux-gnu
        bundle_formats: appimage,deb
        platform_label: linux
        artifact_suffix: linux_x64
        shell: bash
```

### Why Not macOS / ARM64?

CMF targets law-enforcement agencies in India where Windows and Linux (Ubuntu) are the deployment platforms. macOS and ARM are excluded from the current matrix. If needed later, add:

```yaml
      - os: macos-latest
        target: aarch64-apple-darwin
        rust_target: aarch64-apple-darwin
        bundle_formats: dmg
        platform_label: macos
        artifact_suffix: macos_arm64
        shell: bash
```

---

## 3. Complete Release Workflow

This is the full replacement for `.github/workflows/release.yml`. It supersedes the existing file with enhancements for admin portal webhook notifications, unified checksum generation, proper artifact renaming, .sig file collection, and structured changelog generation.

```yaml
# .github/workflows/release.yml
# ─────────────────────────────────────────────────────────────────────────────
# Cyber Chakra Forensics -- Release Pipeline
# Triggered by tag push: v2.1.0, v2.1.0-beta.1, v2.1.0-rc.1, etc.
# ─────────────────────────────────────────────────────────────────────────────

name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

env:
  CARGO_TERM_COLOR: always
  NODE_VERSION: "20"

jobs:
  # ═════════════════════════════════════════════════════════════════════════════
  # Stage 1: Validate tag, check version consistency
  # ═════════════════════════════════════════════════════════════════════════════
  validate:
    name: Validate Release Tag
    runs-on: ubuntu-22.04
    outputs:
      version: ${{ steps.meta.outputs.version }}
      channel: ${{ steps.meta.outputs.channel }}
      prerelease: ${{ steps.meta.outputs.prerelease }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract release metadata
        id: meta
        run: |
          TAG="${GITHUB_REF#refs/tags/v}"
          echo "Raw tag: $TAG"

          # Extract base version (strip pre-release suffix)
          VERSION=$(echo "$TAG" | sed -E 's/-(alpha|beta|rc)\.[0-9]+$//')
          echo "version=$TAG" >> $GITHUB_OUTPUT

          # Determine channel
          if echo "$TAG" | grep -qE '\-alpha\.'; then
            CHANNEL="alpha"
            PRERELEASE="true"
          elif echo "$TAG" | grep -qE '\-beta\.'; then
            CHANNEL="beta"
            PRERELEASE="true"
          elif echo "$TAG" | grep -qE '\-rc\.'; then
            CHANNEL="rc"
            PRERELEASE="true"
          else
            CHANNEL="stable"
            PRERELEASE="false"
          fi

          echo "channel=$CHANNEL" >> $GITHUB_OUTPUT
          echo "prerelease=$PRERELEASE" >> $GITHUB_OUTPUT

          echo "Version: $TAG"
          echo "Channel: $CHANNEL"
          echo "Pre-release: $PRERELEASE"

      - name: Validate version consistency across manifests
        run: |
          TAG="${GITHUB_REF#refs/tags/v}"
          # For pre-release tags, the manifest files contain the base version
          BASE_VERSION=$(echo "$TAG" | sed -E 's/-(alpha|beta|rc)\.[0-9]+$//')

          ERRORS=0

          # Check Cargo.toml
          CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)
          if [ "$CARGO_VERSION" != "$BASE_VERSION" ]; then
            echo "::error::Cargo.toml version ($CARGO_VERSION) != expected ($BASE_VERSION)"
            ERRORS=$((ERRORS + 1))
          fi

          # Check tauri.conf.json
          TAURI_VERSION=$(jq -r '.version' src-tauri/tauri.conf.json)
          if [ "$TAURI_VERSION" != "$BASE_VERSION" ]; then
            echo "::error::tauri.conf.json version ($TAURI_VERSION) != expected ($BASE_VERSION)"
            ERRORS=$((ERRORS + 1))
          fi

          # Check package.json
          PKG_VERSION=$(jq -r '.version' package.json)
          if [ "$PKG_VERSION" != "$BASE_VERSION" ]; then
            echo "::error::package.json version ($PKG_VERSION) != expected ($BASE_VERSION)"
            ERRORS=$((ERRORS + 1))
          fi

          # Check config/version.json
          if [ -f config/version.json ]; then
            CFG_VERSION=$(jq -r '.version' config/version.json)
            if [ "$CFG_VERSION" != "$BASE_VERSION" ]; then
              echo "::error::config/version.json version ($CFG_VERSION) != expected ($BASE_VERSION)"
              ERRORS=$((ERRORS + 1))
            fi
          fi

          if [ "$ERRORS" -gt 0 ]; then
            echo "::error::Version mismatch detected in $ERRORS file(s). Run: ./scripts/bump-version.sh $BASE_VERSION"
            exit 1
          fi

          echo "Version validation passed: $BASE_VERSION (tag: $TAG)"

  # ═════════════════════════════════════════════════════════════════════════════
  # Stage 2: Pre-release security gate
  # ═════════════════════════════════════════════════════════════════════════════
  security-check:
    name: Pre-Release Security Check
    needs: validate
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Cache cargo tools
        uses: actions/cache@v4
        with:
          path: ~/.cargo/bin
          key: cargo-tools-audit-deny-v1

      - name: Install security tools
        run: |
          command -v cargo-audit  || cargo install cargo-audit --locked
          command -v cargo-deny   || cargo install cargo-deny --locked

      - name: Run vulnerability audit
        run: cargo audit
        working-directory: src-tauri

      - name: Run license compliance check
        run: cargo deny check licenses
        working-directory: src-tauri

      - name: Run banned crate check
        run: cargo deny check bans
        working-directory: src-tauri

  # ═════════════════════════════════════════════════════════════════════════════
  # Stage 3: Cross-platform build matrix
  # ═════════════════════════════════════════════════════════════════════════════
  build-release:
    name: Build (${{ matrix.platform_label }})
    needs: [validate, security-check]
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            platform_label: windows
            rust_target: x86_64-pc-windows-msvc
            artifact_suffix: windows_x64
          - os: ubuntu-22.04
            platform_label: linux
            rust_target: x86_64-unknown-linux-gnu
            artifact_suffix: linux_x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      # ── System dependencies (Linux) ──────────────────────────────────────
      - name: Install Linux system dependencies
        if: matrix.platform_label == 'linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            libssl-dev \
            libayatana-appindicator3-dev

      # ── Rust toolchain ───────────────────────────────────────────────────
      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.rust_target }}

      # ── Node.js ──────────────────────────────────────────────────────────
      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      # ── Cargo cache ──────────────────────────────────────────────────────
      - name: Cache cargo registry and build artifacts
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-release-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-release-
            ${{ runner.os }}-cargo-

      # ── Install Tauri CLI ────────────────────────────────────────────────
      - name: Install Tauri CLI
        run: cargo install tauri-cli --locked

      # ── Frontend build ───────────────────────────────────────────────────
      - name: Install frontend dependencies
        run: npm ci

      # ── Tauri build with signing ─────────────────────────────────────────
      - name: Build Tauri application
        run: cargo tauri build --verbose
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      # ── Rename artifacts to standard convention (Linux) ──────────────────
      - name: Rename and collect artifacts (Linux)
        if: matrix.platform_label == 'linux'
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          BUNDLE="src-tauri/target/release/bundle"
          STAGING="release-staging"
          mkdir -p "$STAGING"

          # AppImage
          for f in "$BUNDLE"/appimage/*.AppImage; do
            [ -f "$f" ] || continue
            DEST="$STAGING/Cyber_Chakra_Forensics_${VERSION}_linux_x64.AppImage"
            cp "$f" "$DEST"
            # Copy .sig if present (Tauri generates .AppImage.sig alongside)
            [ -f "${f}.sig" ] && cp "${f}.sig" "${DEST}.sig"
          done

          # DEB
          for f in "$BUNDLE"/deb/*.deb; do
            [ -f "$f" ] || continue
            DEST="$STAGING/Cyber_Chakra_Forensics_${VERSION}_linux_x64.deb"
            cp "$f" "$DEST"
            [ -f "${f}.sig" ] && cp "${f}.sig" "${DEST}.sig"
          done

          echo "Staged artifacts:"
          ls -lh "$STAGING/"

      # ── Rename artifacts to standard convention (Windows) ────────────────
      - name: Rename and collect artifacts (Windows)
        if: matrix.platform_label == 'windows'
        shell: pwsh
        run: |
          $VERSION = "${{ needs.validate.outputs.version }}"
          $BUNDLE = "src-tauri/target/release/bundle"
          $STAGING = "release-staging"
          New-Item -ItemType Directory -Force -Path $STAGING | Out-Null

          # NSIS installer
          Get-ChildItem "$BUNDLE/nsis/*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
            $dest = "$STAGING/Cyber_Chakra_Forensics_${VERSION}_windows_x64-setup.exe"
            Copy-Item $_.FullName $dest
            # Copy .sig if present (Tauri generates .exe.sig alongside)
            $sigPath = "$($_.FullName).sig"
            if (Test-Path $sigPath) {
              Copy-Item $sigPath "$dest.sig"
            }
            # Also copy .nsis.zip.sig if generated
            $zipSig = "$($_.FullName).nsis.zip.sig"
            if (Test-Path $zipSig) {
              Copy-Item $zipSig "$STAGING/Cyber_Chakra_Forensics_${VERSION}_windows_x64-setup.exe.nsis.zip.sig"
            }
          }

          # MSI installer (if generated)
          Get-ChildItem "$BUNDLE/msi/*.msi" -ErrorAction SilentlyContinue | ForEach-Object {
            $dest = "$STAGING/Cyber_Chakra_Forensics_${VERSION}_windows_x64.msi"
            Copy-Item $_.FullName $dest
            $sigPath = "$($_.FullName).sig"
            if (Test-Path $sigPath) {
              Copy-Item $sigPath "$dest.sig"
            }
          }

          Write-Host "Staged artifacts:"
          Get-ChildItem $STAGING | Format-Table Name, Length

      # ── Generate per-platform checksums ──────────────────────────────────
      - name: Generate SHA256 checksums (Linux)
        if: matrix.platform_label == 'linux'
        run: |
          cd release-staging
          sha256sum * > CHECKSUMS-linux.sha256 2>/dev/null || true
          echo "Checksums:"
          cat CHECKSUMS-linux.sha256

      - name: Generate SHA256 checksums (Windows)
        if: matrix.platform_label == 'windows'
        shell: pwsh
        run: |
          Set-Location release-staging
          $checksums = @()
          Get-ChildItem -File | ForEach-Object {
            $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
            $checksums += "$hash  $($_.Name)"
          }
          $checksums | Out-File -FilePath "CHECKSUMS-windows.sha256" -Encoding utf8
          Write-Host "Checksums:"
          Get-Content "CHECKSUMS-windows.sha256"

      # ── Upload build artifacts ───────────────────────────────────────────
      - name: Upload release artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.platform_label }}
          path: release-staging/*
          retention-days: 5
          if-no-files-found: error

  # ═════════════════════════════════════════════════════════════════════════════
  # Stage 4: Create GitHub Release with all artifacts
  # ═════════════════════════════════════════════════════════════════════════════
  create-release:
    name: Create GitHub Release
    needs: [validate, build-release]
    runs-on: ubuntu-22.04
    outputs:
      release_url: ${{ steps.gh_release.outputs.url }}
      release_id: ${{ steps.gh_release.outputs.id }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # ── Download all platform artifacts ──────────────────────────────────
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          pattern: release-*
          merge-multiple: true

      - name: List downloaded artifacts
        run: ls -lhR artifacts/

      # ── Merge checksums into unified file ────────────────────────────────
      - name: Generate unified checksums
        run: |
          VERSION="${{ needs.validate.outputs.version }}"

          cd artifacts

          # Create unified checksum file
          cat > CHECKSUMS.sha256 << 'HEADER'
          # Cyber Chakra Digital Forensics -- SHA256 Checksums
          # Verify: sha256sum -c CHECKSUMS.sha256
          HEADER
          echo "# Version: $VERSION" >> CHECKSUMS.sha256
          echo "# Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> CHECKSUMS.sha256
          echo "" >> CHECKSUMS.sha256

          # Merge per-platform checksums (exclude the checksum files themselves and .sig files)
          for f in CHECKSUMS-*.sha256; do
            [ -f "$f" ] || continue
            grep -v "^#" "$f" | grep -v "^$" | grep -v "CHECKSUMS" >> CHECKSUMS.sha256 || true
          done

          # Remove per-platform checksum files (not needed in release)
          rm -f CHECKSUMS-*.sha256

          echo "Unified checksums:"
          cat CHECKSUMS.sha256

      # ── Generate structured changelog ────────────────────────────────────
      - name: Generate release notes
        id: changelog
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          CHANNEL="${{ needs.validate.outputs.channel }}"
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

          cat > RELEASE_NOTES.md << 'EOF'
          EOF

          # Channel badge
          if [ "$CHANNEL" = "stable" ]; then
            echo "**Channel:** Stable Release" >> RELEASE_NOTES.md
          else
            UPPER_CHANNEL=$(echo "$CHANNEL" | tr '[:lower:]' '[:upper:]')
            echo "> **Pre-release ($UPPER_CHANNEL)** -- This is not a stable release. Use for testing only." >> RELEASE_NOTES.md
          fi

          echo "" >> RELEASE_NOTES.md
          echo "## Changelog" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md

          if [ -n "$PREV_TAG" ]; then
            # Group commits by type using conventional commit prefixes
            echo "### Features" >> RELEASE_NOTES.md
            git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep -iE "^- (feat|add|new)" >> RELEASE_NOTES.md 2>/dev/null || echo "_None_" >> RELEASE_NOTES.md
            echo "" >> RELEASE_NOTES.md

            echo "### Bug Fixes" >> RELEASE_NOTES.md
            git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep -iE "^- (fix|bug|patch|hotfix)" >> RELEASE_NOTES.md 2>/dev/null || echo "_None_" >> RELEASE_NOTES.md
            echo "" >> RELEASE_NOTES.md

            echo "### Other Changes" >> RELEASE_NOTES.md
            git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep -viE "^- (feat|add|new|fix|bug|patch|hotfix)" >> RELEASE_NOTES.md 2>/dev/null || echo "_None_" >> RELEASE_NOTES.md
            echo "" >> RELEASE_NOTES.md

            echo "**Full diff:** [\`$PREV_TAG..v$VERSION\`](https://github.com/${{ github.repository }}/compare/$PREV_TAG...v$VERSION)" >> RELEASE_NOTES.md
          else
            git log --pretty=format:"- %s (%h)" -20 >> RELEASE_NOTES.md
          fi

          echo "" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md

          # Download table
          echo "## Downloads" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "| Platform | Package | Size |" >> RELEASE_NOTES.md
          echo "|----------|---------|------|" >> RELEASE_NOTES.md

          for f in artifacts/Cyber_Chakra_Forensics_*; do
            [ -f "$f" ] || continue
            # Skip .sig and .sha256 files in the download table
            case "$f" in *.sig|*.sha256) continue ;; esac
            name=$(basename "$f")
            size=$(du -h "$f" | cut -f1)
            if echo "$name" | grep -q "windows"; then
              platform="Windows"
            elif echo "$name" | grep -q "linux"; then
              platform="Linux"
            else
              platform="Other"
            fi
            echo "| $platform | \`$name\` | $size |" >> RELEASE_NOTES.md
          done

          echo "" >> RELEASE_NOTES.md

          # Verification section
          echo "## Verification" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "All installers are signed with Tauri minisign. Signature files (\`.sig\`) are attached alongside each installer." >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "**Verify checksum (Linux/macOS):**" >> RELEASE_NOTES.md
          echo '```bash' >> RELEASE_NOTES.md
          echo "sha256sum -c CHECKSUMS.sha256" >> RELEASE_NOTES.md
          echo '```' >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "**Verify checksum (Windows PowerShell):**" >> RELEASE_NOTES.md
          echo '```powershell' >> RELEASE_NOTES.md
          echo 'Get-FileHash "Cyber_Chakra_Forensics_*.exe" -Algorithm SHA256' >> RELEASE_NOTES.md
          echo '```' >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo "**Verify minisign signature:**" >> RELEASE_NOTES.md
          echo '```bash' >> RELEASE_NOTES.md
          echo "minisign -Vm Cyber_Chakra_Forensics_${VERSION}_linux_x64.AppImage -p minisign.pub" >> RELEASE_NOTES.md
          echo '```' >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md

          # Inline checksums
          echo "## SHA256 Checksums" >> RELEASE_NOTES.md
          echo "" >> RELEASE_NOTES.md
          echo '```' >> RELEASE_NOTES.md
          grep -v "^#" artifacts/CHECKSUMS.sha256 | grep -v "^$" >> RELEASE_NOTES.md 2>/dev/null || echo "(see CHECKSUMS.sha256)"
          echo '```' >> RELEASE_NOTES.md

      # ── Create the GitHub Release ────────────────────────────────────────
      - name: Create GitHub Release
        id: gh_release
        uses: softprops/action-gh-release@v2
        with:
          name: "Cyber Chakra Digital Forensics v${{ needs.validate.outputs.version }}"
          body_path: RELEASE_NOTES.md
          draft: false
          prerelease: ${{ needs.validate.outputs.prerelease == 'true' }}
          make_latest: ${{ needs.validate.outputs.channel == 'stable' }}
          files: |
            artifacts/Cyber_Chakra_Forensics_*
            artifacts/CHECKSUMS.sha256

  # ═════════════════════════════════════════════════════════════════════════════
  # Stage 5: Post-release notifications
  # ═════════════════════════════════════════════════════════════════════════════
  notify-release:
    name: Post-Release Notifications
    needs: [validate, create-release]
    runs-on: ubuntu-22.04
    if: always() && needs.create-release.result == 'success'
    steps:
      # ── Notify Admin Portal via webhook ──────────────────────────────────
      - name: Download artifacts for metadata
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          pattern: release-*
          merge-multiple: true

      - name: Notify Admin Portal
        if: env.ADMIN_PORTAL_WEBHOOK_KEY != ''
        env:
          ADMIN_PORTAL_WEBHOOK_KEY: ${{ secrets.ADMIN_PORTAL_WEBHOOK_KEY }}
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          CHANNEL="${{ needs.validate.outputs.channel }}"
          RELEASE_URL="${{ needs.create-release.outputs.release_url }}"
          GITHUB_RELEASE_URL="https://github.com/${{ github.repository }}/releases/tag/v${VERSION}"

          # Build assets JSON array
          ASSETS_JSON="["
          FIRST=true

          for f in artifacts/Cyber_Chakra_Forensics_*; do
            [ -f "$f" ] || continue
            # Skip .sig and checksum files
            case "$f" in *.sig|*.sha256) continue ;; esac

            FILENAME=$(basename "$f")
            FILESIZE=$(stat -c%s "$f" 2>/dev/null || echo "0")
            SHA256=$(sha256sum "$f" | cut -d' ' -f1)
            DOWNLOAD_URL="${GITHUB_RELEASE_URL}/download/${FILENAME}"

            # Determine platform and packageType
            PLATFORM="unknown"
            PACKAGE_TYPE="unknown"
            ARCH="x86_64"

            case "$FILENAME" in
              *_windows_*setup.exe)  PLATFORM="windows"; PACKAGE_TYPE="nsis" ;;
              *_windows_*.msi)       PLATFORM="windows"; PACKAGE_TYPE="msi" ;;
              *_linux_*.AppImage)    PLATFORM="linux";   PACKAGE_TYPE="appimage" ;;
              *_linux_*.deb)         PLATFORM="linux";   PACKAGE_TYPE="deb" ;;
            esac

            # Check for signature file
            SIG=""
            if [ -f "${f}.sig" ]; then
              SIG=$(cat "${f}.sig" | base64 -w0)
            fi

            if [ "$FIRST" = true ]; then
              FIRST=false
            else
              ASSETS_JSON+=","
            fi

            ASSETS_JSON+=$(cat <<ASSET
          {
            "platform": "$PLATFORM",
            "arch": "$ARCH",
            "packageType": "$PACKAGE_TYPE",
            "filename": "$FILENAME",
            "fileSize": $FILESIZE,
            "sha256Hash": "$SHA256",
            "downloadUrl": "$DOWNLOAD_URL",
            "signature": $([ -n "$SIG" ] && echo "\"$SIG\"" || echo "null")
          }
          ASSET
          )
          done

          ASSETS_JSON+="]"

          # Determine severity (pre-releases are optional, stable is recommended)
          if [ "$CHANNEL" = "stable" ]; then
            SEVERITY="recommended"
          else
            SEVERITY="optional"
          fi

          # POST to admin portal release webhook
          HTTP_STATUS=$(curl -s -o /tmp/webhook_response.txt -w "%{http_code}" \
            -X POST "https://cyberchakra.online/api/v1/webhooks/github-release" \
            -H "Authorization: Bearer $ADMIN_PORTAL_WEBHOOK_KEY" \
            -H "Content-Type: application/json" \
            -d "{
              \"version\": \"$VERSION\",
              \"channel\": \"$CHANNEL\",
              \"severity\": \"$SEVERITY\",
              \"title\": \"Cyber Chakra Forensics v$VERSION\",
              \"releaseNotes\": \"Release v$VERSION published via CI/CD pipeline.\",
              \"gitCommitSha\": \"${{ github.sha }}\",
              \"tag\": \"v$VERSION\",
              \"releaseUrl\": \"$GITHUB_RELEASE_URL\",
              \"forceUpdate\": false,
              \"assets\": $ASSETS_JSON
            }")

          echo "Admin Portal webhook response: HTTP $HTTP_STATUS"
          cat /tmp/webhook_response.txt
          echo ""

          if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
            echo "Admin Portal notified successfully"
          else
            echo "::warning::Admin Portal webhook returned HTTP $HTTP_STATUS (non-fatal)"
          fi

      # ── Slack notification ───────────────────────────────────────────────
      - name: Send Slack notification
        if: env.SLACK_WEBHOOK_URL != ''
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          VERSION="${{ needs.validate.outputs.version }}"
          CHANNEL="${{ needs.validate.outputs.channel }}"
          RELEASE_URL="https://github.com/${{ github.repository }}/releases/tag/v${VERSION}"

          if [ "$CHANNEL" = "stable" ]; then
            EMOJI=":rocket:"
            TITLE="Release v$VERSION Published"
          else
            EMOJI=":test_tube:"
            TITLE="Pre-release v$VERSION Published ($CHANNEL)"
          fi

          curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
              \"attachments\": [{
                \"color\": \"good\",
                \"title\": \"$EMOJI $TITLE\",
                \"text\": \"Cyber Chakra Digital Forensics v$VERSION is now available!\",
                \"fields\": [
                  {\"title\": \"Channel\", \"value\": \"$CHANNEL\", \"short\": true},
                  {\"title\": \"Platforms\", \"value\": \"Linux, Windows\", \"short\": true},
                  {\"title\": \"Release\", \"value\": \"$RELEASE_URL\", \"short\": false}
                ]
              }]
            }"
```

---

## 4. Pre-release (Beta) Workflow

Pre-releases are handled by the same `release.yml` workflow above. The channel detection logic in the `validate` job handles it automatically:

- Tag `v2.1.0-beta.1` sets `channel=beta`, `prerelease=true`
- Tag `v2.1.0-rc.2` sets `channel=rc`, `prerelease=true`
- Tag `v2.1.0` sets `channel=stable`, `prerelease=false`

Key behavioral differences for pre-releases:

| Aspect | Stable | Beta / RC |
|--------|--------|-----------|
| GitHub Release marked as `prerelease` | No | Yes |
| GitHub Release marked as `latest` | Yes | No |
| Admin portal webhook `channel` field | `stable` | `beta` / `rc` |
| Admin portal webhook `severity` field | `recommended` | `optional` |
| Slack notification emoji | Rocket | Test tube |

### Triggering a Beta Release

```bash
# Bump version files to base version first
./scripts/bump-version.sh 2.1.0

# Commit and tag as beta
git add -A && git commit -m "chore: bump version to 2.1.0"
git tag v2.1.0-beta.1
git push origin main --tags
```

---

## 5. Signing Configuration

### 5.1 How Tauri Minisign Signing Works

When the environment variables `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set during `cargo tauri build`, Tauri automatically:

1. Builds the installers (NSIS `.exe`, `.deb`, `.AppImage`)
2. Signs each installer with the minisign private key
3. Produces a `.sig` file alongside each installer

The `.sig` files appear in the same directory as the installers:

```
src-tauri/target/release/bundle/
  nsis/
    Cyber Chakra Forensics_2.1.0_x64-setup.exe
    Cyber Chakra Forensics_2.1.0_x64-setup.exe.sig     <-- auto-generated
  appimage/
    cyber-chakra-forensics_2.1.0_amd64.AppImage
    cyber-chakra-forensics_2.1.0_amd64.AppImage.sig     <-- auto-generated
  deb/
    cyber-chakra-forensics_2.1.0_amd64.deb
    cyber-chakra-forensics_2.1.0_amd64.deb.sig           <-- auto-generated
```

### 5.2 Generating a Signing Key Pair

If you do not already have a key pair, generate one with the Tauri CLI:

```bash
cargo tauri signer generate -w ~/.tauri/cyber-chakra.key
```

This produces:
- **Private key** (`~/.tauri/cyber-chakra.key`) -- goes into `TAURI_SIGNING_PRIVATE_KEY` secret
- **Public key** (printed to stdout) -- goes into `tauri.conf.json` under `plugins.updater.pubkey`

The public key currently in `tauri.conf.json`:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK
```

### 5.3 GitHub Secrets Setup

| Secret Name | Value | Description |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Full content of the minisign private key file | Used by `cargo tauri build` to sign installers |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password set during key generation | Decrypts the private key during signing |
| `ADMIN_PORTAL_WEBHOOK_KEY` | Bearer token for admin portal API | Authenticates CI webhook calls |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | Optional notification channel |

### 5.4 Verifying Signatures Locally

**Install minisign:**
```bash
# Linux
sudo apt install minisign
# macOS
brew install minisign
# Windows (scoop)
scoop install minisign
```

**Save the public key:**
```bash
echo "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK" | base64 -d > minisign.pub
```

**Verify an artifact:**
```bash
minisign -Vm Cyber_Chakra_Forensics_2.1.0_linux_x64.AppImage -p minisign.pub
```

Expected output:
```
Signature and comment signature verified
Trusted comment: timestamp:1234567890	file:Cyber_Chakra_Forensics_2.1.0_linux_x64.AppImage
```

---

## 6. Artifact Naming Convention

### Standard Format

```
Cyber_Chakra_Forensics_{version}_{platform}_{arch}[-{installer_type}].{ext}
```

### Full Artifact Matrix

| Platform | Artifact Filename | Signature Filename |
|---|---|---|
| Windows (NSIS) | `Cyber_Chakra_Forensics_2.1.0_windows_x64-setup.exe` | `...setup.exe.sig` |
| Windows (MSI) | `Cyber_Chakra_Forensics_2.1.0_windows_x64.msi` | `...x64.msi.sig` |
| Linux (AppImage) | `Cyber_Chakra_Forensics_2.1.0_linux_x64.AppImage` | `...x64.AppImage.sig` |
| Linux (DEB) | `Cyber_Chakra_Forensics_2.1.0_linux_x64.deb` | `...x64.deb.sig` |
| Checksums | `CHECKSUMS.sha256` | -- |

### Pre-release Examples

```
Cyber_Chakra_Forensics_2.1.0-beta.1_windows_x64-setup.exe
Cyber_Chakra_Forensics_2.1.0-beta.1_linux_x64.AppImage
```

---

## 7. Webhook to Admin Portal

### 7.1 Webhook Endpoint (New Route Required)

The existing admin portal does not have a webhook receiver for GitHub CI. A new route must be added to the backend.

**File: `docs/admin-portal/backend/src/routes/webhook.routes.ts`**

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Webhook authentication (Bearer token, not JWT) ────────────────────────

function requireWebhookAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.GITHUB_WEBHOOK_SECRET;

  if (!expectedToken) {
    return next(new AppError(500, "Webhook secret not configured", "WEBHOOK_NOT_CONFIGURED"));
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing webhook authorization", "UNAUTHORIZED"));
  }

  const token = authHeader.slice(7);
  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(token, "utf8");

  if (expected.length !== received.length || !require("crypto").timingSafeEqual(expected, received)) {
    return next(new AppError(403, "Invalid webhook token", "FORBIDDEN"));
  }

  next();
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const webhookAssetSchema = z.object({
  platform: z.enum(["windows", "linux", "android"]),
  arch: z.string().default("x86_64"),
  packageType: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().int().min(0),
  sha256Hash: z.string().length(64),
  downloadUrl: z.string().url(),
  signature: z.string().optional().nullable(),
});

const githubReleaseWebhookSchema = z.object({
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc", "alpha"]).default("stable"),
  severity: z.enum(["critical", "recommended", "optional"]).default("optional"),
  title: z.string().min(1).max(255),
  releaseNotes: z.string().optional().nullable(),
  gitCommitSha: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  releaseUrl: z.string().url().optional().nullable(),
  forceUpdate: z.boolean().default(false),
  assets: z.array(webhookAssetSchema).default([]),
});

// ─── POST /github-release ──────────────────────────────────────────────────

router.post(
  "/github-release",
  requireWebhookAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = githubReleaseWebhookSchema.parse(req.body);

      // Check for duplicate version + channel
      const existing = await prisma.release.findFirst({
        where: { version: body.version, channel: body.channel },
      });

      if (existing) {
        // Update existing draft release with new assets
        await prisma.releaseAsset.deleteMany({ where: { releaseId: existing.id } });

        const updated = await prisma.release.update({
          where: { id: existing.id },
          data: {
            title: body.title,
            releaseNotes: body.releaseNotes ?? null,
            gitCommitSha: body.gitCommitSha ?? null,
            severity: body.severity,
            forceUpdate: body.forceUpdate,
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
          adminUserId: null, // System action
          action: "webhook_update_release",
          resourceType: "release",
          resourceId: updated.id,
          newValues: { version: body.version, channel: body.channel, source: "github-actions" },
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        });

        return res.json({
          success: true,
          data: { id: updated.id, action: "updated" },
          error: null,
          message: `Release ${body.version} (${body.channel}) updated`,
        });
      }

      // Create new draft release
      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity: body.severity,
          title: body.title,
          releaseNotes: body.releaseNotes ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
          forceUpdate: body.forceUpdate,
          // Do NOT auto-publish -- admin must review and publish manually
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
        adminUserId: null,
        action: "webhook_create_release",
        resourceType: "release",
        resourceId: release.id,
        newValues: { version: body.version, channel: body.channel, source: "github-actions" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({
        success: true,
        data: { id: release.id, action: "created" },
        error: null,
        message: `Release ${body.version} (${body.channel}) created as draft`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
```

### 7.2 Registration in index.ts

Add the following to `docs/admin-portal/backend/src/index.ts`:

```typescript
import webhookRoutes from "./routes/webhook.routes.js";

// After the admin routes, before the 404 catch-all:
app.use("/api/v1/webhooks", webhookRoutes);
```

### 7.3 Environment Variable

Add to the Hostinger server's `~/backend/.env`:

```env
GITHUB_WEBHOOK_SECRET=<generate-a-strong-random-string>
```

The same value goes into the GitHub repository secret `ADMIN_PORTAL_WEBHOOK_KEY`.

### 7.4 Webhook Flow

```
GitHub Actions (release.yml)
  |
  |  POST /api/v1/webhooks/github-release
  |  Authorization: Bearer <ADMIN_PORTAL_WEBHOOK_KEY>
  |  Body: { version, channel, severity, assets[], ... }
  v
Admin Portal Backend
  |
  |  Creates/updates Release record (draft)
  |  Logs audit entry (source: github-actions)
  v
Admin Dashboard
  |
  |  Admin reviews release in portal
  |  Clicks "Publish" to make it live
  v
Desktop App Updater
  |  GET /api/v1/update-check?target=...&current_version=...
  |  Receives update notification
```

---

## 8. Version Sync Script

### `scripts/bump-version.sh`

This script atomically updates the version across all four manifest files.

```bash
#!/bin/bash
# bump-version.sh -- Update version across all project manifests
#
# Usage:
#   ./scripts/bump-version.sh 2.1.0
#   ./scripts/bump-version.sh 2.1.0 --tag        # Also creates git tag
#   ./scripts/bump-version.sh 2.1.0 --tag --push  # Also pushes to origin
#
# Files updated:
#   1. package.json          (frontend)
#   2. src-tauri/Cargo.toml  (Rust backend)
#   3. src-tauri/tauri.conf.json
#   4. config/version.json

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────

VERSION="${1:-}"
DO_TAG=false
DO_PUSH=false

shift || true
for arg in "$@"; do
  case "$arg" in
    --tag)  DO_TAG=true ;;
    --push) DO_PUSH=true ;;
    *)      echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [--tag] [--push]"
  echo ""
  echo "Examples:"
  echo "  $0 2.1.0           # Update version files only"
  echo "  $0 2.1.0 --tag     # Update + create git tag v2.1.0"
  echo "  $0 2.1.0 --tag --push  # Update + tag + push"
  exit 1
fi

# Validate semver format (allow pre-release suffixes)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+(\.[0-9]+)?)?$'; then
  echo "ERROR: Invalid version format: $VERSION"
  echo "Expected: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease.N"
  exit 1
fi

# Base version (strip pre-release suffix) for files that only store base versions
BASE_VERSION=$(echo "$VERSION" | sed -E 's/-(alpha|beta|rc)\.[0-9]+$//')

# ── Determine project root ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "Bumping version to $BASE_VERSION (tag version: $VERSION)"
echo ""

ERRORS=0

# ── 1. package.json ─────────────────────────────────────────────────────────

if [ -f "package.json" ]; then
  # Use node for reliable JSON editing
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$BASE_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "[OK] package.json -> $BASE_VERSION"
else
  echo "[WARN] package.json not found"
  ERRORS=$((ERRORS + 1))
fi

# ── 2. src-tauri/Cargo.toml ─────────────────────────────────────────────────

if [ -f "src-tauri/Cargo.toml" ]; then
  # Only replace the first occurrence of version = "..." (the [package] version)
  sed -i "0,/^version = \".*\"/s/^version = \".*\"/version = \"$BASE_VERSION\"/" src-tauri/Cargo.toml
  echo "[OK] src-tauri/Cargo.toml -> $BASE_VERSION"
else
  echo "[WARN] src-tauri/Cargo.toml not found"
  ERRORS=$((ERRORS + 1))
fi

# ── 3. src-tauri/tauri.conf.json ────────────────────────────────────────────

if [ -f "src-tauri/tauri.conf.json" ]; then
  node -e "
    const fs = require('fs');
    const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
    conf.version = '$BASE_VERSION';
    fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
  "
  echo "[OK] src-tauri/tauri.conf.json -> $BASE_VERSION"
else
  echo "[WARN] src-tauri/tauri.conf.json not found"
  ERRORS=$((ERRORS + 1))
fi

# ── 4. config/version.json ──────────────────────────────────────────────────

if [ -f "config/version.json" ]; then
  node -e "
    const fs = require('fs');
    const ver = JSON.parse(fs.readFileSync('config/version.json', 'utf8'));
    ver.version = '$BASE_VERSION';
    ver.build_number = (ver.build_number || 0) + 1;
    ver.release_date = new Date().toISOString().split('T')[0];
    fs.writeFileSync('config/version.json', JSON.stringify(ver, null, 2) + '\n');
  "
  echo "[OK] config/version.json -> $BASE_VERSION (build_number incremented)"
else
  echo "[WARN] config/version.json not found"
  ERRORS=$((ERRORS + 1))
fi

# ── Verification ─────────────────────────────────────────────────────────────

echo ""
echo "── Verification ──"

VERIFY_ERRORS=0

PKG_V=$(node -p "require('./package.json').version" 2>/dev/null || echo "MISSING")
CARGO_V=$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2 2>/dev/null || echo "MISSING")
TAURI_V=$(node -p "require('./src-tauri/tauri.conf.json').version" 2>/dev/null || echo "MISSING")
CFG_V=$(node -p "require('./config/version.json').version" 2>/dev/null || echo "MISSING")

for label_val in "package.json:$PKG_V" "Cargo.toml:$CARGO_V" "tauri.conf.json:$TAURI_V" "version.json:$CFG_V"; do
  LABEL="${label_val%%:*}"
  VAL="${label_val#*:}"
  if [ "$VAL" = "$BASE_VERSION" ]; then
    echo "  [PASS] $LABEL = $VAL"
  else
    echo "  [FAIL] $LABEL = $VAL (expected $BASE_VERSION)"
    VERIFY_ERRORS=$((VERIFY_ERRORS + 1))
  fi
done

if [ "$VERIFY_ERRORS" -gt 0 ]; then
  echo ""
  echo "ERROR: Version verification failed for $VERIFY_ERRORS file(s)"
  exit 1
fi

echo ""
echo "All version files updated to $BASE_VERSION"

# ── Git tag ──────────────────────────────────────────────────────────────────

if [ "$DO_TAG" = true ]; then
  echo ""
  echo "── Git Operations ──"

  # Stage the changed files
  git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json config/version.json

  # Check if there are changes to commit
  if git diff --cached --quiet; then
    echo "No changes to commit (version already set to $BASE_VERSION)"
  else
    git commit -m "chore: bump version to $BASE_VERSION"
    echo "[OK] Created commit"
  fi

  # Create annotated tag
  git tag -a "v$VERSION" -m "Release v$VERSION"
  echo "[OK] Created tag v$VERSION"

  if [ "$DO_PUSH" = true ]; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    git push origin "$BRANCH" --tags
    echo "[OK] Pushed $BRANCH + tags to origin"
    echo ""
    echo "Release pipeline will start automatically for tag v$VERSION"
  else
    echo ""
    echo "Tag created locally. Push with:"
    echo "  git push origin $(git rev-parse --abbrev-ref HEAD) --tags"
  fi
fi
```

### `scripts/bump-version.ps1` (Windows PowerShell)

```powershell
# bump-version.ps1 -- Update version across all project manifests (Windows)
#
# Usage:
#   .\scripts\bump-version.ps1 -Version 2.1.0
#   .\scripts\bump-version.ps1 -Version 2.1.0 -Tag
#   .\scripts\bump-version.ps1 -Version 2.1.0 -Tag -Push

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [switch]$Tag,
    [switch]$Push
)

$ErrorActionPreference = "Stop"

# Validate semver
if ($Version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.\d+)?)?$') {
    Write-Error "Invalid version format: $Version. Expected: MAJOR.MINOR.PATCH[-prerelease.N]"
    exit 1
}

# Base version (strip pre-release suffix)
$BaseVersion = $Version -replace '-(alpha|beta|rc)\.\d+$', ''

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }
Set-Location $ProjectRoot

Write-Host "Bumping version to $BaseVersion (tag version: $Version)" -ForegroundColor Cyan
Write-Host ""

# 1. package.json
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$pkg.version = $BaseVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding utf8
Write-Host "[OK] package.json -> $BaseVersion" -ForegroundColor Green

# 2. src-tauri/Cargo.toml
$cargoContent = Get-Content "src-tauri/Cargo.toml" -Raw
$cargoContent = $cargoContent -replace '(?m)^version = ".*?"', "version = `"$BaseVersion`""
# Only replace first occurrence (powershell -replace replaces all, but version line appears once in [package])
Set-Content "src-tauri/Cargo.toml" -Value $cargoContent -Encoding utf8 -NoNewline
Write-Host "[OK] src-tauri/Cargo.toml -> $BaseVersion" -ForegroundColor Green

# 3. src-tauri/tauri.conf.json
$tauriConf = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
$tauriConf.version = $BaseVersion
$tauriConf | ConvertTo-Json -Depth 10 | Set-Content "src-tauri/tauri.conf.json" -Encoding utf8
Write-Host "[OK] src-tauri/tauri.conf.json -> $BaseVersion" -ForegroundColor Green

# 4. config/version.json
if (Test-Path "config/version.json") {
    $verJson = Get-Content "config/version.json" -Raw | ConvertFrom-Json
    $verJson.version = $BaseVersion
    $verJson.build_number = ($verJson.build_number -as [int]) + 1
    $verJson.release_date = (Get-Date -Format "yyyy-MM-dd")
    $verJson | ConvertTo-Json -Depth 10 | Set-Content "config/version.json" -Encoding utf8
    Write-Host "[OK] config/version.json -> $BaseVersion (build_number incremented)" -ForegroundColor Green
}

# Verification
Write-Host ""
Write-Host "-- Verification --" -ForegroundColor Cyan

$failures = 0
$checks = @(
    @{ Label = "package.json"; Value = (Get-Content "package.json" -Raw | ConvertFrom-Json).version },
    @{ Label = "Cargo.toml"; Value = ((Get-Content "src-tauri/Cargo.toml" | Select-String '^version = "(.+)"' | Select-Object -First 1).Matches.Groups[1].Value) },
    @{ Label = "tauri.conf.json"; Value = (Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version },
    @{ Label = "version.json"; Value = (Get-Content "config/version.json" -Raw | ConvertFrom-Json).version }
)

foreach ($check in $checks) {
    if ($check.Value -eq $BaseVersion) {
        Write-Host "  [PASS] $($check.Label) = $($check.Value)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $($check.Label) = $($check.Value) (expected $BaseVersion)" -ForegroundColor Red
        $failures++
    }
}

if ($failures -gt 0) {
    Write-Error "Version verification failed for $failures file(s)"
    exit 1
}

Write-Host ""
Write-Host "All version files updated to $BaseVersion" -ForegroundColor Green

# Git operations
if ($Tag) {
    Write-Host ""
    Write-Host "-- Git Operations --" -ForegroundColor Cyan

    git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json config/version.json

    $diff = git diff --cached --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
        git commit -m "chore: bump version to $BaseVersion"
        Write-Host "[OK] Created commit" -ForegroundColor Green
    } else {
        Write-Host "No changes to commit (version already $BaseVersion)" -ForegroundColor Yellow
    }

    git tag -a "v$Version" -m "Release v$Version"
    Write-Host "[OK] Created tag v$Version" -ForegroundColor Green

    if ($Push) {
        $branch = git rev-parse --abbrev-ref HEAD
        git push origin $branch --tags
        Write-Host "[OK] Pushed $branch + tags to origin" -ForegroundColor Green
        Write-Host ""
        Write-Host "Release pipeline will start automatically for tag v$Version" -ForegroundColor Cyan
    } else {
        $branch = git rev-parse --abbrev-ref HEAD
        Write-Host ""
        Write-Host "Tag created locally. Push with:" -ForegroundColor Yellow
        Write-Host "  git push origin $branch --tags"
    }
}
```

---

## 9. GitHub Secrets Inventory

Complete list of secrets required for the full CI/CD pipeline:

| Secret | Used By | Required | How To Generate |
|--------|---------|----------|-----------------|
| `TAURI_SIGNING_PRIVATE_KEY` | `release.yml` (build-release) | Yes | `cargo tauri signer generate -w ~/.tauri/cyber-chakra.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `release.yml` (build-release) | Yes | Set during key generation |
| `ADMIN_PORTAL_WEBHOOK_KEY` | `release.yml` (notify-release) | Yes | `openssl rand -hex 32` (same value in server .env as `GITHUB_WEBHOOK_SECRET`) |
| `SLACK_WEBHOOK_URL` | `release.yml` (notify-release) | No | Create in Slack app settings |
| `HOSTINGER_HOST` | `deploy.yml` (admin portal) | Yes (admin portal) | Hostinger control panel |
| `HOSTINGER_USER` | `deploy.yml` (admin portal) | Yes (admin portal) | Hostinger control panel |
| `HOSTINGER_SSH_KEY` | `deploy.yml` (admin portal) | Yes (admin portal) | `ssh-keygen -t ed25519` |

---

## 10. Local Verification Procedures

### Verify a Downloaded Release

```bash
# 1. Download release artifacts
mkdir release-2.1.0 && cd release-2.1.0
gh release download v2.1.0

# 2. Verify SHA256 checksums
sha256sum -c CHECKSUMS.sha256

# 3. Verify minisign signatures (requires minisign installed)
# Save public key first
echo "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK" | base64 -d > minisign.pub

minisign -Vm Cyber_Chakra_Forensics_2.1.0_linux_x64.AppImage -p minisign.pub
minisign -Vm Cyber_Chakra_Forensics_2.1.0_linux_x64.deb -p minisign.pub

# 4. Full verification with existing script
./scripts/verify-release.sh .
```

### Windows Verification (PowerShell)

```powershell
# 1. Verify SHA256
$expected = (Get-Content CHECKSUMS.sha256 | Where-Object { $_ -match "setup.exe" }) -split "\s+" | Select-Object -First 1
$actual = (Get-FileHash "Cyber_Chakra_Forensics_2.1.0_windows_x64-setup.exe" -Algorithm SHA256).Hash.ToLower()
if ($expected -eq $actual) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL" -ForegroundColor Red }

# 2. Verify minisign (if minisign.exe is on PATH)
minisign -Vm "Cyber_Chakra_Forensics_2.1.0_windows_x64-setup.exe" -p minisign.pub
```

---

## 11. Existing Infrastructure Audit

### What Already Exists

| File | Status | Notes |
|------|--------|-------|
| `.github/workflows/release.yml` | Exists, needs enhancement | Missing: artifact renaming, .sig collection, admin portal webhook, pre-release detection |
| `.github/workflows/ci.yml` | Complete | Runs on push to main/develop and PRs |
| `.github/workflows/cross-platform-build.yml` | Complete | Dev builds for Linux, Windows, Android |
| `.github/workflows/security-audit.yml` | Complete | Daily + on Cargo.lock changes |
| `scripts/sign-release.sh` | Complete | Local signing (GPG + checksums + SBOM) |
| `scripts/verify-release.sh` | Complete | Local verification |
| `scripts/Sign-Release.ps1` | Complete | Windows local signing |
| `scripts/Verify-Release.ps1` | Complete | Windows local verification |
| `config/version.json` | Exists | version, build_number, release_date, license_server, update_endpoint |
| `src-tauri/tauri.conf.json` | Exists | updater.pubkey configured, nsis bundle target set |
| `upload_release.sh` | Exists (legacy) | Hardcoded SCP to Hostinger -- should be replaced by admin portal webhook |

### What Needs To Be Created

| File | Purpose |
|------|---------|
| `scripts/bump-version.sh` | Cross-manifest version sync (section 8) |
| `scripts/bump-version.ps1` | Windows equivalent |
| `docs/admin-portal/backend/src/routes/webhook.routes.ts` | GitHub release webhook receiver (section 7) |
| Updated `.github/workflows/release.yml` | Enhanced pipeline (section 3) |

### What Can Be Deprecated

| File | Reason |
|------|--------|
| `upload_release.sh` | Replaced by admin portal webhook + GitHub Release hosting |

---

## Appendix: Complete Release Checklist

```
Pre-release:
  [ ] All CI checks pass on main
  [ ] Security audit clean (cargo audit, cargo deny)
  [ ] Changelog reviewed
  [ ] Version bumped: ./scripts/bump-version.sh X.Y.Z

Release:
  [ ] Tag pushed: ./scripts/bump-version.sh X.Y.Z --tag --push
  [ ] GitHub Actions pipeline completes (monitor Actions tab)
  [ ] GitHub Release created with all artifacts
  [ ] Admin portal receives webhook (check /api/v1/admin/releases)
  [ ] Admin publishes release in portal (POST /:id/publish)

Post-release:
  [ ] Desktop app update-check endpoint returns new version
  [ ] Download and verify one artifact per platform
  [ ] Slack notification received
```
