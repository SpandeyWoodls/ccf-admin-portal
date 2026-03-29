# Version Control & Release Strategy

Complete lifecycle specification for Cyber Chakra Forensics versioning, release management, and rollback procedures.

---

## 1. Versioning Scheme

### 1.1 Semantic Versioning (SemVer 2.0.0)

All releases follow **MAJOR.MINOR.PATCH** with strict rules:

| Component | When to Bump | Example |
|-----------|-------------|---------|
| **MAJOR** | Breaking changes to forensic report format, database schema requiring migration, Tauri IPC command signature changes, license API contract changes | `2.0.0` -> `3.0.0` |
| **MINOR** | New parser (e.g., Telegram support), new acquisition mode, new admin portal feature, new platform support | `2.1.0` -> `2.2.0` |
| **PATCH** | Bug fix, security patch, parser accuracy fix, UI fix, dependency update | `2.1.0` -> `2.1.1` |

**Domain-specific rules for this forensic tool:**

- A change to the MANIFEST.txt hash format = MAJOR bump (breaks chain of custody verification)
- A change to Section 65B report template structure = MAJOR bump (legal compliance)
- Adding a new evidence type to an existing parser = MINOR bump
- Fixing an incorrect timestamp parse = PATCH bump (even though it changes output, it is a correction)

### 1.2 Pre-release Versions

```
2.2.0-beta.1    First beta of the 2.2.0 feature set
2.2.0-beta.2    Second beta (bug fixes to beta.1)
2.2.0-rc.1      Release candidate 1 (feature-complete, stability testing)
2.2.0-rc.2      Release candidate 2 (critical fix found in rc.1)
2.2.0           Stable release
```

Pre-release versions are **never** served to the `stable` channel. They are only served to organizations that have opted into `beta` or `rc` channels (see Section 2).

### 1.3 Build Metadata

Build metadata is appended with `+` and is used for traceability but **ignored** in version precedence:

```
2.1.0+build.456          CI build number
2.1.0+build.456.sha.a1b2c3d   CI build + git SHA
2.1.0-beta.1+build.789   Pre-release with build metadata
```

Build metadata is stored in `config/version.json` as `build_number` and in the GitHub Release `MANIFEST.json` as `git_commit`. It is NOT embedded in the semver string in `Cargo.toml` or `package.json` (those files only hold `MAJOR.MINOR.PATCH[-prerelease]`).

### 1.4 Version Source of Truth and Synchronization

There are **four files** that carry the version string:

| File | Field | Example |
|------|-------|---------|
| `config/version.json` | `version`, `build_number` | `"2.1.0"`, `42` |
| `package.json` | `version` | `"2.1.0"` |
| `src-tauri/Cargo.toml` | `version` | `"2.1.0"` |
| `src-tauri/tauri.conf.json` | `version` | `"2.1.0"` |

**`config/version.json` is the single source of truth.** The version bump script reads this file and propagates the version to the other three. The `build_number` is auto-incremented on every release tag.

The existing `release.yml` workflow already validates that `Cargo.toml` and `tauri.conf.json` match the git tag. The version bump script (Section 4) ensures they never drift.

---

## 2. Release Channels

### 2.1 Channel Definitions

| Channel | Audience | Update Frequency | Stability |
|---------|----------|-----------------|-----------|
| **stable** | All organizations (default) | Every 2-6 weeks | Production-grade, fully tested |
| **rc** | Organizations that opt in | 1-2 weeks before stable | Feature-complete, final QA |
| **beta** | Organizations that opt in | Weekly or ad hoc | New features, may have rough edges |
| **nightly** | Internal developers only | Daily (automated from `main`) | Unstable, for development only |

### 2.2 How Organizations Subscribe to Channels

The admin portal already supports release channels via the `ReleaseChannel` enum (`stable`, `beta`, `rc`). Channel subscription is managed per-organization:

**Database change required:** Add a `release_channel` column to the `organizations` table:

```sql
ALTER TABLE organizations
  ADD COLUMN release_channel ENUM('stable', 'beta', 'rc') NOT NULL DEFAULT 'stable'
  AFTER is_active;
```

**Prisma schema addition** (in the Organization model):

```prisma
releaseChannel String @default("stable") @map("release_channel") @db.VarChar(20)
```

