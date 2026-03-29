# Admin Portal - Update Management UX Specification

**Agent**: 10 - Admin Portal Update Management UX Researcher
**Date**: 2026-03-28
**Status**: Complete
**Scope**: Complete update management experience for the CMF Admin Portal
**Dependencies**: Database schema (`001_database_schema.sql`), API spec (`002_api_specification.yaml`), existing `release.admin.routes.ts`

---

## Table of Contents

1. [Release Lifecycle Model](#1-release-lifecycle-model)
2. [Database Schema Extensions](#2-database-schema-extensions)
3. [GitHub Webhook Integration](#3-github-webhook-integration)
4. [Release Creation Flow](#4-release-creation-flow)
5. [Release List Page](#5-release-list-page)
6. [Release Detail Page](#6-release-detail-page)
7. [Rollout Controls UI](#7-rollout-controls-ui)
8. [Version Dashboard](#8-version-dashboard)
9. [Notification System](#9-notification-system)
10. [Force Update Mechanism](#10-force-update-mechanism)
11. [Version Blocking](#11-version-blocking)
12. [Asset Management](#12-asset-management)
13. [API Endpoints (New/Extended)](#13-api-endpoints-newextended)
14. [Desktop App Integration Points](#14-desktop-app-integration-points)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Error States & Edge Cases](#16-error-states--edge-cases)

---

## 1. Release Lifecycle Model

### State Machine

```
                               +-----------+
                               |           |
                    +--------->| SUPERSEDED|
                    |          |           |
                    |          +-----------+
                    |
+-------+    +-----------+    +-----------+
|       |--->|           |--->|           |
| DRAFT |    | PUBLISHED |    | DEPRECATED|
|       |    |           |    |           |
+-------+    +-----+-----+    +-----------+
    |              |
    |              |  (emergency)
    v              v
+-------+    +-----------+
|       |    |           |
|DELETED|    |  BLOCKED  |
|       |    |  (YANKED) |
+-------+    +-----------+
                   |
                   | (unblock)
                   v
              +-----------+
              |           |
              | PUBLISHED |
              |           |
              +-----------+
```

### State Transitions

| From        | To          | Trigger                     | Guard Conditions                        |
|-------------|-------------|-----------------------------|-----------------------------------------|
| Draft       | Published   | Admin clicks "Publish"      | At least 1 asset uploaded, checksums OK |
| Draft       | Deleted     | Admin clicks "Delete Draft" | No downloads recorded                   |
| Published   | Superseded  | Newer version published     | Automatic when same channel published   |
| Published   | Blocked     | Admin clicks "Block"        | Requires reason + fallback version      |
| Published   | Deprecated  | Admin clicks "Deprecate"    | Optional sunset date                    |
| Blocked     | Published   | Admin clicks "Unblock"      | Super admin only, requires reason       |
| Deprecated  | Blocked     | Admin clicks "Block"        | Emergency override                      |

### Lifecycle Color Coding (consistent across all views)

| Status      | Badge Color         | HSL Token                    |
|-------------|---------------------|------------------------------|
| Draft       | Muted/Gray          | `hsl(var(--muted-foreground))` |
| Published   | Success/Green       | `hsl(142 55% 49%)`          |
| Superseded  | Blue/Info           | `hsl(213 72% 48%)`          |
| Deprecated  | Warning/Amber       | `hsl(38 92% 50%)`           |
| Blocked     | Destructive/Red     | `hsl(0 72% 51%)`            |

---

## 2. Database Schema Extensions

The existing `releases` and `release_assets` tables (from `001_database_schema.sql`) need these additions for rollout, blocking, and notification features.

### New Tables

```sql
-- ---------------------------------------------------------------------------
-- Staged rollout configuration and tracking
-- ---------------------------------------------------------------------------
CREATE TABLE release_rollouts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    -- Rollout configuration
    strategy        TEXT NOT NULL DEFAULT 'percentage',  -- 'percentage', 'targeted'
    stages          JSONB NOT NULL DEFAULT '[]',
    -- Example stages:
    -- [
    --   {"stage": 1, "percentage": 5,   "soak_hours": 24, "status": "completed", "started_at": "...", "completed_at": "..."},
    --   {"stage": 2, "percentage": 25,  "soak_hours": 24, "status": "completed", "started_at": "...", "completed_at": "..."},
    --   {"stage": 3, "percentage": 50,  "soak_hours": 24, "status": "active",    "started_at": "..."},
    --   {"stage": 4, "percentage": 100, "soak_hours": 0,  "status": "pending"}
    -- ]
    current_stage   INTEGER NOT NULL DEFAULT 0,
    current_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- Targeting (for 'targeted' strategy)
    target_org_ids  UUID[] DEFAULT '{}',
    target_tiers    TEXT[] DEFAULT '{}',       -- ['enterprise', 'government']
    target_channels TEXT[] DEFAULT '{}',       -- ['beta']
    -- Status
    rollout_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (rollout_status IN ('pending', 'active', 'paused', 'completed', 'cancelled')),
    auto_advance    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Health monitoring
    error_threshold NUMERIC(5,2) DEFAULT 5.0,  -- pause if error rate > 5%
    error_count     INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    -- Timing
    started_at      TIMESTAMPTZ,
    paused_at       TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    -- Audit
    created_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_release_rollout UNIQUE (release_id)
);

CREATE INDEX idx_release_rollouts_status ON release_rollouts (rollout_status)
    WHERE rollout_status IN ('active', 'paused');
CREATE INDEX idx_release_rollouts_release ON release_rollouts (release_id);

-- ---------------------------------------------------------------------------
-- Version blocking records (history + fallback mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE release_blocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    -- Block details
    reason          TEXT NOT NULL,
    cve_ids         TEXT[] DEFAULT '{}',        -- ['CVE-2026-1234', 'CVE-2026-5678']
    severity        TEXT NOT NULL DEFAULT 'high'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    -- Fallback
    fallback_release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
    -- Impact tracking
    affected_installations INTEGER NOT NULL DEFAULT 0,
    migrated_installations INTEGER NOT NULL DEFAULT 0,
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unblocked_at    TIMESTAMPTZ,
    unblock_reason  TEXT,
    -- Audit
    blocked_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    unblocked_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_release_blocks_release ON release_blocks (release_id)
    WHERE is_active = TRUE;
CREATE INDEX idx_release_blocks_active ON release_blocks (is_active, blocked_at DESC);

-- ---------------------------------------------------------------------------
-- Release notification records
-- ---------------------------------------------------------------------------
CREATE TABLE release_notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    -- Notification config
    notify_email    BOOLEAN NOT NULL DEFAULT FALSE,
    notify_in_app   BOOLEAN NOT NULL DEFAULT FALSE,
    -- Targeting
    target          TEXT NOT NULL DEFAULT 'all'
                    CHECK (target IN ('all', 'active_only', 'specific_orgs', 'specific_tiers')),
    target_org_ids  UUID[] DEFAULT '{}',
    target_tiers    TEXT[] DEFAULT '{}',
    -- Content
    email_subject   TEXT,
    email_body      TEXT,                       -- markdown
    in_app_title    TEXT,
    in_app_body     TEXT,                       -- markdown
    -- Status
    sent_at         TIMESTAMPTZ,
    email_sent_count INTEGER NOT NULL DEFAULT 0,
    email_failed_count INTEGER NOT NULL DEFAULT 0,
    in_app_created  BOOLEAN NOT NULL DEFAULT FALSE,
    -- Audit
    sent_by         UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_release_notifications_release ON release_notifications (release_id);

-- ---------------------------------------------------------------------------
-- Force update tracking per installation
-- ---------------------------------------------------------------------------
CREATE TABLE force_update_status (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    release_id      UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    activation_id   UUID REFERENCES license_activations(id) ON DELETE SET NULL,
    -- Status
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'notified', 'soft_deadline', 'hard_deadline', 'completed', 'exempted')),
    -- Timing
    notified_at     TIMESTAMPTZ,
    soft_deadline   TIMESTAMPTZ,               -- 72h after notification
    hard_deadline   TIMESTAMPTZ,               -- blocks app usage
    completed_at    TIMESTAMPTZ,
    -- Context
    from_version    TEXT,
    to_version      TEXT,
    exemption_reason TEXT,                     -- e.g., "active forensic acquisition"
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_force_update_license UNIQUE (release_id, license_id, activation_id)
);

CREATE INDEX idx_force_update_status ON force_update_status (status)
    WHERE status NOT IN ('completed', 'exempted');
CREATE INDEX idx_force_update_release ON force_update_status (release_id, status);
CREATE INDEX idx_force_update_deadline ON force_update_status (hard_deadline)
    WHERE status IN ('pending', 'notified', 'soft_deadline');

-- ---------------------------------------------------------------------------
-- Installation version tracking (populated by heartbeat)
-- ---------------------------------------------------------------------------
CREATE TABLE installation_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    activation_id   UUID NOT NULL REFERENCES license_activations(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    -- Version info
    current_version TEXT NOT NULL,
    current_version_code INTEGER NOT NULL,
    platform        TEXT NOT NULL,              -- 'windows_x64', 'linux_x64', etc.
    -- Update tracking
    last_update_check TIMESTAMPTZ,
    last_update_applied TIMESTAMPTZ,
    update_channel  TEXT NOT NULL DEFAULT 'stable',
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_installation_version UNIQUE (license_id, activation_id)
);

CREATE INDEX idx_installation_versions_version ON installation_versions (current_version)
    WHERE is_active = TRUE;
CREATE INDEX idx_installation_versions_org ON installation_versions (organization_id)
    WHERE is_active = TRUE;
CREATE INDEX idx_installation_versions_active ON installation_versions (is_active, last_seen DESC);
CREATE INDEX idx_installation_versions_stale ON installation_versions (last_seen)
    WHERE is_active = TRUE;
```

### Columns Added to Existing `releases` Table

```sql
ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    superseded_by   UUID REFERENCES releases(id) ON DELETE SET NULL;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    blocked_at      TIMESTAMPTZ;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    blocked_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    block_reason    TEXT;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    git_commit_sha  TEXT;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    ci_build_url    TEXT;

ALTER TABLE releases ADD COLUMN IF NOT EXISTS
    force_update_grace_hours INTEGER DEFAULT 72;
```

---

## 3. GitHub Webhook Integration

### Webhook Flow

```
GitHub Actions (build completes)
    |
    | POST /api/webhooks/github
    | Headers: X-GitHub-Event: workflow_run
    |          X-Hub-Signature-256: sha256=<hmac>
    | Body: { workflow_run, artifacts, ... }
    |
    v
Admin Portal Webhook Handler
    |
    +--> 1. Verify HMAC signature (reject forged requests)
    +--> 2. Extract: version, commit SHA, build URL
    +--> 3. Download artifact manifest (assets list)
    +--> 4. Create DRAFT release with assets
    +--> 5. Auto-parse CHANGELOG.md from commit
    +--> 6. Send SSE notification to connected admin browsers
    +--> 7. Log to admin_audit_log
```

### Webhook Handler (Route Handler)

**File**: `app/api/webhooks/github/route.ts`

```
POST /api/webhooks/github

Request Headers:
  X-GitHub-Event: release | workflow_run
  X-Hub-Signature-256: sha256=<hmac_of_body>
  Content-Type: application/json

Request Body (release event):
{
  "action": "published",
  "release": {
    "tag_name": "v2.1.0",
    "name": "v2.1.0 - Security Patch",
    "body": "## Changelog\n- Fixed CVE-2026-1234\n...",
    "prerelease": false,
    "assets": [
      {
        "name": "cyber-chakra-forensics_2.1.0_x64-setup.exe",
        "size": 85000000,
        "browser_download_url": "https://github.com/.../releases/download/v2.1.0/...",
        "content_type": "application/octet-stream"
      },
      {
        "name": "cyber-chakra-forensics_2.1.0_amd64.AppImage",
        "size": 92000000,
        "browser_download_url": "https://github.com/.../releases/download/v2.1.0/...",
        "content_type": "application/octet-stream"
      },
      {
        "name": "SHA256SUMS.txt",
        "size": 256,
        "browser_download_url": "https://github.com/.../releases/download/v2.1.0/SHA256SUMS.txt"
      },
      {
        "name": "cyber-chakra-forensics_2.1.0_amd64.AppImage.sig",
        "size": 512,
        "browser_download_url": "..."
      }
    ],
    "target_commitish": "main"
  }
}

Response: 200 OK
{
  "draft_release_id": "uuid",
  "version": "2.1.0",
  "assets_imported": 2,
  "status": "draft_created"
}
```

### Admin Notification on Webhook Arrival

When the webhook creates a draft, the admin sees a toast notification (via SSE):

```
+--------------------------------------------------+
| [Package icon]  New Build Available               |
|                                                   |
| v2.1.0 arrived from GitHub Actions                |
| 2 assets, commit abc1234                          |
|                                                   |
| [Review Draft]              [Dismiss]             |
+--------------------------------------------------+
```

---

## 4. Release Creation Flow

### Two Entry Points

**A. Automatic (GitHub Webhook):** Draft auto-created, admin reviews and publishes.
**B. Manual:** Admin clicks "+ New Release" and fills the form.

### Manual Release Creation Wizard

```
+================================================================+
|                                                                  |
|  Create New Release                                    [X Close] |
|                                                                  |
|  STEP 1 of 3: Basic Information                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  Version *           [        2.1.0         ]                    |
|                      Must be valid semver (e.g., 2.1.0)          |
|                                                                  |
|  Title *             [ v2.1.0 - Security Patch       ]           |
|                                                                  |
|  Channel             [ Stable          v ]                       |
|                      Stable | Beta | Alpha | Nightly | LTS       |
|                                                                  |
|  Severity            ( ) Optional                                |
|                      (*) Recommended                             |
|                      ( ) Critical (force update)                 |
|                                                                  |
|  Is Security Patch   [ ] Yes, this addresses security issues     |
|                                                                  |
|  Minimum Upgrade From  [        2.0.0         ]                  |
|                        Oldest version that can upgrade directly   |
|                                                                  |
|  Git Commit SHA      [  abc1234def5678...     ]   (optional)     |
|                                                                  |
|                                                                  |
|                              [Cancel]  [Next: Release Notes -->] |
|                                                                  |
+================================================================+


+================================================================+
|                                                                  |
|  Create New Release                                    [X Close] |
|                                                                  |
|  STEP 2 of 3: Release Notes                                     |
|  ---------------------------------------------------------------+
|                                                                  |
|  Release Notes (Markdown)                                        |
|  +----------------------------------------------------------+   |
|  | ## What's New                                             |   |
|  |                                                           |   |
|  | ### Security Fixes                                        |   |
|  | - Fixed CVE-2026-1234: Buffer overflow in parser          |   |
|  | - Fixed CVE-2026-5678: Path traversal in export           |   |
|  |                                                           |   |
|  | ### Improvements                                          |   |
|  | - WhatsApp parser: 30% faster media extraction            |   |
|  | - Report generation: Added Section 65B certificate        |   |
|  |                                                           |   |
|  | ### Bug Fixes                                             |   |
|  | - Fixed crash when resuming interrupted acquisition       |   |
|  | - Fixed duplicate entries in call log parser               |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  Preview:                                                        |
|  +----------------------------------------------------------+   |
|  | What's New                                                |   |
|  |                                                           |   |
|  | Security Fixes                                            |   |
|  |  * Fixed CVE-2026-1234: Buffer overflow in parser         |   |
|  |  * Fixed CVE-2026-5678: Path traversal in export          |   |
|  |  ...                                                      |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|                     [<-- Back]  [Cancel]  [Next: Assets -->]     |
|                                                                  |
+================================================================+


+================================================================+
|                                                                  |
|  Create New Release                                    [X Close] |
|                                                                  |
|  STEP 3 of 3: Assets                                             |
|  ---------------------------------------------------------------+
|                                                                  |
|  Upload Binaries                                                 |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                                                           |   |
|  |  [cloud-upload icon]                                      |   |
|  |                                                           |   |
|  |  Drag & drop files here, or click to browse               |   |
|  |  Accepts: .exe, .msi, .AppImage, .deb, .dmg, .sig        |   |
|  |                                                           |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  -- OR import from GitHub Release --                             |
|  [Import from GitHub: v2.1.0]                                    |
|                                                                  |
|  Uploaded Assets:                                                |
|  +----------------------------------------------------------+   |
|  | Platform     | File                        | Size  | Hash |   |
|  |--------------------------------------------------------------| |
|  | Windows x64  | ccf_2.1.0_x64-setup.exe     | 81 MB | [ok] |  |
|  | Linux x64    | ccf_2.1.0_amd64.AppImage    | 88 MB | [ok] |  |
|  | Linux x64    | ccf_2.1.0_amd64.deb         | 85 MB | [ok] |  |
|  +----------------------------------------------------------+   |
|                                                                  |
|  [ ] All checksums verified                                      |
|  [ ] Code signatures validated                                   |
|                                                                  |
|                  [<-- Back]  [Cancel]  [Create Draft Release]    |
|                                                                  |
+================================================================+
```

### Post-Creation: Draft Review Screen

After creation, admin lands on the Release Detail page in DRAFT state with a prominent action bar:

```
+================================================================+
|                                                                  |
|  [<- Releases]   v2.1.0 - Security Patch        [Draft]         |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                                                           |   |
|  |  This release is in DRAFT status.                         |   |
|  |  Review the details below, then publish when ready.       |   |
|  |                                                           |   |
|  |  [Edit Release]  [Publish Release]  [Delete Draft]        |   |
|  |                                                           |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  ... (full release detail view, see Section 6) ...               |
|                                                                  |
+================================================================+
```

---

## 5. Release List Page

### Full Page Layout

```
+=================================================================+
| Releases                                        [+ New Release]  |
| Manage software distribution and updates                         |
|                                                                  |
| +-------------------------------------------------------------+ |
| | QUICK STATS                                                  | |
| |                                                              | |
| | [Published: 12]  [Draft: 2]  [Blocked: 1]  [Total DLs: 4.2K]| |
| +-------------------------------------------------------------+ |
|                                                                  |
| FILTERS:                                                         |
| Channel: [All v]  Status: [All v]  Search: [_______________]    |
|                                                                  |
| +-------------------------------------------------------------+ |
| |  LATEST PUBLISHED (hero card)                                | |
| |                                                              | |
| |  v2.1.0 - Security Patch                  [Published]        | |
| |  Published 2h ago by admin@ccf.gov.in                        | |
| |  Channel: Stable  |  Security: Yes  |  Force: No             | |
| |                                                              | |
| |  Rollout: ████████████████░░░░░░░░ 75%                       | |
| |  Stage 3 of 4 active (12h remaining soak)                    | |
| |                                                              | |
| |  [View Details]  [Manage Rollout]                            | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ALL RELEASES                                                     |
| +-------------------------------------------------------------+ |
| | Version  | Title              | Channel | Status    | Date   | |
| |---------+--------------------+---------+-----------+--------| |
| | v2.1.0  | Security Patch     | Stable  | [Publish] | 2h ago | |
| | v2.0.1  | Hotfix             | Stable  | [Blocked] | 3d ago | |
| | v2.0.0  | Major Release      | Stable  | [Supersd] | 2w ago | |
| | v2.1.0b | Beta 1             | Beta    | [Publish] | 5d ago | |
| | v1.9.5  | Maintenance        | Stable  | [Deprec ] | 1m ago | |
| | v2.2.0  | Feature Preview    | Beta    | [Draft  ] | 1h ago | |
| +-------------------------------------------------------------+ |
|                                                                  |
| Showing 1-6 of 24 releases       [< Prev]  Page 1 of 4  [Next >]|
+=================================================================+
```

### Release List Row States

Each row renders a colored status badge and contextual actions on hover:

```
PUBLISHED row (green badge):
+-------------------------------------------------------------------+
| v2.1.0 | Security Patch | Stable | [Published ●] | 2h ago  [...] |
+-------------------------------------------------------------------+
  Hover menu [...]: View Details, Manage Rollout, Block Version, Deprecate

DRAFT row (gray badge):
+-------------------------------------------------------------------+
| v2.2.0 | Feature Preview | Beta  | [Draft     ○] | 1h ago  [...] |
+-------------------------------------------------------------------+
  Hover menu [...]: View Details, Edit, Publish, Delete

BLOCKED row (red badge, entire row has subtle red-tinted background):
+-------------------------------------------------------------------+
| v2.0.1 | Hotfix          | Stable | [Blocked   ✕] | 3d ago  [...] |
+-------------------------------------------------------------------+
  Hover menu [...]: View Details, View Block Reason, Unblock (super_admin only)

SUPERSEDED row (blue badge, muted text):
+-------------------------------------------------------------------+
| v2.0.0 | Major Release   | Stable | [Superseded ◇] | 2w ago [...] |
+-------------------------------------------------------------------+
  Hover menu [...]: View Details (read-only)
```

---

## 6. Release Detail Page

### Layout (Published Release)

```
+=================================================================+
|                                                                  |
| [<- Releases]                                                    |
|                                                                  |
| v2.1.0 - Security Patch                                         |
| Published Mar 28, 2026 at 14:30 IST by admin@ccf.gov.in         |
|                                                                  |
| [Published ●]  [Stable]  [Security]  [Recommended]              |
|                                                                  |
| TABS: [Overview] [Rollout] [Assets] [Notifications] [Audit Log] |
|                                                                  |
| ================================================================|
|                                                                  |
| OVERVIEW TAB                                                     |
|                                                                  |
| +---------------------------+  +------------------------------+  |
| | Release Information       |  | Adoption Metrics             |  |
| |                           |  |                              |  |
| | Version:    2.1.0         |  | Installations on v2.1.0:    |  |
| | Code:       210100        |  |   47 / 156 (30.1%)          |  |
| | Channel:    Stable        |  |                              |  |
| | Severity:   Recommended   |  | Average update time:         |  |
| | Security:   Yes           |  |   2.4 days                   |  |
| | Force:      No            |  |                              |  |
| | Min from:   v2.0.0        |  | Download count: 52           |  |
| | Commit:     abc1234       |  |   Windows: 38                |  |
| | CI Build:   [View ->]     |  |   Linux:   14                |  |
| |                           |  |                              |  |
| | Published:  Mar 28, 2026  |  | Adoption Curve:              |  |
| | Published by: admin@...   |  | [small line chart here]      |  |
| +---------------------------+  +------------------------------+  |
|                                                                  |
| +-------------------------------------------------------------+ |
| | Release Notes                                                | |
| |                                                              | |
| | ## What's New                                                | |
| |                                                              | |
| | ### Security Fixes                                           | |
| | - Fixed CVE-2026-1234: Buffer overflow in parser             | |
| | - Fixed CVE-2026-5678: Path traversal in export              | |
| |                                                              | |
| | ### Improvements                                             | |
| | - WhatsApp parser: 30% faster media extraction               | |
| | - Report generation: Added Section 65B certificate           | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ACTIONS                                                          |
| [Block Version]  [Deprecate]  [Force Update All]                 |
|                                                                  |
+=================================================================+
```

### Layout (Draft Release)

```
+=================================================================+
|                                                                  |
| [<- Releases]                                                    |
|                                                                  |
| v2.2.0 - Feature Preview                                        |
| Created Mar 28, 2026 at 16:00 IST (from GitHub webhook)         |
|                                                                  |
| [Draft ○]  [Beta]                                                |
|                                                                  |
| +-------------------------------------------------------------+ |
| |  DRAFT ACTIONS                                               | |
| |                                                              | |
| |  Review the details below. When ready:                       | |
| |                                                              | |
| |  [Edit Release]  [Publish Release]  [Delete Draft]           | |
| +-------------------------------------------------------------+ |
|                                                                  |
| TABS: [Overview] [Assets] [Publish Settings]                     |
|                                                                  |
| ... (same overview layout but with editable fields) ...          |
|                                                                  |
+=================================================================+
```

### Layout (Blocked Release)

```
+=================================================================+
|                                                                  |
| [<- Releases]                                                    |
|                                                                  |
| v2.0.1 - Hotfix                                                 |
| Published Mar 20, 2026  |  BLOCKED Mar 25, 2026                 |
|                                                                  |
| [Blocked ✕]  [Stable]                                            |
|                                                                  |
| +-------------------------------------------------------------+ |
| |  VERSION BLOCKED                                  [!] Alert  | |
| |                                                              | |
| |  Reason:  CVE-2026-9999 - Critical RCE in acquisition       | |
| |           engine. All installations must migrate.            | |
| |                                                              | |
| |  CVEs:    CVE-2026-9999                                      | |
| |  Severity: Critical                                          | |
| |  Blocked by: admin@ccf.gov.in on Mar 25, 2026               | |
| |                                                              | |
| |  Fallback: v2.0.0 (stable, published)                       | |
| |                                                              | |
| |  Migration Progress:                                         | |
| |  ██████████████████░░░░░░░░░░░ 65%                           | |
| |  12 of 18 affected installations migrated                    | |
| |  6 installations still pending migration                     | |
| |                                                              | |
| |  [View Pending Installations]   [Unblock] (super_admin)     | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ... (rest of release details, read-only) ...                     |
|                                                                  |
+=================================================================+
```

---

## 7. Rollout Controls UI

### Rollout Configuration (shown during Publish flow)

When admin clicks "Publish Release", a dialog appears:

```
+=================================================================+
|                                                                  |
|  Publish v2.1.0 - Security Patch                       [X Close] |
|                                                                  |
|  How would you like to roll this out?                            |
|                                                                  |
|  (*) Staged Rollout (recommended for stable)                     |
|  ( ) Immediate (100% at once)                                    |
|  ( ) Targeted (specific organizations only)                      |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  STAGED ROLLOUT CONFIGURATION                                    |
|                                                                  |
|  Preset: [Conservative (4-stage) v]                              |
|          Conservative: 5% -> 25% -> 50% -> 100%                 |
|          Moderate:     10% -> 50% -> 100%                        |
|          Aggressive:   25% -> 100%                               |
|          Custom:       Define your own stages                    |
|                                                                  |
|  +-------------------------------------------------------------+|
|  | Stage | Percentage | Soak Time | Auto-Advance               ||
|  |-------+------------+-----------+----------------------------||
|  |   1   |     5%     |  24 hours | [x] Auto                   ||
|  |   2   |    25%     |  24 hours | [x] Auto                   ||
|  |   3   |    50%     |  24 hours | [x] Auto                   ||
|  |   4   |   100%     |     --    | (final stage)               ||
|  +-------------------------------------------------------------+|
|  [+ Add Stage]                                                   |
|                                                                  |
|  Health Gate:                                                    |
|  Pause rollout if error rate exceeds: [ 5 ] %                   |
|  (Measured via heartbeat error reports during soak period)       |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  NOTIFICATION ON PUBLISH                                         |
|                                                                  |
|  [ ] Send email to organizations                                 |
|  [ ] Push in-app announcement                                   |
|  [See Notification Settings ->]                                  |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|                     [Cancel]  [Publish & Start Rollout]          |
|                                                                  |
+=================================================================+
```

### Rollout Dashboard (Release Detail > Rollout Tab)

```
+=================================================================+
|                                                                  |
| ROLLOUT TAB - v2.1.0                                             |
|                                                                  |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | Rollout Status: ACTIVE                  Strategy: 4-Stage    | |
| |                                                              | |
| | Overall Progress:                                            | |
| | ████████████████████░░░░░░░░░░░░░░░░░░░░ 50%                 | |
| |                                                              | |
| | +---+---+---+---+---+---+---+---+---+---+---+---+---+---+  | |
| | | 5%    | 25%         | 50%               | 100%          |  | |
| | | Done  | Done        | Active            | Pending       |  | |
| | +---+---+---+---+---+---+---+---+---+---+---+---+---+---+  | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| STAGE DETAIL                                                     |
|                                                                  |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | Stage 1: 5% Rollout                              [Complete]  | |
| | Started: Mar 28, 14:30  |  Completed: Mar 29, 14:30         | |
| | Soak: 24h (24h elapsed)  |  Errors: 0  |  Installs: 8      | |
| |                                                              | |
| +-------------------------------------------------------------+ |
| | Stage 2: 25% Rollout                             [Complete]  | |
| | Started: Mar 29, 14:30  |  Completed: Mar 30, 14:30         | |
| | Soak: 24h (24h elapsed)  |  Errors: 0  |  Installs: 39     | |
| |                                                              | |
| +-------------------------------------------------------------+ |
| | Stage 3: 50% Rollout                              [Active]   | |
| | Started: Mar 30, 14:30                                       | |
| | Soak: 24h (12h 34m elapsed)                                  | |
| | Errors: 0  |  Installs: 78  |  Health: OK                   | |
| |                                                              | |
| | Time remaining: 11h 26m                                      | |
| | [||||||||||||||||||---------- ] 52% soak complete            | |
| |                                                              | |
| +-------------------------------------------------------------+ |
| | Stage 4: 100% Full Release                       [Pending]   | |
| | Estimated start: Mar 31, 14:30 (after Stage 3 soak)         | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ROLLOUT ACTIONS                                                  |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | [Advance Now]  Skip soak and advance to Stage 4             | |
| |                (requires confirmation)                       | |
| |                                                              | |
| | [Pause Rollout]  Freeze at current stage                    | |
| |                  (new installations won't receive update)    | |
| |                                                              | |
| | [Cancel Rollout]  Stop rollout entirely                     | |
| |                   (existing installations keep the update)   | |
| |                   (requires confirmation + reason)           | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ROLLOUT HEALTH METRICS                                           |
| +-------------------------------------------------------------+ |
| |                                                              | |
| |  Error Rate:    0.0%  (threshold: 5.0%)        [OK]         | |
| |  Crash Reports: 0     (this version, last 24h)              | |
| |  Heartbeat OK:  78/78 (all installations responsive)        | |
| |                                                              | |
| |  Adoption curve (hourly):                                    | |
| |  [line chart showing cumulative installations over time]     | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
+=================================================================+
```

### Rollout Action Confirmations

**Advance Now:**
```
+--------------------------------------------------+
| Advance Rollout Early?                            |
|                                                   |
| You are skipping the remaining soak time for      |
| Stage 3 (11h 26m remaining).                      |
|                                                   |
| This will immediately begin Stage 4 (100%),       |
| making v2.1.0 available to all installations.     |
|                                                   |
| Current health metrics are green. Proceed?        |
|                                                   |
|                 [Cancel]  [Advance to Stage 4]    |
+--------------------------------------------------+
```

**Pause Rollout:**
```
+--------------------------------------------------+
| Pause Rollout?                                    |
|                                                   |
| Installations that already received v2.1.0 will   |
| keep it. No new installations will receive the    |
| update until resumed.                             |
|                                                   |
| Reason (required):                                |
| [  Investigating crash reports from Stage 3    ]  |
|                                                   |
|                    [Cancel]  [Pause Rollout]      |
+--------------------------------------------------+
```

**Cancel Rollout:**
```
+--------------------------------------------------+
| Cancel Rollout?                                    |
|                                                   |
| WARNING: This is a significant action.            |
|                                                   |
| - 78 installations already on v2.1.0 will KEEP it|
| - No new installations will receive v2.1.0        |
| - Release status remains Published but rollout    |
|   stops                                           |
|                                                   |
| If this version has issues, consider using         |
| "Block Version" instead, which forces migration   |
| to a safe fallback.                               |
|                                                   |
| Reason (required):                                |
| [  Critical regression in parser module        ]  |
|                                                   |
|                  [Cancel]  [Cancel Rollout]        |
+--------------------------------------------------+
```

### Rollout Decision Algorithm

How the update-check API decides if an installation gets the update:

```
update_check(license_key, machine_fingerprint, current_version, platform, channel):

  1. Find latest published release for (channel, platform)
  2. If release is BLOCKED -> return force_update to fallback version
  3. If no rollout configured -> return update (100%)
  4. If rollout is paused -> return no_update
  5. If rollout is active:
     a. Compute deterministic hash:
        hash = SHA256(release_id + license_key + machine_fingerprint)
     b. Normalize to 0-100: bucket = hash[0..4] as uint32 % 10000 / 100.0
     c. If bucket <= current_rollout_percentage -> return update
     d. Else -> return no_update
  6. If installation already on this version -> return no_update
```

The deterministic hash ensures:
- Same installation always gets the same answer (no flapping)
- Distribution is statistically uniform across installations
- No central state needed to track "who got the update"

---

## 8. Version Dashboard

### Dedicated Dashboard View

Accessible from: Release List page header "Version Analytics" link, or Analytics page sub-nav.

```
+=================================================================+
|                                                                  |
| Version Dashboard                                                |
| Track adoption, distribution, and update health                  |
|                                                                  |
| Time Range: [Last 30 days v]  Channel: [Stable v]               |
|                                                                  |
| ALERT CARDS                                                      |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | [!] 6 installations still on blocked v2.0.1                  | |
| |     Migration target: v2.0.0  |  [View Details ->]          | |
| |                                                              | |
| | [!] 3 installations haven't updated in 30+ days              | |
| |     Orgs: CBI Delhi, NIA Mumbai, ...  |  [View ->]          | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +---------------------------+  +------------------------------+  |
| | VERSION DISTRIBUTION      |  | ADOPTION OVER TIME           |  |
| |                           |  |                              |  |
| | [PIE CHART]               |  | [LINE CHART]                |  |
| |                           |  |                              |  |
| |   v2.1.0  30.1%  (47)    |  | v2.1.0: ___/```             |  |
| |   v2.0.0  51.3%  (80)    |  | v2.0.0: ```\___             |  |
| |   v2.0.1   3.8%   (6)    |  | v1.9.5: ...\___             |  |
| |   v1.9.5  10.3%  (16)    |  |                              |  |
| |   Other    4.5%   (7)    |  | X: date, Y: % installations |  |
| |                           |  |                              |  |
| +---------------------------+  +------------------------------+  |
|                                                                  |
| +-------------------------------------------------------------+ |
| | UPDATE VELOCITY METRICS                                      | |
| |                                                              | |
| | Average update time:    3.2 days                             | |
| | Median update time:     1.8 days                             | |
| | 90th percentile:        7.1 days                             | |
| |                                                              | |
| | Fastest org:  CBI Delhi (0.3 days avg)                       | |
| | Slowest org:  XYZ Lab (14.2 days avg)                        | |
| |                                                              | |
| | Auto-update rate: 67% (installations with auto-update on)    | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| | PER-ORGANIZATION VERSION STATUS                              | |
| |                                                              | |
| | Organization     | Licenses | Version  | Updated    | Health | |
| |-----------------+----------+----------+------------+--------| |
| | CBI Delhi        |    12    | v2.1.0   | 2h ago     | [OK]  | |
| | NIA Mumbai       |     8    | v2.0.0   | 3d ago     | [OK]  | |
| | FSL Hyderabad    |     5    | v2.1.0   | 1d ago     | [OK]  | |
| | CERT-In          |     3    | v2.0.1   | 5d ago     | [!!]  | |
| | Private Lab A    |     2    | v1.9.5   | 30d ago    | [!]   | |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | Health Legend:  [OK] = latest or N-1                         | |
| |                [!]  = 2+ versions behind                     | |
| |                [!!] = on blocked version                     | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| | PLATFORM DISTRIBUTION                                        | |
| |                                                              | |
| | Windows x64:  132 (84.6%)  ████████████████████              | |
| | Linux x64:     24 (15.4%)  ███                               | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
+=================================================================+
```

### Version Drilldown (click on a version in the pie chart)

```
+=================================================================+
|                                                                  |
| [<- Version Dashboard]                                           |
|                                                                  |
| Installations on v2.0.0  (80 installations)                     |
|                                                                  |
| +-------------------------------------------------------------+ |
| | Organization     | Machine         | Platform    | Last Seen | |
| |-----------------+----------------+-------------+-----------| |
| | CBI Delhi        | CBI-WS-001     | Windows x64 | 1h ago    | |
| | CBI Delhi        | CBI-WS-002     | Windows x64 | 2h ago    | |
| | CBI Delhi        | CBI-WS-003     | Linux x64   | 3h ago    | |
| | NIA Mumbai       | NIA-LAB-01     | Windows x64 | 4h ago    | |
| | NIA Mumbai       | NIA-LAB-02     | Windows x64 | 1d ago    | |
| | ...              | ...            | ...         | ...       | |
| +-------------------------------------------------------------+ |
|                                                                  |
| BULK ACTIONS (for installations on this version):                |
| [Send Update Notification]  [Force Update to v2.1.0]            |
|                                                                  |
+=================================================================+
```

---

## 9. Notification System

### Notification Configuration (Release Detail > Notifications Tab)

```
+=================================================================+
|                                                                  |
| NOTIFICATIONS TAB - v2.1.0                                       |
|                                                                  |
| +-------------------------------------------------------------+ |
| | NOTIFICATION SETTINGS                                        | |
| |                                                              | |
| | When publishing this release, send:                          | |
| |                                                              | |
| | [x] Email notification to organizations                      | |
| |     Recipients: (*) All active orgs                          | |
| |                 ( ) Specific organizations                    | |
| |                 ( ) Specific license tiers                    | |
| |                                                              | |
| | [x] In-app announcement in desktop app                       | |
| |     Type: [Info v]   Dismissible: [x] Yes                   | |
| |                                                              | |
| | [ ] Neither (silent release)                                 | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| | EMAIL PREVIEW                                                | |
| |                                                              | |
| | Subject: [CMF v2.1.0 Available - Security Patch       ]     | |
| |                                                              | |
| | Body (Markdown):                                             | |
| | +----------------------------------------------------------+| |
| | | Dear {{org_name}},                                        || |
| | |                                                           || |
| | | A new version of Cyber Chakra Forensics is available.     || |
| | |                                                           || |
| | | **Version:** 2.1.0                                        || |
| | | **Type:** Security Patch                                  || |
| | | **Severity:** Recommended                                 || |
| | |                                                           || |
| | | ## What's New                                             || |
| | | {{release_notes}}                                         || |
| | |                                                           || |
| | | Please update at your earliest convenience.               || |
| | | The update will be available through the in-app updater.  || |
| | |                                                           || |
| | | -- Cyber Chakra Forensics Team                            || |
| | +----------------------------------------------------------+| |
| |                                                              | |
| | Template variables: {{org_name}}, {{version}},               | |
| | {{release_notes}}, {{download_url}}, {{severity}}            | |
| |                                                              | |
| | [Preview Email]  [Send Test Email to Me]                     | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| | IN-APP ANNOUNCEMENT PREVIEW                                  | |
| |                                                              | |
| | Title: [Update Available: v2.1.0 - Security Patch     ]     | |
| |                                                              | |
| | Body:                                                        | |
| | +----------------------------------------------------------+| |
| | | A new version is available with important security fixes. || |
| | | Update through: Settings > Check for Updates              || |
| | +----------------------------------------------------------+| |
| |                                                              | |
| | Action Button:                                               | |
| | Label: [Update Now          ]                                | |
| | URL:   [ccf://check-update  ]                               | |
| |        (deep link to trigger update in desktop app)          | |
| |                                                              | |
| | [Preview Announcement]                                       | |
| +-------------------------------------------------------------+ |
|                                                                  |
| NOTIFICATION HISTORY                                             |
| +-------------------------------------------------------------+ |
| | Date              | Type    | Recipients | Sent  | Failed    | |
| |------------------+---------+------------+-------+-----------| |
| | Mar 28, 14:35     | Email   | All (12)   | 11    | 1         | |
| | Mar 28, 14:35     | In-App  | Global     | OK    | --        | |
| +-------------------------------------------------------------+ |
|                                                                  |
| [Resend Failed]  [Send New Notification]                         |
|                                                                  |
+=================================================================+
```

### Notification Delivery Matrix

| Event                       | Email | In-App | Behavior                                     |
|-----------------------------|-------|--------|----------------------------------------------|
| Release Published           | Opt   | Opt    | Admin chooses at publish time                |
| Force Update Issued         | Auto  | Auto   | Always sent; blocking modal in desktop app   |
| Version Blocked             | Auto  | Auto   | Urgent; red announcement in desktop app      |
| Rollout Completed           | No    | No     | Internal admin log only                      |
| Rollout Paused (auto-gate)  | Admin | No     | Admin notification (SSE + email to admins)   |
| Soak Period Complete        | Admin | No     | SSE toast to connected admin sessions        |

---

## 10. Force Update Mechanism

### Force Update Configuration Dialog

Triggered by: "Force Update All" button on a release, or "Critical" severity at publish time.

```
+=================================================================+
|                                                                  |
|  Configure Force Update                               [X Close]  |
|                                                                  |
|  Release: v2.1.0 - Security Patch                                |
|                                                                  |
|  AFFECTED INSTALLATIONS                                          |
|  156 active installations are NOT on v2.1.0                      |
|  Breakdown:                                                      |
|    v2.0.0:  80 installations (51.3%)                             |
|    v2.0.1:   6 installations (3.8%) [BLOCKED]                    |
|    v1.9.5:  16 installations (10.3%)                             |
|    Other:   54 installations (34.6%)                             |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  TARGET                                                          |
|  (*) All installations not on v2.1.0                             |
|  ( ) Only installations on blocked versions                      |
|  ( ) Specific organizations only                                 |
|                                                                  |
|  GRACE PERIOD                                                    |
|                                                                  |
|  Soft deadline: [ 72 ] hours                                     |
|  Desktop app shows: dismissible banner + daily reminder          |
|                                                                  |
|  Hard deadline: [ 168 ] hours (7 days)                           |
|  Desktop app shows: BLOCKING MODAL, cannot use app until updated |
|                                                                  |
|  [!] FORENSIC ACQUISITION PROTECTION                            |
|  Active forensic acquisitions will NEVER be interrupted.         |
|  The force-update modal will wait until the acquisition          |
|  completes before blocking the user.                             |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  NOTIFICATION                                                    |
|  [x] Send email notification to affected organizations           |
|  [x] Push in-app blocking announcement                          |
|                                                                  |
|                   [Cancel]  [Issue Force Update]                  |
|                                                                  |
+=================================================================+
```

### Force Update Tracking Dashboard

```
+=================================================================+
|                                                                  |
| Force Update Status - v2.1.0                                     |
|                                                                  |
| +-------------------------------------------------------------+ |
| | OVERVIEW                                                     | |
| |                                                              | |
| | Total targeted:        156 installations                     | |
| | Updated (completed):    89 (57.1%)                           | |
| | Soft deadline passed:   42 (26.9%)                           | |
| | Hard deadline reached:   0 (0.0%)                            | |
| | Pending notification:   22 (14.1%)                           | |
| | Exempted:                3 (1.9%)                            | |
| |                                                              | |
| | Timeline:                                                    | |
| | [Now]---[Soft: Apr 1]--------[Hard: Apr 4]                   | |
| |    ^                                                         | |
| |    89 updated                                                | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| | INSTALLATION STATUS TABLE                                    | |
| |                                                              | |
| | Status: [All v]  Org: [All v]  Sort: [Deadline v]            | |
| |                                                              | |
| | Organization  | Machine     | From    | Status      | Deadline| |
| |--------------+-------------+---------+-------------+---------| |
| | CBI Delhi    | CBI-WS-001  | v2.0.0  | [Completed] | --      | |
| | CBI Delhi    | CBI-WS-002  | v2.0.0  | [Notified]  | Apr 1   | |
| | NIA Mumbai   | NIA-LAB-01  | v2.0.1  | [Soft DL]   | Apr 1   | |
| | FSL HYD      | FSL-01      | v2.0.0  | [Exempted]  | --      | |
| |              |             |         | Active acq. |         | |
| | XYZ Lab      | XYZ-WS-01   | v1.9.5  | [Pending]   | Apr 4   | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ACTIONS                                                          |
| [Extend Deadlines +24h]  [Exempt Selected]  [Revoke Force Update]|
|                                                                  |
+=================================================================+
```

### Desktop App Force Update Experience

The admin portal sends commands via the heartbeat response. The desktop app renders:

**Phase 1: Soft Deadline (first 72h)**
```
+--------------------------------------------------+
| [shield-alert icon]                               |
|                                                   |
| Critical Update Required                          |
|                                                   |
| Version 2.1.0 is available with important         |
| security fixes. Please update within 3 days.      |
|                                                   |
| [Update Now]                [Remind Me Later]     |
|                                                   |
| Deadline: April 1, 2026 at 14:30 IST              |
+--------------------------------------------------+
```
(Dismissible banner, appears at top of dashboard, shows again daily)

**Phase 2: Hard Deadline (after 72h, before 168h)**
```
+==================================================+
|                                                   |
| [!!!] UPDATE REQUIRED                             |
|                                                   |
| A critical security update (v2.1.0) must be       |
| installed. This application will be temporarily   |
| locked on April 4, 2026 until updated.            |
|                                                   |
| Time remaining: 2 days 6 hours                    |
|                                                   |
| [Update Now]                                      |
|                                                   |
| Cannot dismiss this notice.                       |
+==================================================+
```
(Non-dismissible modal, appears on every app launch)

**Phase 3: Hard Lock (after 168h)**
```
+==================================================+
|                                                   |
| [lock icon]  APPLICATION LOCKED                   |
|                                                   |
| This installation requires security update v2.1.0 |
| before it can be used.                            |
|                                                   |
| The update addresses critical vulnerabilities     |
| (CVE-2026-1234, CVE-2026-5678).                   |
|                                                   |
| [Download & Install Update]                       |
|                                                   |
| Contact support: support@cyberchakra.in           |
+==================================================+
```
(Blocks ALL functionality except the update button)

**Exception: Active Acquisition Running**
```
+==================================================+
|                                                   |
| [shield-alert icon]                               |
|                                                   |
| Update Pending                                    |
|                                                   |
| A critical update is required but will not        |
| interrupt your active forensic acquisition.       |
|                                                   |
| Current job: Logical Acquisition - Case #42       |
| Progress: 67%                                     |
|                                                   |
| The update will be applied automatically when     |
| the current acquisition completes.                |
|                                                   |
| [Force Update Now] (WILL cancel acquisition)      |
| [Wait for Completion]                             |
+==================================================+
```

---

## 11. Version Blocking

### Block Version Dialog

```
+=================================================================+
|                                                                  |
|  Block Version v2.0.1                                  [X Close] |
|                                                                  |
|  [!] WARNING: This is a critical administrative action.          |
|  All installations on v2.0.1 will be force-migrated.             |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  REASON (required)                                               |
|  +----------------------------------------------------------+   |
|  | CVE-2026-9999: Remote code execution vulnerability in      |   |
|  | the acquisition engine allows arbitrary code execution     |   |
|  | when processing malformed APK files.                       |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  CVE IDs (optional, comma-separated)                             |
|  [ CVE-2026-9999, CVE-2026-9998                            ]    |
|                                                                  |
|  Severity                                                        |
|  ( ) Low  ( ) Medium  (*) High  ( ) Critical                    |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  FALLBACK VERSION (required)                                     |
|  Select the safe version to migrate affected installations to:   |
|                                                                  |
|  [ v2.0.0 - Major Release (stable, published)         v ]       |
|                                                                  |
|  Available fallback versions:                                    |
|  - v2.0.0 (stable, published, 80 installations)                 |
|  - v1.9.5 (stable, deprecated, 16 installations)                |
|                                                                  |
|  Cannot select: v2.0.1 (self), v2.1.0 (draft), v2.0.2 (blocked)|
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  IMPACT ASSESSMENT                                               |
|                                                                  |
|  Installations currently on v2.0.1:   18                         |
|  Organizations affected:               4                         |
|     - CBI Delhi (5 machines)                                     |
|     - NIA Mumbai (8 machines)                                    |
|     - FSL Hyderabad (3 machines)                                 |
|     - Private Lab A (2 machines)                                 |
|                                                                  |
|  These installations will receive force-update to v2.0.0         |
|  via the next heartbeat/update-check cycle.                      |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  AUTOMATIC ACTIONS ON BLOCK                                      |
|  [x] Send urgent email to affected organizations                 |
|  [x] Push critical in-app announcement                          |
|  [x] Auto-create force-update for all affected installations    |
|                                                                  |
|  ---------------------------------------------------------------+
|                                                                  |
|  Type "BLOCK v2.0.1" to confirm:                                 |
|  [ BLOCK v2.0.1                                            ]    |
|                                                                  |
|                          [Cancel]  [Block Version]               |
|                                                                  |
+=================================================================+
```

### Block Status Card (on Release Detail page)

After blocking, the release detail shows a persistent red alert:

```
+-------------------------------------------------------------+
| [!!] VERSION BLOCKED                                         |
|                                                              |
| Blocked on Mar 25, 2026 by admin@ccf.gov.in                 |
|                                                              |
| Reason:  CVE-2026-9999 - Remote code execution in           |
|          acquisition engine                                  |
|                                                              |
| CVEs:    CVE-2026-9999, CVE-2026-9998                        |
| Severity: High                                               |
|                                                              |
| Fallback: v2.0.0                                             |
|                                                              |
| Migration Progress:                                          |
| ██████████████████████████████░░░░░░ 83%                     |
| 15 of 18 installations migrated                              |
| 3 pending: NIA-LAB-05 (offline), PVT-WS-01, PVT-WS-02      |
|                                                              |
| [View Pending]  [Resend Notifications]  [Unblock]            |
+-------------------------------------------------------------+
```

### Unblock Flow (super_admin only)

```
+=================================================================+
|                                                                  |
|  Unblock Version v2.0.1                               [X Close]  |
|                                                                  |
|  [!] Only super admins can unblock a version.                    |
|                                                                  |
|  Original block reason:                                          |
|  CVE-2026-9999 - Remote code execution in acquisition engine     |
|                                                                  |
|  UNBLOCK REASON (required)                                       |
|  +----------------------------------------------------------+   |
|  | CVE-2026-9999 has been patched in v2.0.1-hotfix.          |   |
|  | The original v2.0.1 binary was rebuilt and re-signed.     |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  [!] Warning: 15 installations were already migrated to v2.0.0. |
|  Unblocking will NOT automatically migrate them back to v2.0.1.  |
|                                                                  |
|                        [Cancel]  [Unblock Version]               |
|                                                                  |
+=================================================================+
```

---

## 12. Asset Management

### Assets Tab (Release Detail)

```
+=================================================================+
|                                                                  |
| ASSETS TAB - v2.1.0                                              |
|                                                                  |
| +-------------------------------------------------------------+ |
| | ASSET INTEGRITY STATUS                                       | |
| |                                                              | |
| | All 3 assets verified:  [SHA256 OK]  [Signatures OK]        | |
| | Total size: 254 MB                                           | |
| +-------------------------------------------------------------+ |
|                                                                  |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | Platform      | File                      | Size   | DLs    | |
| |--------------+---------------------------+--------+--------| |
| | Windows x64  | ccf_2.1.0_x64-setup.exe   | 81 MB  | 38     | |
| |              | Type: NSIS installer       |        |        | |
| |              | SHA256: a1b2c3d4e5f6...    |  [Copy]|        | |
| |              | Sig: [Valid - CC signing]  |        |        | |
| |              | DL: github.com/...        |  [Link]|        | |
| |              |                           |        |        | |
| | Linux x64    | ccf_2.1.0_amd64.AppImage  | 88 MB  | 10     | |
| |              | Type: AppImage             |        |        | |
| |              | SHA256: f6e5d4c3b2a1...    |  [Copy]|        | |
| |              | Sig: [Valid - CC signing]  |        |        | |
| |              | DL: github.com/...        |  [Link]|        | |
| |              |                           |        |        | |
| | Linux x64    | ccf_2.1.0_amd64.deb       | 85 MB  | 4      | |
| |              | Type: Debian package       |        |        | |
| |              | SHA256: 1a2b3c4d5e6f...    |  [Copy]|        | |
| |              | Sig: [Valid - CC signing]  |        |        | |
| |              | DL: github.com/...        |  [Link]|        | |
| +-------------------------------------------------------------+ |
|                                                                  |
| DOWNLOAD ANALYTICS                                               |
| +-------------------------------------------------------------+ |
| |                                                              | |
| | Total downloads:  52                                         | |
| |   Manual (portal):   8  (15.4%)                              | |
| |   Auto-update:      38  (73.1%)                              | |
| |   API:               6  (11.5%)                              | |
| |                                                              | |
| | By day (bar chart):                                          | |
| |   Mar 28:  ||||||||||||||||||  32                            | |
| |   Mar 29:  ||||||||||||        18                            | |
| |   Mar 30:  ||                   2                            | |
| |                                                              | |
| | Completed vs Failed:                                         | |
| |   Completed: 50 (96.2%)                                     | |
| |   Failed:     2 (3.8%)                                      | |
| |                                                              | |
| +-------------------------------------------------------------+ |
|                                                                  |
| ASSET ACTIONS (draft releases only)                              |
| [Upload New Asset]  [Remove Selected]  [Re-verify Checksums]    |
|                                                                  |
+=================================================================+
```

### Asset Upload Validation Flow

When uploading an asset (drag-drop or file picker):

```
1. Client-side: Calculate SHA256 in browser (Web Crypto API)
2. Upload to server with calculated hash
3. Server-side: Re-calculate SHA256 from received bytes
4. Compare: client hash == server hash
5. If match: store asset, record hash
6. If mismatch: reject upload, alert admin (possible corruption)
7. Check for Tauri signature (.sig file): verify against public key
8. Record verification status in release_assets.metadata
```

### Asset Integrity Badges

| State                  | Badge                | Meaning                                   |
|------------------------|----------------------|-------------------------------------------|
| SHA256 verified        | `[SHA256 OK]` green  | Server-computed hash matches               |
| Signature valid        | `[Sig OK]` green     | Code-signing signature validates           |
| Signature missing      | `[No Sig]` amber     | No .sig file uploaded for this asset       |
| Hash mismatch          | `[HASH FAIL]` red    | Client and server hashes differ            |
| Signature invalid      | `[SIG FAIL]` red     | Signature does not match binary            |

---

## 13. API Endpoints (New/Extended)

### New Admin API Endpoints

```
# Rollout Management
POST   /api/v1/releases/{id}/rollout          Create/configure rollout
GET    /api/v1/releases/{id}/rollout          Get rollout status
PATCH  /api/v1/releases/{id}/rollout          Update rollout (advance, pause, resume)
POST   /api/v1/releases/{id}/rollout/advance  Force advance to next stage
POST   /api/v1/releases/{id}/rollout/pause    Pause rollout
POST   /api/v1/releases/{id}/rollout/resume   Resume paused rollout
POST   /api/v1/releases/{id}/rollout/cancel   Cancel rollout

# Version Blocking
POST   /api/v1/releases/{id}/block            Block a version
POST   /api/v1/releases/{id}/unblock          Unblock a version (super_admin)
GET    /api/v1/releases/{id}/block-status      Get block details + migration progress

# Force Update
POST   /api/v1/releases/{id}/force-update     Issue force update
GET    /api/v1/releases/{id}/force-update      Get force update status
PATCH  /api/v1/releases/{id}/force-update      Modify (extend deadline, exempt)
DELETE /api/v1/releases/{id}/force-update      Revoke force update

# Notifications
POST   /api/v1/releases/{id}/notify           Send release notification
GET    /api/v1/releases/{id}/notifications     Get notification history

# Version Dashboard
GET    /api/v1/analytics/version-distribution  Pie chart data
GET    /api/v1/analytics/adoption-curve        Line chart data (by version over time)
GET    /api/v1/analytics/update-velocity       Average/median update times
GET    /api/v1/analytics/org-versions          Per-org version table
GET    /api/v1/analytics/stale-installations   Installations not updating

# Webhook
POST   /api/webhooks/github                    GitHub webhook receiver
```

### Extended Public API (Desktop App)

The existing `POST /api/public/v1/update-check` response is extended:

```json
{
  "update_available": true,
  "is_mandatory": false,
  "is_security": true,
  "latest_version": "2.1.0",
  "version_code": 210100,
  "release_notes": "## What's New\n...",
  "download_url": "https://github.com/.../releases/download/v2.1.0/ccf_2.1.0_x64-setup.exe",
  "file_size": 85000000,
  "sha256_hash": "a1b2c3d4e5f6...",
  "signature": "base64-encoded-tauri-signature",
  "published_at": "2026-03-28T14:30:00Z",

  "force_update": {
    "required": true,
    "reason": "Critical security patch addressing CVE-2026-1234",
    "soft_deadline": "2026-04-01T14:30:00Z",
    "hard_deadline": "2026-04-04T14:30:00Z",
    "allow_acquisition_completion": true
  },

  "version_blocked": null,
  "current_version_blocked": {
    "blocked": true,
    "reason": "CVE-2026-9999 found in v2.0.1",
    "fallback_version": "2.0.0",
    "fallback_download_url": "https://github.com/.../releases/download/v2.0.0/...",
    "fallback_sha256": "..."
  }
}
```

The existing heartbeat response `commands` array is extended:

```json
{
  "ok": true,
  "server_time": "2026-03-28T16:00:00Z",
  "commands": [
    {
      "action": "force_update",
      "payload": {
        "version": "2.1.0",
        "download_url": "https://...",
        "soft_deadline": "2026-04-01T14:30:00Z",
        "hard_deadline": "2026-04-04T14:30:00Z",
        "reason": "Critical security patch"
      }
    },
    {
      "action": "show_announcement",
      "payload": {
        "id": "uuid",
        "title": "Update Available",
        "body": "v2.1.0 is available...",
        "type": "warning",
        "dismissible": false,
        "action_url": "ccf://check-update",
        "action_label": "Update Now"
      }
    }
  ]
}
```

---

## 14. Desktop App Integration Points

### Changes Required in Desktop App (`src-tauri/src/licensing/mod.rs`)

| Component                    | Change                                                | Priority |
|------------------------------|-------------------------------------------------------|----------|
| `HeartbeatRequest`           | Add `current_version`, `platform` fields              | P0       |
| `HeartbeatResponse`          | Handle `force_update` command in `commands` array     | P0       |
| `UpdateCheckRequest`         | Add `X-License-Key`, `X-Hardware-Fingerprint` headers | P0       |
| `UpdateCheckResponse`        | Parse `force_update` and `current_version_blocked`    | P0       |
| Force Update UI              | Implement soft/hard deadline modal (React component)  | P0       |
| Acquisition Guard            | Never show blocking modal during active acquisition   | P0       |
| Version Reporter             | Report `current_version` + `platform` on every heartbeat | P1    |
| Auto-Update Channel          | Read `update_channel` from license config             | P1       |
| Update Telemetry             | Report update success/failure back to server           | P2       |

### Tauri Plugin Updater Compatibility

The admin portal's update-check API MUST return the Tauri updater JSON format:

```json
{
  "version": "2.1.0",
  "notes": "## What's New\n...",
  "pub_date": "2026-03-28T14:30:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "base64-tauri-signature",
      "url": "https://github.com/.../ccf_2.1.0_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "base64-tauri-signature",
      "url": "https://github.com/.../ccf_2.1.0_amd64.AppImage.tar.gz"
    }
  }
}
```

The portal wraps this format and adds the custom `force_update` and `version_blocked` fields, which the desktop app reads from custom headers or a separate endpoint.

---

## 15. Keyboard Shortcuts

| Shortcut   | Context           | Action                         |
|------------|-------------------|--------------------------------|
| `N`        | Release list      | New release                    |
| `P`        | Release detail    | Publish draft                  |
| `E`        | Release detail    | Edit draft                     |
| `/`        | Release list      | Focus search                   |
| `J` / `K`  | Release list      | Navigate rows down/up          |
| `Enter`    | Release list      | Open selected release          |
| `Esc`      | Any dialog        | Close dialog                   |
| `Ctrl+S`   | Edit release      | Save changes                   |

---

## 16. Error States & Edge Cases

### Empty States

**No releases yet:**
```
+--------------------------------------------------+
|                                                   |
|  [package icon]                                   |
|                                                   |
|  No releases yet                                  |
|                                                   |
|  Create your first release manually or            |
|  configure the GitHub webhook to auto-import      |
|  builds from your CI/CD pipeline.                 |
|                                                   |
|  [+ Create Release]  [Configure Webhook]          |
+--------------------------------------------------+
```

**No installations reporting versions:**
```
+--------------------------------------------------+
|                                                   |
|  [signal icon]                                    |
|                                                   |
|  No version data available                        |
|                                                   |
|  Version tracking requires installations to       |
|  send heartbeats. Deploy the latest desktop       |
|  app build with version reporting enabled.        |
|                                                   |
+--------------------------------------------------+
```

### Edge Cases Handled

| Edge Case                                | Behavior                                                              |
|------------------------------------------|-----------------------------------------------------------------------|
| Publish with 0 assets                    | Block with error: "Cannot publish a release without assets"           |
| Block the only published version          | Require fallback version; warn if no other published version exists   |
| Force update while acquisition running    | Desktop app defers until acquisition completes                        |
| Admin tries to delete published release   | Block; must deprecate or block instead                                |
| Two admins publish simultaneously         | Optimistic lock; second attempt gets 409 Conflict                    |
| GitHub webhook replay (duplicate)         | Idempotent; check if version already exists, return existing draft    |
| Rollout auto-gate triggers (error spike)  | Pause rollout, send SSE alert to admin, log to audit                 |
| Installation offline for 30+ days         | Marked "stale" in dashboard; force-update deadline extends            |
| Block version that has active rollout     | Cancel rollout automatically, then apply block                        |
| Unblock a version after installations migrated | Migration is NOT reversed; installations stay on fallback        |

### Validation Rules

```typescript
// Zod schemas for the new endpoints

const createRolloutSchema = z.object({
  strategy: z.enum(['percentage', 'targeted', 'immediate']),
  stages: z.array(z.object({
    percentage: z.number().min(1).max(100),
    soak_hours: z.number().min(0).max(720),  // max 30 days
  })).min(1).max(10),
  auto_advance: z.boolean().default(false),
  error_threshold: z.number().min(0).max(100).default(5),
  target_org_ids: z.array(z.string().uuid()).optional(),
  target_tiers: z.array(z.string()).optional(),
});

const blockVersionSchema = z.object({
  reason: z.string().min(10).max(2000),
  cve_ids: z.array(z.string().regex(/^CVE-\d{4}-\d{4,}$/)).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  fallback_release_id: z.string().uuid(),
});

const forceUpdateSchema = z.object({
  target: z.enum(['all', 'blocked_versions', 'specific_orgs']),
  target_org_ids: z.array(z.string().uuid()).optional(),
  soft_deadline_hours: z.number().min(1).max(720).default(72),
  hard_deadline_hours: z.number().min(24).max(720).default(168),
  notify_email: z.boolean().default(true),
  notify_in_app: z.boolean().default(true),
});

const releaseNotificationSchema = z.object({
  notify_email: z.boolean(),
  notify_in_app: z.boolean(),
  target: z.enum(['all', 'active_only', 'specific_orgs', 'specific_tiers']),
  target_org_ids: z.array(z.string().uuid()).optional(),
  target_tiers: z.array(z.string()).optional(),
  email_subject: z.string().max(255).optional(),
  email_body: z.string().max(10000).optional(),
  in_app_title: z.string().max(255).optional(),
  in_app_body: z.string().max(5000).optional(),
});
```

---

## Appendix A: Component Inventory

New React components required for the update management module:

| Component                     | Location                                    | Description                                   |
|-------------------------------|---------------------------------------------|-----------------------------------------------|
| `ReleaseListPage`             | `app/(dashboard)/releases/page.tsx`         | Main release list with hero card + table       |
| `ReleaseDetailPage`           | `app/(dashboard)/releases/[id]/page.tsx`    | Tabbed release detail view                     |
| `ReleaseCreateWizard`         | `app/(dashboard)/releases/new/page.tsx`     | 3-step creation wizard                         |
| `RolloutConfigDialog`         | `components/releases/RolloutConfigDialog`   | Publish + rollout config modal                 |
| `RolloutDashboard`            | `components/releases/RolloutDashboard`      | Stage progress, health metrics                 |
| `RolloutStageCard`            | `components/releases/RolloutStageCard`      | Individual stage status card                   |
| `BlockVersionDialog`          | `components/releases/BlockVersionDialog`    | Block version confirmation dialog              |
| `UnblockVersionDialog`        | `components/releases/UnblockVersionDialog`  | Unblock confirmation (super_admin)             |
| `ForceUpdateDialog`           | `components/releases/ForceUpdateDialog`     | Force update configuration                     |
| `ForceUpdateTracker`          | `components/releases/ForceUpdateTracker`    | Per-installation force update status           |
| `NotificationConfigPanel`     | `components/releases/NotificationConfig`    | Email + in-app notification settings           |
| `AssetTable`                  | `components/releases/AssetTable`            | Asset list with integrity badges               |
| `AssetUploader`               | `components/releases/AssetUploader`         | Drag-drop uploader with hash verification      |
| `VersionDashboard`            | `components/analytics/VersionDashboard`     | Pie chart + line chart + org table             |
| `VersionPieChart`             | `components/analytics/VersionPieChart`      | Recharts PieChart for version distribution     |
| `AdoptionCurveChart`          | `components/analytics/AdoptionCurveChart`   | Recharts LineChart for adoption over time      |
| `OrgVersionTable`             | `components/analytics/OrgVersionTable`      | Per-org version status with health indicators  |
| `BlockMigrationProgress`      | `components/releases/BlockMigrationProgress`| Progress bar for blocked version migration     |
| `ReleaseStatusBadge`          | `components/releases/ReleaseStatusBadge`    | Color-coded status badge component             |
| `ReleaseTimelineEvent`        | `components/releases/ReleaseTimelineEvent`  | Audit log entry for release actions            |

---

## Appendix B: SSE Events for Real-Time Updates

The admin portal uses Server-Sent Events for live dashboard updates:

| Event                         | Data                                          | Triggered By                    |
|-------------------------------|-----------------------------------------------|---------------------------------|
| `release.draft_created`       | `{ release_id, version, source: "webhook" }`  | GitHub webhook                  |
| `release.published`           | `{ release_id, version, published_by }`       | Admin publishes release         |
| `release.blocked`             | `{ release_id, version, reason }`             | Admin blocks version            |
| `rollout.stage_advanced`      | `{ release_id, stage, percentage }`           | Auto-advance or manual          |
| `rollout.paused`              | `{ release_id, reason }`                      | Error gate or manual pause      |
| `rollout.completed`           | `{ release_id, version }`                     | Final stage completes           |
| `force_update.completed`      | `{ release_id, license_id, machine }`         | Installation updates            |
| `force_update.deadline_hit`   | `{ release_id, count }`                       | Hard deadline reached           |
| `block.migration_progress`    | `{ release_id, migrated, total }`             | Installation migrates           |

---

## Appendix C: Audit Log Events

All update management actions are logged to `admin_audit_log`:

| Action                       | Resource Type | Logged Fields                                     |
|------------------------------|---------------|----------------------------------------------------|
| `release.create`             | `release`     | version, channel, source (manual/webhook)          |
| `release.update`             | `release`     | changed fields (diff)                              |
| `release.publish`            | `release`     | version, rollout strategy                          |
| `release.block`              | `release`     | version, reason, CVEs, fallback, affected count    |
| `release.unblock`            | `release`     | version, unblock reason                            |
| `release.deprecate`          | `release`     | version                                            |
| `release.delete_draft`       | `release`     | version                                            |
| `rollout.create`             | `rollout`     | stages, strategy, auto_advance                     |
| `rollout.advance`            | `rollout`     | from_stage, to_stage, manual/auto                  |
| `rollout.pause`              | `rollout`     | reason, current_stage                              |
| `rollout.resume`             | `rollout`     | resumed_from_stage                                 |
| `rollout.cancel`             | `rollout`     | reason, final_percentage                           |
| `force_update.issue`         | `force_update`| target, deadlines, affected count                  |
| `force_update.exempt`        | `force_update`| license_id, reason                                 |
| `force_update.revoke`        | `force_update`| reason                                             |
| `notification.send`          | `notification`| type (email/in_app), recipient count               |
| `asset.upload`               | `release_asset`| filename, platform, sha256                        |
| `asset.delete`               | `release_asset`| filename, platform                                |
| `webhook.received`           | `webhook`     | source, event_type, version                        |