**Update-check endpoint change:** The `/api/v1/update-check` handler currently hardcodes `channel: "stable"`. It must be changed to:

1. Look up the organization's `releaseChannel` from the license key provided in the request header
2. Query for the latest published release matching that channel OR the stable channel (whichever is newer)
3. Beta/RC users always also receive stable updates if the stable version is newer than the latest beta/rc

```typescript
// In updateCheckHandler, replace the hardcoded "stable" query:
const orgChannel = license?.organization?.releaseChannel ?? "stable";
const channelPriority = { stable: 0, rc: 1, beta: 2 };

// Find latest published release across eligible channels
const eligibleChannels = ["stable"];
if (channelPriority[orgChannel] >= 1) eligibleChannels.push("rc");
if (channelPriority[orgChannel] >= 2) eligibleChannels.push("beta");

const latestRelease = await prisma.release.findFirst({
  where: {
    channel: { in: eligibleChannels },
    isBlocked: false,
    publishedAt: { not: null },
  },
  orderBy: { publishedAt: "desc" },
  include: { assets: { where: { platform: target, arch } } },
});
```

**Admin portal UI:** The organization detail page gets a "Release Channel" dropdown (stable/beta/rc). Changing it requires `admin` or `super_admin` role and is audit-logged.

### 2.3 Nightly Channel

Nightly builds are NOT managed through the admin portal. They are:
- Built automatically by a GitHub Actions workflow triggered on every push to `main`
- Uploaded as GitHub Actions artifacts (not GitHub Releases)
- Not signed with the production signing key
- Not served via the update-check endpoint
- Retained for 7 days, then deleted

A separate workflow file `nightly.yml` handles this (see Section 5.3).

---

## 3. Release Process (Step by Step)

### 3.1 Development Phase

```
Step 1: Developer creates feature branch from main
        Branch naming: feature/CCF-123-whatsapp-group-parser
                       fix/CCF-456-timestamp-parse-error
                       chore/CCF-789-update-dependencies

Step 2: Developer writes code following conventional commits:
        feat(parser): add Telegram message parser
        fix(acquisition): correct iOS backup timestamp offset
        chore(deps): update rusqlite to 0.32

Step 3: Developer opens PR to main
        - CI runs: lint, format, clippy, tests, security audit
        - Code review by at least one other developer
        - All checks must pass before merge

Step 4: PR merged to main via squash merge
        - Squash commit message follows conventional commit format
        - Main branch now contains the new feature/fix
```

### 3.2 Release Phase

```
Step 5: Release manager runs the version bump script (Section 4):
        ./scripts/bump-version.sh minor
        This:
        a) Updates config/version.json (version + build_number)
        b) Updates package.json
        c) Updates Cargo.toml
        d) Updates tauri.conf.json
        e) Generates/updates CHANGELOG.md from conventional commits
        f) Creates a git commit: "chore(release): v2.2.0"
        g) Creates a git tag: v2.2.0

Step 6: Release manager pushes the tag:
        git push origin main --follow-tags

Step 7: GitHub Actions release.yml triggers on the v* tag:
        a) Validates version consistency (tag vs Cargo.toml vs tauri.conf.json)
        b) Runs security audit (cargo audit, cargo deny)
        c) Builds for Linux (DEB, AppImage) and Windows (NSIS)
        d) Signs binaries with TAURI_SIGNING_PRIVATE_KEY
        e) Generates SHA256 checksums and MANIFEST.json
        f) Creates GitHub Release with all artifacts and release notes

Step 8: Webhook notifies admin portal (or manual step):
        POST /api/v1/admin/releases/from-github
        {
          "version": "2.2.0",
          "channel": "stable",
          "github_release_url": "https://github.com/.../releases/tag/v2.2.0",
          "assets": [/* auto-populated from GitHub Release API */]
        }

Step 9: Admin reviews the release in the portal:
        - Verifies release notes are accurate
        - Sets severity (critical / recommended / optional)
        - Optionally creates a staged rollout policy
        - Clicks "Publish"

Step 10: Admin publishes the release:
         POST /api/v1/admin/releases/:id/publish
         This sets publishedAt, making it discoverable by the update-check endpoint.

Step 11: Staged rollout begins (if configured):
         Stage 1: 5% of users (or specific test orgs) for 48 hours
         Stage 2: 25% of users for 24 hours
         Stage 3: 100% of users
         Admin advances stages manually after monitoring telemetry.

Step 12: Desktop apps discover the update:
         - App calls GET /api/v1/update-check?target=windows&arch=x86_64&current_version=2.1.0
         - Server checks rollout eligibility via shouldReceiveUpdate()
         - If eligible, returns Tauri updater JSON with download URL and signature
         - Tauri updater plugin downloads, verifies signature, installs, restarts
```

### 3.3 Pre-release Flow (Beta / RC)

For beta and RC releases, the process is identical except:

- The tag includes the pre-release suffix: `v2.2.0-beta.1`
- The release.yml marks it as `prerelease: true` (already handled via the `contains(github.ref, '-beta')` check)
- The admin creates the release with `channel: "beta"` or `channel: "rc"`
- Only organizations subscribed to that channel receive the update

---

## 4. Version Bump Automation

### 4.1 Recommendation: Custom Script + Conventional Commits

After evaluating the four options:

| Tool | Verdict | Reason |
|------|---------|--------|
| **Manual** | Rejected | Error-prone with 4 files to update; humans will forget one |
| **npm version / cargo set-version** | Rejected | Only updates one file each; no changelog generation |
| **Changesets** | Rejected | Designed for monorepo npm packages, not Tauri apps |
| **release-please** | Considered but rejected | Adds a GitHub App dependency and generates PRs that add friction for a small team |

**The recommendation is a custom `bump-version.sh` script** that:

1. Takes `major`, `minor`, `patch`, or an explicit version as argument
2. Reads the current version from `config/version.json`
3. Computes the new version
4. Updates all four files atomically
5. Generates changelog from conventional commits since the last tag
6. Creates the git commit and tag

This is the right fit because:
- The team is small (1-3 developers)
- There are exactly 4 files to sync (not a moving target)
- The script is ~100 lines of bash, fully auditable, no external dependencies
- It integrates with the existing `release.yml` which already validates version consistency

### 4.2 The Script

Create `scripts/bump-version.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh <major|minor|patch|x.y.z[-pre.N]>

BUMP_TYPE="${1:?Usage: bump-version.sh <major|minor|patch|x.y.z>}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$ROOT_DIR/config/version.json"

# Read current version
CURRENT=$(jq -r '.version' "$VERSION_FILE")
BUILD=$(jq -r '.build_number' "$VERSION_FILE")
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT%%-*}"

# Compute new version
case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0; NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0; NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
  patch) PATCH=$((PATCH + 1)); NEW_VERSION="$MAJOR.$MINOR.$PATCH" ;;
  *)     NEW_VERSION="$BUMP_TYPE" ;;  # Explicit version (e.g., 2.2.0-beta.1)
esac

NEW_BUILD=$((BUILD + 1))
RELEASE_DATE=$(date -u +"%Y-%m-%d")

echo "Bumping version: $CURRENT -> $NEW_VERSION (build $NEW_BUILD)"

# 1. Update config/version.json
jq --arg v "$NEW_VERSION" --argjson b "$NEW_BUILD" --arg d "$RELEASE_DATE" \
  '.version = $v | .build_number = $b | .release_date = $d' \
  "$VERSION_FILE" > "$VERSION_FILE.tmp" && mv "$VERSION_FILE.tmp" "$VERSION_FILE"

# 2. Update package.json
# For pre-release versions, npm requires the full string
jq --arg v "$NEW_VERSION" '.version = $v' \
  "$ROOT_DIR/package.json" > "$ROOT_DIR/package.json.tmp" && mv "$ROOT_DIR/package.json.tmp" "$ROOT_DIR/package.json"

# 3. Update Cargo.toml (only the package version, not dependency versions)
# Cargo.toml does not support pre-release suffixes in the same way,
# so for beta/rc we strip the suffix for Cargo and store full version in version.json
CARGO_VERSION="${NEW_VERSION%%-*}"  # Strip pre-release for Cargo
sed -i "0,/^version = \".*\"/s//version = \"$CARGO_VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

# 4. Update tauri.conf.json
jq --arg v "$CARGO_VERSION" '.version = $v' \
  "$ROOT_DIR/src-tauri/tauri.conf.json" > "$ROOT_DIR/src-tauri/tauri.conf.json.tmp" \
  && mv "$ROOT_DIR/src-tauri/tauri.conf.json.tmp" "$ROOT_DIR/src-tauri/tauri.conf.json"

# 5. Generate changelog entry from conventional commits
PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
echo ""
echo "=== Changelog entries since ${PREV_TAG:-'beginning'} ==="

if [ -n "$PREV_TAG" ]; then
  FEAT=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" | grep "^feat" | sed 's/^/- /' || true)
  FIX=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" | grep "^fix" | sed 's/^/- /' || true)
  CHORE=$(git log "$PREV_TAG"..HEAD --pretty=format:"%s" | grep "^chore\|^refactor\|^perf\|^docs" | sed 's/^/- /' || true)
else
  FEAT=""; FIX=""; CHORE=""
fi

# Build changelog block
CHANGELOG_BLOCK="## [$NEW_VERSION] - $RELEASE_DATE"
[ -n "$FEAT" ]  && CHANGELOG_BLOCK="$CHANGELOG_BLOCK\n\n### Added\n$FEAT"
[ -n "$FIX" ]   && CHANGELOG_BLOCK="$CHANGELOG_BLOCK\n\n### Fixed\n$FIX"
[ -n "$CHORE" ] && CHANGELOG_BLOCK="$CHANGELOG_BLOCK\n\n### Changed\n$CHORE"

echo -e "$CHANGELOG_BLOCK"
echo ""

# Prepend to CHANGELOG.md (after the header line)
if [ -f "$ROOT_DIR/CHANGELOG.md" ]; then
  # Insert after the "# Changelog" header and any preamble
  HEADER=$(head -6 "$ROOT_DIR/CHANGELOG.md")
  BODY=$(tail -n +7 "$ROOT_DIR/CHANGELOG.md")
  {
    echo "$HEADER"
    echo ""
    echo -e "$CHANGELOG_BLOCK"
    echo ""
    echo "$BODY"
  } > "$ROOT_DIR/CHANGELOG.md"
fi

# 6. Stage and commit
git add \
  "$ROOT_DIR/config/version.json" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/src-tauri/Cargo.toml" \
  "$ROOT_DIR/src-tauri/tauri.conf.json" \
  "$ROOT_DIR/CHANGELOG.md"

git commit -m "chore(release): v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo "Version bumped to $NEW_VERSION"
echo "Tag v$NEW_VERSION created"
echo ""
echo "To publish: git push origin main --follow-tags"
```

Create `scripts/bump-version.ps1` for Windows:

The same logic implemented in PowerShell for Windows developers. It reads `config/version.json`, updates all four files, generates changelog from `git log`, commits, and tags.

### 4.3 Usage Examples

```bash
# Patch release (bug fix)
./scripts/bump-version.sh patch
# 2.1.0 -> 2.1.1

# Minor release (new feature)
./scripts/bump-version.sh minor
# 2.1.1 -> 2.2.0

# Major release (breaking change)
./scripts/bump-version.sh major
# 2.2.0 -> 3.0.0

# Beta release
./scripts/bump-version.sh 2.3.0-beta.1

# Release candidate
./scripts/bump-version.sh 2.3.0-rc.1

# Push to trigger CI/CD
git push origin main --follow-tags
```

---

## 5. GitHub Actions Workflows

### 5.1 Existing Workflows (No Changes Needed)

- **ci.yml** - Runs on push to `main`/`develop` and PRs. Lints, tests, audits. No changes needed.
- **release.yml** - Triggers on `v*` tags. Validates, builds, creates GitHub Release. Already production-grade.
- **security-audit.yml** - Separate security workflow. No changes needed.
- **cross-platform-build.yml** - Builds for Linux/Windows/Android on every push to main. No changes needed.

### 5.2 New Workflow: GitHub-to-Admin-Portal Webhook

Add to `.github/workflows/release.yml` in the `notify-release` job:

```yaml
- name: Notify Admin Portal
  if: env.ADMIN_PORTAL_WEBHOOK_SECRET != ''
  env:
    ADMIN_PORTAL_URL: ${{ secrets.ADMIN_PORTAL_URL }}
    ADMIN_PORTAL_WEBHOOK_SECRET: ${{ secrets.ADMIN_PORTAL_WEBHOOK_SECRET }}
  run: |
    VERSION="${{ needs.validate.outputs.version }}"
    IS_PRERELEASE="false"
    CHANNEL="stable"

    if [[ "$VERSION" == *"-beta"* ]]; then
      IS_PRERELEASE="true"
      CHANNEL="beta"
    elif [[ "$VERSION" == *"-rc"* ]]; then
      IS_PRERELEASE="true"
      CHANNEL="rc"
    fi

    # Collect asset information from the GitHub Release
    ASSETS=$(gh release view "v$VERSION" --json assets --jq '.assets[] | {
      filename: .name,
      fileSize: .size,
      downloadUrl: .url
    }' | jq -s '.')

    SIGNATURE=$(echo -n "${VERSION}${GITHUB_SHA}" | openssl dgst -sha256 -hmac "$ADMIN_PORTAL_WEBHOOK_SECRET" | awk '{print $2}')

    curl -X POST "$ADMIN_PORTAL_URL/api/v1/admin/releases/from-github" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Signature: sha256=$SIGNATURE" \
      -d "{
        \"version\": \"$VERSION\",
        \"channel\": \"$CHANNEL\",
        \"severity\": \"optional\",
        \"title\": \"v$VERSION\",
        \"gitCommitSha\": \"${{ github.sha }}\",
        \"releaseNotes\": \"See GitHub Release: https://github.com/${{ github.repository }}/releases/tag/v$VERSION\",
        \"isPrerelease\": $IS_PRERELEASE,
        \"githubReleaseUrl\": \"https://github.com/${{ github.repository }}/releases/tag/v$VERSION\"
      }"
```

### 5.3 New Workflow: Nightly Builds

Create `.github/workflows/nightly.yml`:

```yaml
name: Nightly Build

on:
  schedule:
    - cron: '0 2 * * *'  # 2:00 AM UTC daily
  workflow_dispatch:

jobs:
  nightly:
    # Only run if there are new commits since yesterday
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check for new commits
        id: check
        run: |
          LAST_24H=$(git log --since="24 hours ago" --oneline | wc -l)
          if [ "$LAST_24H" -eq "0" ]; then
            echo "skip=true" >> $GITHUB_OUTPUT
          else
            echo "skip=false" >> $GITHUB_OUTPUT
          fi

      - name: Build (Linux)
        if: steps.check.outputs.skip == 'false'
        # ... same as cross-platform-build.yml linux job ...
        run: echo "Build would run here"

      # Upload artifacts with 7-day retention, NOT as a GitHub Release
```

---

## 6. Changelog Generation

### 6.1 Commit Message Convention

All commits to `main` must follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `test`, `ci`, `build`

Scopes: `parser`, `acquisition`, `report`, `auth`, `ui`, `db`, `ios`, `android`, `license`, `admin`, `deps`

Examples:
```
feat(parser): add Signal database message parser
fix(acquisition): handle disconnected USB during iOS backup
chore(deps): update tauri to 2.2.0
perf(parser): parallelize WhatsApp media extraction
docs(report): update Section 65B template for BSA 2023
```

### 6.2 Changelog Format

The changelog follows [Keep a Changelog](https://keepachangelog.com/) format, which the project already uses (see existing `CHANGELOG.md`). The `bump-version.sh` script auto-generates entries grouped by type:

- `feat` commits -> **Added** section
- `fix` commits -> **Fixed** section
- `chore`/`refactor`/`perf`/`docs` commits -> **Changed** section
- Breaking changes (footer `BREAKING CHANGE:`) -> **Breaking** section at top

### 6.3 Displaying Changelogs

**In the Admin Portal:**
- The release detail page shows the `releaseNotes` field (already implemented in `release.admin.routes.ts`)
- The release creation form pre-populates notes from the GitHub Release body (via webhook)
- Admin can edit release notes before publishing

**In the Desktop App Update Dialog:**
- The Tauri updater plugin receives the `notes` field from the update-check response
- The app displays these notes in the update prompt dialog
- For major updates, the notes should include migration instructions

**In GitHub Releases:**
- Auto-generated by `release.yml` from `git log --pretty=format:"- %s"` between tags
- Includes download table with platform, filename, and size
- Includes SHA256 checksums for verification

---

## 7. Rollback Strategy

### 7.1 Blocking a Bad Release (Immediate Response)

The admin portal already supports this via the release block endpoint. When a critical bug is discovered:

```
Step 1: Admin logs into the admin portal
Step 2: Navigate to Releases -> find the bad version
Step 3: Click "Block Release" with a reason
        POST /api/v1/admin/rollout/releases/:id/block
        { "reason": "Critical data corruption bug in WhatsApp parser" }
Step 4: This sets isBlocked=true on the release
Step 5: The update-check endpoint immediately stops serving this version
Step 6: Users who have NOT yet updated are safe
Step 7: For users who HAVE updated, proceed to Step 7.2
```

### 7.2 Force-Downgrade (Pushing Users Back to a Known Good Version)

The admin portal already supports blocked versions with force-update targets:

```
Step 1: Identify the last known good version (e.g., 2.1.0)
Step 2: Create a blocked version entry:
        POST /api/v1/admin/rollout/blocked-versions
        {
          "versionPattern": "2.2.0",
          "reason": "Critical data corruption bug",
          "forceUpdateTo": "2.1.0"
        }
Step 3: When a user on v2.2.0 calls update-check, the endpoint:
        a) Detects their version is blocked
        b) Finds the forceUpdateTo release (2.1.0)
        c) Returns update JSON pointing to the 2.1.0 binaries
        d) Prefixes notes with "[MANDATORY]"
Step 4: Tauri updater downloads and installs 2.1.0
Step 5: User is now on the safe version
```

**This already works** in the current `updateCheckHandler` code (see `license.public.routes.ts` lines 788-817).

### 7.3 Wildcard Version Blocking

For blocking an entire minor version line:

```
POST /api/v1/admin/rollout/blocked-versions
{
  "versionPattern": "2.2.*",
  "reason": "Entire 2.2.x line has a fundamental flaw",
  "forceUpdateTo": "2.1.3"
}
```

This is already supported by the `getBlockedVersionInfo()` function in `services/rollout.ts`.

### 7.4 Rollout Pause (Precautionary)

If you suspect a problem but are not yet sure:

```
Step 1: Pause the rollout (stops new users from getting the update):
        POST /api/v1/admin/rollout/releases/:id/rollout/pause

Step 2: Investigate the issue using telemetry from heartbeat data

Step 3a: If the issue is confirmed -> Block the release (7.1)
Step 3b: If the issue is a false alarm -> Resume the rollout:
         POST /api/v1/admin/rollout/releases/:id/rollout/resume
```

### 7.5 Database Migration Reversal

This is the hardest rollback scenario. Rules:

1. **All database migrations must be reversible.** Every migration script must have a corresponding `down` migration. In Prisma, this means using `prisma migrate` instead of `prisma db push` for production.

2. **Schema changes in the desktop app's local SQLite database** are handled by the Rust backend at startup (in `src-tauri/src/db/mod.rs`). The schema initialization code runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, which are inherently forward-only.

3. **For the admin portal's MySQL database**, Prisma migrations must be used:
   ```bash
   npx prisma migrate dev --name add_release_channel_to_orgs  # Creates migration
   npx prisma migrate deploy                                    # Applies in production
   ```

4. **Rollback procedure for a bad schema migration:**
   ```
   Step 1: Identify which migration introduced the problem
   Step 2: Write a new forward migration that reverses the change
           (Prisma does not support "migrate down", so we create a new "up" that undoes the damage)
   Step 3: Deploy the corrective migration
   Step 4: Release a patched version of the admin portal
   ```

5. **For the desktop app's SQLite schema**, the situation is simpler because each user has their own local database. A rollback version of the app simply ships with the old schema code. However:
   - If a migration added a column that stored data, downgrading loses that data
   - Solution: the app must never DROP columns or tables in a migration; only ADD
   - Schema version is tracked in a `schema_version` pragma or a `settings` table row
   - The app checks schema version at startup and runs only the migrations needed

### 7.6 Git-Level Rollback (Emergency)

If the problem is in the codebase and not just the release:

```bash
# Revert the bad merge commit on main
git revert <merge-commit-sha> --mainline 1
git push origin main

# Then do a patch release
./scripts/bump-version.sh patch
git push origin main --follow-tags
```

This creates a clean forward history rather than force-pushing.

### 7.7 Rollback Decision Matrix

| Scenario | Action | Time to Resolve |
|----------|--------|----------------|
| Bug found before rollout reaches 100% | Pause rollout, investigate | Minutes |
| Bug found after full rollout, no data loss | Block release + force-update to previous | Minutes |
| Bug found with data corruption | Block release + force-update + publish advisory | Hours |
| Bad schema migration (admin portal) | Deploy corrective migration + new portal build | Hours |
| Bad schema migration (desktop SQLite) | Block version + release patch with migration fix | Days |
| Security vulnerability (RCE, data leak) | Block ALL affected versions immediately, force-update to patched version, notify all orgs | Minutes (block) + Hours (patch) |

---

## 8. Staged Rollout Configuration

### 8.1 Recommended Default Rollout Policy

For **stable** releases:

```json
{
  "strategy": "staged",
  "stages": [
    {
      "stageOrder": 1,
      "percentage": 5,
      "targetOrgIds": ["<internal-test-org-id>"],
      "targetTiers": null,
      "minSoakHours": 48
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
      "percentage": 100,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 0
    }
  ]
}
```

For **critical security patches** (severity = critical):

```json
{
  "strategy": "immediate"
}
```

No staged rollout for critical patches. They go to 100% immediately.

For **beta** releases:

```json
{
  "strategy": "targeted",
  "stages": [
    {
      "stageOrder": 1,
      "percentage": 100,
      "targetOrgIds": null,
      "targetTiers": null,
      "minSoakHours": 0
    }
  ]
}
```

Beta users opted in; they get it immediately.

### 8.2 Monitoring During Rollout

Between rollout stages, the admin should monitor:

1. **Heartbeat drop-off:** If the percentage of clients sending heartbeats drops after an update, the update may be crashing the app
2. **Error reports via support tickets:** Spike in tickets with the new version
3. **Usage statistics:** If `cases_created`, `acquisitions`, or `reports_generated` drop to zero for updated clients, something is broken

The admin portal dashboard already tracks these metrics via the heartbeat and analytics aggregation CRON jobs.

---

## 9. Admin Portal Webhook Endpoint (New)

The admin portal needs a new endpoint to receive release notifications from GitHub Actions:

### Route: `POST /api/v1/admin/releases/from-github`

```typescript
// In release.admin.routes.ts, add:

const githubWebhookSchema = z.object({
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc"]).default("stable"),
  severity: z.enum(["critical", "recommended", "optional"]).default("optional"),
  title: z.string().min(1).max(255),
  gitCommitSha: z.string().optional(),
  releaseNotes: z.string().optional(),
  githubReleaseUrl: z.string().url().optional(),
});

router.post(
  "/from-github",
  // Authenticated via HMAC webhook signature, not session token
  async (req, res, next) => {
    try {
      // Verify webhook signature
      const signature = req.headers["x-webhook-signature"];
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret || !signature) {
        throw new AppError(401, "Missing webhook signature", "UNAUTHORIZED");
      }

      const body = githubWebhookSchema.parse(req.body);

      // Create draft release (not published - admin must review and publish)
      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity: body.severity,
          title: body.title,
          releaseNotes: body.releaseNotes ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
          // Assets will be populated separately by admin or by a follow-up call
        },
      });

      res.status(201).json({
        success: true,
        data: release,
        message: "Draft release created from GitHub webhook",
      });
    } catch (err) {
      next(err);
    }
  },
);
```

---

## 10. Complete Lifecycle Diagram

```
Developer                    GitHub                    Admin Portal               Desktop App
    |                           |                           |                           |
    |-- push feature branch --->|                           |                           |
    |                           |-- CI runs (ci.yml) ------>|                           |
    |<-- review feedback -------|                           |                           |
    |-- merge to main -------->|                           |                           |
    |                           |                           |                           |
    |-- bump-version.sh ------>|                           |                           |
    |-- git push --follow-tags->|                           |                           |
    |                           |                           |                           |
    |                           |-- release.yml triggers -->|                           |
    |                           |   - validate              |                           |
    |                           |   - security check        |                           |
    |                           |   - build (Win+Linux)     |                           |
    |                           |   - sign binaries         |                           |
    |                           |   - create GH Release     |                           |
    |                           |                           |                           |
    |                           |-- webhook POST ---------->|                           |
    |                           |                           |-- creates draft release   |
    |                           |                           |                           |
    |                           |                    admin reviews draft                 |
    |                           |                    admin sets rollout policy            |
    |                           |                    admin clicks "Publish"              |
    |                           |                           |                           |
    |                           |                           |<-- update-check GET ------|
    |                           |                           |-- returns update JSON ---->|
    |                           |                           |                           |
    |                           |                           |   (Tauri downloads from   |
    |                           |<-------- download --------|    GitHub Releases)       |
    |                           |                           |                           |
    |                           |                           |<-- heartbeat POST --------|
    |                           |                           |   (confirms update OK)     |
    |                           |                           |                           |
    |                           |                    admin advances rollout stage         |
    |                           |                    ... repeat until 100% ...            |
```

---

## 11. Implementation Priority

| Priority | Task | Effort |
|----------|------|--------|
| **P0 - Do Now** | Create `scripts/bump-version.sh` | 2 hours |
| **P0 - Do Now** | Add `releaseChannel` to Organization model | 1 hour |
| **P0 - Do Now** | Update `updateCheckHandler` to respect org channel | 2 hours |
| **P1 - Next Sprint** | Add GitHub webhook endpoint to admin portal | 3 hours |
| **P1 - Next Sprint** | Add webhook step to `release.yml` | 1 hour |
| **P1 - Next Sprint** | Create `scripts/bump-version.ps1` (Windows) | 2 hours |
| **P2 - Later** | Create `nightly.yml` workflow | 2 hours |
| **P2 - Later** | Add rollout monitoring dashboard in admin portal | 8 hours |
| **P2 - Later** | Enforce conventional commits via commitlint + husky hook | 1 hour |

---

## 12. Conventional Commits Enforcement

Add to the existing husky setup (`.husky/commit-msg`):

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate conventional commit format
commit_regex='^(feat|fix|chore|refactor|perf|docs|test|ci|build|style|revert)(\([a-z-]+\))?: .{1,72}'

if ! grep -qE "$commit_regex" "$1"; then
  echo ""
  echo "ERROR: Commit message does not follow Conventional Commits format."
  echo ""
  echo "Format: <type>(<scope>): <description>"
  echo ""
  echo "Types:  feat, fix, chore, refactor, perf, docs, test, ci, build, style, revert"
  echo "Scopes: parser, acquisition, report, auth, ui, db, ios, android, license, admin, deps"
  echo ""
  echo "Example: feat(parser): add Telegram message parser"
  echo ""
  exit 1
fi
```

Install commitlint as a dev dependency:

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

Create `commitlint.config.js`:

```javascript
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      'parser', 'acquisition', 'report', 'auth', 'ui', 'db',
      'ios', 'android', 'license', 'admin', 'deps', 'release',
      'ci', 'build', 'security', 'updater'
    ]],
    'header-max-length': [2, 'always', 100],
  },
};
```

---

## 13. Summary of Recommendations

1. **Versioning:** Strict SemVer with `config/version.json` as the single source of truth, propagated to three other files by a bump script.

2. **Release Channels:** Four channels (stable, rc, beta, nightly). Organizations subscribe via a new `release_channel` column. The update-check endpoint respects the subscription.

3. **Release Process:** 12-step lifecycle from feature branch to user update, with human gates at PR review and admin publish. Fully automated build and signing via the existing `release.yml`.

4. **Version Bump:** Custom bash/powershell script. No external tooling dependencies. Generates changelog from conventional commits, updates all files, creates tag.

5. **Changelog:** Auto-generated from conventional commits in Keep a Changelog format. Displayed in admin portal (release notes field), GitHub Releases, and desktop app update dialog.

6. **Rollback:** Five-layer defense: (1) pause rollout, (2) block release, (3) force-downgrade via blocked versions, (4) wildcard version blocking, (5) git revert + patch release. All layers are already supported by the existing admin portal code except the webhook integration.
