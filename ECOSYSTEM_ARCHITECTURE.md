# Cyber Chakra Forensics -- Complete Ecosystem Architecture

**Date:** 2026-03-28
**Status:** Living Document
**Audience:** New team members, architects, security auditors

---

## Table of Contents

1. [What Is CCF?](#1-what-is-ccf)
2. [High-Level Architecture](#2-high-level-architecture)
3. [The Three Tiers](#3-the-three-tiers)
4. [Data Flow: Every Operation](#4-data-flow-every-operation)
5. [Security Boundaries](#5-security-boundaries)
6. [API Surface Reference](#6-api-surface-reference)
7. [Database Schemas](#7-database-schemas)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Deployment Topology](#9-deployment-topology)
10. [Background Jobs and Scheduled Tasks](#10-background-jobs-and-scheduled-tasks)
11. [Failure Modes and Resilience](#11-failure-modes-and-resilience)
12. [Secrets Inventory](#12-secrets-inventory)
13. [Cost Summary](#13-cost-summary)
14. [Scaling Path](#14-scaling-path)
15. [Developer Quickstart](#15-developer-quickstart)

---

## 1. What Is CCF?

Cyber Chakra Forensics (CCF) is a professional mobile forensics suite for law enforcement, forensic investigators, and legal professionals. It handles evidence collection and analysis for both Android and iOS devices, with full chain-of-custody support and Section 65B BSA 2023 compliance for Indian courts.

**Key stats:**
- 60+ database tables (SQLite with SQLCipher on the desktop)
- 100+ Tauri IPC commands
- 20+ forensic parsers (WhatsApp, Instagram, Signal, Telegram, Gmail, etc.)
- 3-role RBAC + 6-role per-case RBAC
- Cross-platform: Windows and Linux

The complete ecosystem has three tiers: the desktop application (the product), the admin portal (the control plane), and GitHub (the build system). This document explains how they all fit together.

---

## 2. High-Level Architecture

```
 DEVELOPER WORKSTATION
 =====================
 Code --> PR --> Review --> Merge --> Tag --> Release

        |
        | git push
        v

 GITHUB (Code + CI/CD)
 =====================
 +------------------+    +-------------------+    +-------------------+
 | Repository       | -> | GitHub Actions    | -> | GitHub Releases   |
 | (source code)    |    | (build, typecheck |    | (binaries, sigs,  |
 |                  |    |  audit, deploy)   |    |  changelogs)      |
 +------------------+    +-------------------+    +--------+----------+
                                                           |
                             +-----------------------------+
                             |                             |
                     Deploy workflow              Binary download URL
                     (SCP + SSH)                  (stored in release_assets)
                             |                             |
                             v                             |
 HOSTINGER CLOUD (Admin Portal)                            |
 ==============================                            |
 +---------------+  +-----------+  +--------------------+  |
 | React SPA     |  | Express   |  | MySQL 8.x          | |
 | (admin UI)    |  | API       |  | (licenses, orgs,   | |
 | admin.ccf.in  |  | :3001     |  |  analytics, events,| |
 | Vite + TS     |  | Node 20   |  |  releases, tickets)| |
 +---------------+  +-----+-----+  +--------------------+  |
                          |                                 |
                          | Serves:                         |
                          |  - Admin dashboard              |
                          |  - License management           |
                          |  - Release management           |
                          |  - Analytics                    |
                          |  - Public API for desktop app   |
                          |                                 |
                          | Public API endpoints:           |
                          |  /api/v1/license/*              |
                          |  /api/v1/heartbeat              |
                          |  /api/v1/update-check           |
                          |  /api/v1/announcements          |
                          |  /api/v1/trial-request          |
                          |  /api/v1/support/*              |
                          |                                 |
                          +---------+-----------------------+
                                    |
                     License validation, update check,
                     heartbeat, announcements, trials
                                    |
                                    v

 CUSTOMER MACHINES (Desktop App)
 ===============================
 +-----------------------------------------------------+
 | Cyber Chakra Forensics (Tauri v2)                    |
 |                                                      |
 | +----------+  +----------+  +---------------------+ |
 | | React 19 |  | Rust     |  | SQLite + SQLCipher  | |
 | | Frontend |  | Backend  |  | (cases, evidence,   | |
 | | TS + TW  |  | Tokio    |  |  audit logs, users) | |
 | +----------+  +----------+  +---------------------+ |
 |                                                      |
 | Connected to:                                        |
 |  - ADB (Android device forensics)                    |
 |  - libimobiledevice (iOS device forensics)           |
 |  - Cloud OAuth (Google, Microsoft data acquisition)  |
 |  - wkhtmltopdf (PDF report generation)               |
 +-----------------------------------------------------+
```

---

## 3. The Three Tiers

### 3.1 Desktop Application (Tauri v2)

The product itself. Runs on law enforcement officers' machines.

| Aspect | Detail |
|--------|--------|
| **Framework** | Tauri v2 (Rust backend + React 19 frontend) |
| **Frontend** | TypeScript, Tailwind CSS, shadcn/ui, Zustand, Framer Motion |
| **Backend** | Rust, Tokio async runtime, rusqlite (SQLCipher) |
| **Database** | SQLite (encrypted with SQLCipher) -- 60+ tables |
| **Platforms** | Windows (NSIS installer), Linux (AppImage, .deb) |
| **Updater** | `tauri-plugin-updater` with minisign signature verification |
| **License** | HMAC-SHA256 key validation, hardware fingerprint binding |
| **Offline** | 30-day grace period without server contact |

Key modules:
- `src-tauri/src/licensing/` -- License activation, validation, offline mode, hardware fingerprint
- `src-tauri/src/commands/` -- Tauri IPC command handlers (device, auth, case, acquisition)
- `src-tauri/src/acquisition/` -- Data extraction (ADB backup, filesystem TAR, content provider)
- `src-tauri/src/parsers/` -- Forensic parsers (WhatsApp, telephony, etc.)
- `src-tauri/src/reports/` -- HTML/PDF report generation via Tera templates + wkhtmltopdf
- `src-tauri/src/platform/` -- Cross-platform abstractions (storage, fingerprint, system info)

### 3.2 Admin Portal (Express + React)

The control plane. Where CCF admins manage licenses, customers, releases, and analytics.

| Aspect | Detail |
|--------|--------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Query, Recharts |
| **Backend** | Node.js 20, Express, TypeScript, Prisma ORM |
| **Database** | MySQL 8.x |
| **Auth** | JWT (access + refresh tokens), bcrypt password hashing |
| **Hosting** | Hostinger VPS at `admin.cyberchakra.in` |
| **Process Manager** | PM2 or Hostinger Node.js manager |

Directory structure:
```
admin-portal/
  frontend/                  React + Vite SPA
    src/
      pages/                 13 page components (Dashboard, Licenses, Orgs, Analytics, etc.)
      components/            Layout, UI (shadcn/ui), shared components
      stores/                Zustand state management
      lib/                   API client, utilities
  backend/                   Express + Prisma API
    prisma/schema.prisma     Database schema (22 models)
    src/
      routes/                14 route files (public + admin)
      middleware/             Auth, validation, rate limiting, error handling, sanitization
      services/              Rollout engine, email
      cron/                  5 scheduled background tasks
      lib/                   License key generator, audit logger, Prisma client, response helpers
  specs/                     API specs, database schema, master plan
  .github/workflows/         CI + deploy pipelines
```

### 3.3 GitHub (Code + CI/CD)

The build system and source of truth for code.

| Aspect | Detail |
|--------|--------|
| **Repository** | `cyber-chakra-forensics` (monorepo -- desktop app + admin portal in `docs/admin-portal/`) |
| **CI** | GitHub Actions -- TypeScript checks, builds, security audit |
| **CD** | Manual dispatch workflow -- builds, packages, deploys to Hostinger via SCP + SSH |
| **Releases** | GitHub Releases for desktop app binaries + minisign signatures |

---

## 4. Data Flow: Every Operation

### 4.1 License Activation Flow

This is the most critical flow. It happens when a user first enters their license key.

```
DESKTOP APP                              ADMIN PORTAL                              MYSQL
-----------                              ------------                              -----
1. User enters license key
   + email in the app
           |
2. App generates hardware
   fingerprint (SHA256 of
   machine ID + CPU +
   motherboard + MAC + disk)
           |
3. POST /api/v1/license/activate  --->  4. Zod validates request body
   {                                     5. Find license by key
     license_key: "CCF-XXXX-...",        6. Check status (not revoked/
     hardware_fingerprint: "a1b2..",        suspended/expired)
     user_email: "user@gov.in",          7. Check valid_from / valid_until
     machine_name: "CYBER-LAB-01",       8. Check if already activated on
     os_info: "Windows 11",                 this machine (idempotent)
     app_version: "2.1.0"               9. Check activation limit
   }                                        (activeCount < maxActivations)
                                         10. Create LicenseActivation row  --->  INSERT activation
                                         11. Update License row                  UPDATE license
                                             (currentActivations++,                (count, status)
                                              status = 'active')
                                         12. Log LicenseEvent             --->  INSERT event
                                         13. Fetch active Announcements   <---  SELECT announcements
                                    <--- 14. Return response:
15. App receives:                         {
   - organization name                      success: true,
   - expires_at                             data: {
   - validation_token (UUID)                  license_id: null,
   - next_validation date                     organization: "Mumbai Cyber Cell",
   - announcements                            expires_at: "2027-03-28T...",
16. App stores license info                   validation_token: "uuid-v4",
    in local SQLite cache                     next_validation: "2026-04-27T...",
17. App displays announcements                valid: true,
                                              announcements: [...]
                                            }
                                          }
```

**Response format contract:** The response MUST match the Rust `ServerResponseData` struct:
```rust
pub struct ServerResponseData {
    pub license_id: Option<i64>,
    pub organization: Option<String>,
    pub expires_at: Option<String>,
    pub validation_token: Option<String>,
    pub next_validation: Option<String>,
    pub valid: Option<bool>,
    pub announcements: Vec<Announcement>,
}
```

### 4.2 License Validation Flow (Online)

Happens every 30 days (`VALIDATION_INTERVAL_DAYS = 30`) when the app has internet.

```
DESKTOP APP                              ADMIN PORTAL
-----------                              ------------
1. App checks: has 30 days
   passed since last validation?
           |
2. POST /api/v1/license/validate  --->  3. Find license by key
   {                                     4. Check expiry, status
     license_key: "CCF-XXXX-...",        5. Find activation by fingerprint
     hardware_fingerprint: "a1b2..",     6. Generate new validation token (UUID)
     app_version: "2.1.0"               7. Update lastValidatedAt + token
   }                                     8. Fetch active announcements
                                    <--- 9. Return { success, data: { ...token, announcements } }
10. App updates local cache
    with new token + timestamp
```

### 4.3 License Validation Flow (Offline)

When the app cannot reach the server.

```
DESKTOP APP (offline)
---------------------
1. App checks: has 30 days passed since last validation?
   Yes, and server is unreachable.
          |
2. Read cached validation_token + last_validated from local SQLite
          |
3. Verify validation token integrity
   (crypto verification against hardware fingerprint)
          |
4. Calculate: grace_expires = last_validated + 30 days
          |
5. If now < grace_expires:
     VALID -- app works normally
     Display: "Offline mode: N days remaining"
   If now >= grace_expires:
     INVALID -- app locks out
     Display: "Please connect to internet to revalidate"
```

### 4.4 Heartbeat Flow

Desktop app phones home periodically to report usage statistics.

```
DESKTOP APP                              ADMIN PORTAL                     MYSQL
-----------                              ------------                     -----
1. Every ~4 hours (active)
   or ~24 hours (idle),
   app sends heartbeat
          |
2. POST /api/v1/heartbeat  ---------->  3. Zod validates body
   {                                     4. Create Heartbeat row  ------> INSERT heartbeat
     license_key: "CCF-...",             5. Find license by key
     hardware_fingerprint: "...",        6. Update activation's
     app_version: "2.1.0",                 lastHeartbeatAt       ------> UPDATE activation
     usage_stats: {                      7. Fetch active
       cases_created: 12,                   announcements         <------ SELECT announcements
       acquisitions: 8,
       reports_generated: 5
     }
   }
                                    <--- 8. Return:
9. App processes response:                {
   - Display any announcements              success: true,
   - Check update_available                 announcements: ["..."],
                                            update_available: null
                                          }
```

**Privacy note:** The heartbeat contains ONLY aggregate counts (cases_created, acquisitions, reports_generated). It never includes case names, suspect names, evidence data, or any PII from the forensic investigation.

### 4.5 Update Check Flow

How the desktop app discovers and installs new versions.

```
DESKTOP APP                              ADMIN PORTAL                     MYSQL
-----------                              ------------                     -----
1. tauri-plugin-updater fires
   GET /api/v1/update-check
   ?target=windows
   &arch=x86_64
   &current_version=2.0.5
   Headers:
     X-License-Key: CCF-...
     X-Hardware-Fingerprint: ...
          |                          --> 2. Check if current_version
          |                                 is BLOCKED              ----> SELECT blocked_versions
          |                              3. If blocked + forceUpdateTo:
          |                                 return forced update
          |                              4. Find latest published,
          |                                 non-blocked, stable
          |                                 release                 ----> SELECT releases + assets
          |                              5. If current == latest:
          |                                 return HTTP 204
          |                              6. Check rollout policy:
          |                                 shouldReceiveUpdate()   ----> SELECT rollout_policies
          |                                 (deterministic MD5 hash        + stages
          |                                  of licenseKey+releaseId
          |                                  maps to 0-99 bucket)
          |                              7. If not in rollout bucket:
          |                                 return HTTP 204
          |                         <--- 8. Return Tauri updater JSON:
9. Tauri updater receives:                {
   {                                        version: "2.1.0",
     version: "2.1.0",                     notes: "...",
     notes: "...",                          pub_date: "2026-03-28T...",
     pub_date: "...",                       platforms: {
     platforms: {                             "windows-x86_64": {
       "windows-x86_64": {                    signature: "minisign...",
         signature: "...",                     url: "https://github.com/.../download/..."
         url: "..."                          }
       }                                   }
     }                                   }
   }
          |
10. Download binary from URL
    (typically GitHub Releases)
          |
11. Verify minisign signature
    against embedded public key
    (in tauri.conf.json "pubkey")
          |
12. If signature valid: install
    If signature invalid: reject
    (prevents DNS hijack attacks)
```

**Tauri updater public key** (base64-encoded, from `tauri.conf.json`):
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK
```

**Rollout strategy:** The rollout engine uses deterministic hashing (`MD5(licenseKey + releaseId) % 100`) so the same machine always gets a consistent yes/no decision for any given release. This prevents the "flickering" problem where a client alternately sees and does not see an update.

### 4.6 Trial Request Flow

How a prospective customer gets a trial license.

```
DESKTOP APP                              ADMIN PORTAL                     MYSQL
-----------                              ------------                     -----
1. User opens trial form
   in the desktop app
2. Fills in: name, email,
   org, purpose, etc.
          |
3. POST /api/v1/trial-request  -------> 4. Validate with Zod
   {                                     5. Check for existing
     full_name: "...",                      pending/approved request
     email: "...",                          for this fingerprint    ----> SELECT trial_requests
     organization: "...",                6. If pending: return
     organization_type: "...",              existing request_id
     purpose: "...",                     7. If new: create row     ----> INSERT trial_request
     hardware_fingerprint: "...",        8. Send admin notification
     machine_name: "...",                   email (fire-and-forget)
     os_info: "...",
     app_version: "..."
   }
                                    <--- 9. Return { request_id, status: "pending" }
10. App displays "Request
    submitted. You will
    be notified."

--- SOME TIME LATER ---

ADMIN PORTAL (admin user)               MYSQL
--------------------------               -----
11. Admin sees trial request
    in dashboard (TrialsPage)
12. Admin reviews and clicks
    "Approve" or "Reject"
13. If approved:
    - Generate license key        ----> INSERT license
      (CCF-XXXX-XXXX-XXXX-XXXX)        UPDATE trial_request
    - Store approved_license_key
      on the trial_request row
14. If rejected:
    - Store rejection_reason      ----> UPDATE trial_request

--- USER CHECKS BACK ---

DESKTOP APP                              ADMIN PORTAL                     MYSQL
-----------                              ------------                     -----
15. GET /api/v1/trial-request-status --> 16. Find latest request
    ?hardware_fingerprint=...               by fingerprint         ----> SELECT trial_request
                                    <--- 17. Return status +
18. If approved:                             license_key (if approved)
    Auto-fill license key
    User clicks "Activate"
    (goes to Activation Flow 4.1)
    If rejected:
    Display rejection reason
```

### 4.7 Support Ticket Flow

```
DESKTOP APP                              ADMIN PORTAL                     MYSQL
-----------                              ------------                     -----
1. User opens support form
2. POST /api/v1/support/       -------> 3. Create ticket +        ----> INSERT ticket
   create-ticket                           initial message               INSERT message
   { license_key, subject,
     category, message }
                                    <--- 4. Return { ticket_number }

--- ADMIN SIDE ---
5. Admin sees ticket in SupportPage
6. Admin replies (possibly internal note)
7. Update status (open -> in_progress -> resolved -> closed)
```

### 4.8 Announcement Flow

```
ADMIN PORTAL                                           DESKTOP APP
------------                                           -----------
1. Admin creates announcement
   (title, message, type,
    targeting rules, schedule)
2. Stored in MySQL with:
   - target_org_ids (JSON)
   - target_tiers (JSON)
   - target_versions (JSON)
   - starts_at / expires_at
   - dismissible flag
   - priority

--- ON NEXT HEARTBEAT OR VALIDATION ---

3. Desktop app calls               <--- 4. Portal queries active
   heartbeat or validate                   announcements where:
                                           is_active = true AND
                                           starts_at <= now AND
                                           (expires_at IS NULL OR
                                            expires_at > now)
5. App displays announcements
   in the UI (info, warning,
   critical banners)
```

---

## 5. Security Boundaries

### 5.1 What Data NEVER Leaves the Desktop App

These categories of data are stored exclusively in the local SQLite database and are never transmitted to the admin portal or any external server:

- **Case data:** Case names, descriptions, examiner notes, FIR numbers
- **Evidence data:** Extracted messages, call logs, media files, contacts
- **Suspect/device PII:** Suspect names, phone numbers, device serial numbers, IMEI
- **Analysis results:** Parsed WhatsApp conversations, timeline events, keyword hits
- **Report content:** Generated forensic reports (HTML/PDF)
- **Audit trail:** Local chain-of-custody logs and hash manifests

### 5.2 What Data Goes to the Admin Portal

Only operational metadata, never forensic content:

| Data | Purpose | Endpoint |
|------|---------|----------|
| License key | Identity + authorization | All public endpoints |
| Hardware fingerprint | Machine binding (SHA256 hash, not raw hardware IDs) | activate, validate, heartbeat |
| Machine name | Admin visibility ("CYBER-LAB-01") | activate |
| OS info | Version compatibility tracking | activate, heartbeat |
| App version | Update targeting + version analytics | activate, validate, heartbeat |
| Aggregate counts | Usage analytics (cases_created, acquisitions, reports_generated) | heartbeat |
| User email | Contact info for license holder | activate, trial-request |
| IP address | Rate limiting only; discarded after use (not stored long-term in analytics) | All requests |

### 5.3 What Data Is in GitHub

- Source code (desktop app + admin portal)
- CI/CD workflow definitions
- Documentation and specifications
- **No secrets** -- all secrets are in environment variables or GitHub Secrets

### 5.4 What Secrets Exist Where

| Secret | Location | Purpose | Compromise Impact |
|--------|----------|---------|-------------------|
| `CCF_HMAC_SECRET` | Hostinger .env + desktop app binary | License key generation + validation | **CRITICAL:** Unlimited license generation |
| `JWT_SECRET` | Hostinger .env | Admin portal access token signing | Admin portal takeover |
| `JWT_REFRESH_SECRET` | Hostinger .env | Refresh token signing | Persistent admin sessions |
| Minisign private key | Developer machine only | Signing update binaries | Malicious update distribution |
| Minisign public key | Embedded in `tauri.conf.json` | Verifying update signatures | N/A (public) |
| `DATABASE_URL` | Hostinger .env | MySQL connection | Full database access |
| `HOSTINGER_SSH_KEY` | GitHub Secrets | CI/CD deployment | Server access |
| `HOSTINGER_HOST` | GitHub Secrets | Server address | Deployment targeting |
| `HOSTINGER_USER` | GitHub Secrets | SSH username | SSH access |

---

## 6. API Surface Reference

### 6.1 Public API (Desktop App Endpoints)

These endpoints are called by the Rust desktop app via `reqwest`. They do NOT require JWT authentication -- they use license key + hardware fingerprint for identity.

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/v1/health` | GET | Health check | None |
| `/api/v1/license/activate` | POST | Bind license to machine | 10/hour |
| `/api/v1/license/validate` | POST | Check license validity | 30/min |
| `/api/v1/license/deactivate` | POST | Release activation slot | 30/min |
| `/api/v1/heartbeat` | POST | Usage stats + get announcements | 30/min |
| `/api/v1/update-check` | GET | Check for app updates (Tauri format) | 30/min |
| `/api/v1/announcements` | GET | Fetch active announcements | 30/min |
| `/api/v1/trial-request` | POST | Submit trial request | 30/min |
| `/api/v1/trial-request-status` | GET | Check trial request status | 30/min |
| `/api/v1/support/create-ticket` | POST | Submit support ticket | 30/min |
| `/api/v1/support/ticket-status` | GET | Check ticket status | 30/min |
| `/api/v1/support/ticket-details` | GET | Get ticket with messages | 30/min |
| `/api/v1/support/reply-ticket` | POST | Add message to ticket | 30/min |

**Response format contract** (all public endpoints except update-check and heartbeat):
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "message": "Human-readable message"
}
```

**Heartbeat response format** (distinct -- matches Rust `HeartbeatResponse`):
```json
{
  "success": true,
  "announcements": ["string array of messages"],
  "update_available": null
}
```

**Update-check response format** (Tauri updater JSON, or HTTP 204 if no update):
```json
{
  "version": "2.1.0",
  "notes": "Release notes...",
  "pub_date": "2026-03-28T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "minisign signature string",
      "url": "https://github.com/.../releases/download/v2.1.0/ccf_2.1.0_x64-setup.nsis.zip"
    }
  }
}
```

### 6.2 Legacy PHP Compatibility

The desktop app v1.x called `.php` endpoints on the old `license.cyberchakra.in` server. The admin portal provides transparent URL rewriting so old app versions continue working without an update:

| Old Path | New Path |
|----------|----------|
| `api/activate.php` | `/api/v1/license/activate` |
| `api/validate.php` | `/api/v1/license/validate` |
| `api/deactivate.php` | `/api/v1/license/deactivate` |
| `api/heartbeat.php` | `/api/v1/heartbeat` |
| `api/health.php` | `/api/v1/health` |
| `api/announcements.php` | `/api/v1/announcements` |
| `api/update-check.php` | `/api/v1/update-check` |
| `api/trial-request.php` | `/api/v1/trial-request` |
| `api/trial-request-status.php` | `/api/v1/trial-request-status` |

These rewrites are implemented in two places:
1. `.htaccess` (LiteSpeed/Apache level -- for requests hitting the web server directly)
2. Express `app.post/get` redirect handlers (for requests proxied to Node.js)

### 6.3 Admin API (JWT-Protected)

These endpoints are called by the React SPA frontend. They require a valid JWT in the `Authorization: Bearer <token>` header.

| Endpoint Group | Base Path | Auth | Rate Limit |
|---------------|-----------|------|------------|
| Authentication | `/api/v1/auth/*` | Public (login) / JWT | 5 login/15min |
| Dashboard | `/api/v1/admin/dashboard/*` | JWT | 100/min |
| License Management | `/api/v1/admin/licenses/*` | JWT | 100/min |
| Organization Management | `/api/v1/admin/organizations/*` | JWT | 100/min |
| Release Management | `/api/v1/admin/releases/*` | JWT | 100/min |
| Trial Management | `/api/v1/admin/trials/*` | JWT | 100/min |
| Support Tickets | `/api/v1/admin/tickets/*` | JWT | 100/min |
| Announcements | `/api/v1/admin/announcements/*` | JWT | 100/min |
| Rollout Management | `/api/v1/admin/*` (rollout) | JWT | 100/min |
| Bulk Operations | `/api/v1/admin/bulk/*` | JWT | 100/min |
| Audit Log | `/api/v1/admin/audit/*` | JWT | 100/min |

**Admin roles:** `super_admin`, `admin`, `support`, `viewer` -- enforced by `requireRole()` middleware.

---

## 7. Database Schemas

### 7.1 Desktop App (SQLite + SQLCipher)

The desktop app uses an encrypted SQLite database with 60+ tables. Key tables:

- `users` -- Local user accounts with Argon2 password hashing
- `sessions` -- Active login sessions
- `cases` -- Forensic case records (Section 65B compliance fields)
- `devices` -- Connected Android/iOS devices
- `extractions` -- Acquisition records with SHA256 hashes
- `audit_log` -- Immutable chain-of-custody trail
- `report_jobs` -- Background report generation tasks

This database NEVER leaves the machine. All evidence and case data stays local.

### 7.2 Admin Portal (MySQL 8.x via Prisma)

The admin portal uses MySQL with 22 Prisma models. The schema is defined in `backend/prisma/schema.prisma`.

**Core models:**

| Model | Table | Purpose |
|-------|-------|---------|
| `AdminUser` | `admin_users` | Portal admin accounts (4 roles, bcrypt passwords) |
| `AdminSession` | `admin_sessions` | JWT session tracking with refresh tokens |
| `Organization` | `organizations` | Customer orgs (type, GST, PAN, address) |
| `Contact` | `contacts` | People within orgs (primary, billing, technical, decision maker) |
| `License` | `licenses` | License keys with type/tier/status/expiry/feature flags (JSON) |
| `LicenseActivation` | `license_activations` | Machine bindings (fingerprint, OS, version, timestamps) |
| `LicenseEvent` | `license_events` | Immutable audit trail of all license operations |
| `Heartbeat` | `heartbeats` | Raw usage telemetry from desktop app |
| `Release` | `releases` | Software versions (semver, channel, severity, blocked flag) |
| `ReleaseAsset` | `release_assets` | Per-platform binaries (SHA256, download URL, minisign signature) |
| `Download` | `downloads` | Download tracking |
| `Announcement` | `announcements` | In-app messages with targeting rules (JSON) |
| `SupportTicket` | `support_tickets` | Tickets with threaded messages |
| `TicketMessage` | `ticket_messages` | Individual messages in a ticket thread |
| `AuditLog` | `audit_logs` | Admin action log |
| `Setting` | `settings` | Key-value configuration store |
| `TrialRequest` | `trial_requests` | Trial request lifecycle tracking |
| `RolloutPolicy` | `rollout_policies` | Per-release rollout strategy (immediate/staged/targeted) |
| `RolloutStage` | `rollout_stages` | Individual rollout stages (percentage, org targeting, soak time) |
| `BlockedVersion` | `blocked_versions` | Version blocking with force-update target |

**License key format:** `CCF-XXXX-XXXX-XXXX-XXXX`
- Character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars, excludes I/O/0/1 for readability)
- Last 2 characters are an HMAC-SHA256 checksum of the key body
- Generated by `lib/license-key.ts` using `CCF_HMAC_SECRET`

**License tiers:**

| Tier | Target | Max Activations |
|------|--------|----------------|
| `individual` | Solo examiner | 1 machine |
| `team` | Lab teams (3-10) | 5 machines |
| `enterprise` | Large forensic labs | 25 machines |
| `government` | Law enforcement | 50+ machines |

**License types:** `trial`, `perpetual`, `time_limited`, `organization`

**License statuses:** `issued` -> `active` -> `suspended` / `revoked` / `expired`

---

## 8. CI/CD Pipeline

### 8.1 Continuous Integration (`ci.yml`)

Triggered on every push or PR that touches `docs/admin-portal/**`.

```
Push/PR to admin-portal/
         |
         v
+-------------------+     +-------------------+
| lint-and-typecheck |     | security-audit    |
| (parallel job)     |     | (parallel job)    |
+-------------------+     +-------------------+
         |                          |
  1. npm ci (frontend)       1. npm audit --production
  2. npm ci (backend)           (frontend)
  3. prisma generate         2. npm audit --production
  4. tsc --noEmit (frontend)    (backend)
  5. tsc --noEmit (backend)
  6. npm run build (frontend)
  7. npm run build (backend)
```

### 8.2 Deployment (`deploy.yml`)

Manually triggered via GitHub Actions UI (`workflow_dispatch`). Supports `production` and `staging` environments.

```
Manual trigger (choose environment)
         |
         v
1. Checkout code
2. Setup Node.js 20
3. npm ci (frontend + backend)
4. prisma generate
5. Build frontend (Vite)
6. Build backend (TypeScript)
7. Package deployment artifacts:
   deploy/
     public_html/        <-- frontend/dist/ + .htaccess
     backend/            <-- backend/dist/ + node_modules + prisma + package.json
8. SCP upload to Hostinger   (appleboy/scp-action)
9. SSH into server:          (appleboy/ssh-action)
   - cd ~/backend
   - npx prisma db push --accept-data-loss=false
   - echo "Deployment complete"
```

**Required GitHub Secrets:**
- `HOSTINGER_HOST` -- Server IP
- `HOSTINGER_USER` -- SSH username
- `HOSTINGER_SSH_KEY` -- Ed25519 private key (no passphrase)

### 8.3 Desktop App Build and Release

```
Developer tags a release (e.g., v2.1.0)
         |
         v
1. npm install
2. npm run tauri build
3. Sign binaries with minisign private key
4. Upload to GitHub Releases:
   - .msi / NSIS installer (Windows)
   - .AppImage / .deb (Linux)
   - .sig files (minisign signatures)
5. Admin creates Release record in portal
   with download URLs pointing to GitHub Releases
```

---

## 9. Deployment Topology

### 9.1 Production Layout on Hostinger

```
Hostinger VPS (admin.cyberchakra.in)
|
|-- Let's Encrypt SSL (auto-renewed)
|-- LiteSpeed Web Server
|     |
|     |-- public_html/
|     |     |-- index.html          (React SPA entry point)
|     |     |-- assets/             (Vite-built JS/CSS chunks)
|     |     |-- .htaccess           (rewrites + API proxy + SPA fallback)
|     |
|     |-- .htaccess rules:
|           1. Legacy .php -> /api/v1/* rewrites
|           2. /api/* -> proxy to http://127.0.0.1:3001/api/*
|           3. Fallback: serve index.html for SPA routes
|
|-- Node.js 20 application
|     |-- ~/backend/
|           |-- dist/index.js       (compiled Express server)
|           |-- node_modules/       (production dependencies)
|           |-- prisma/             (schema + generated client)
|           |-- .env                (production secrets -- NOT in git)
|           |-- Listening on :3001
|
|-- MySQL 8.x
|     |-- Database: ccf_admin (prefixed by Hostinger username)
|     |-- Managed via hPanel or CLI
|
|-- PM2 (process manager)
      |-- Process: ccf-admin-backend
      |-- Auto-restart on crash
      |-- Log rotation
```

### 9.2 Request Routing

```
Internet
   |
   v
admin.cyberchakra.in (DNS -> Hostinger IP)
   |
   v
LiteSpeed (port 443, SSL terminated)
   |
   |-- Request path starts with /api/ ?
   |     YES --> Proxy to http://127.0.0.1:3001/api/...
   |               --> Express handles it
   |     NO  --> Does file exist on disk?
   |               YES --> Serve static file (JS, CSS, images)
   |               NO  --> Serve index.html (React Router handles route)
```

### 9.3 Local Development Setup

```
Developer Machine
|
|-- Docker: MySQL 8.0 on port 3306  (docker-compose.yml)
|
|-- Vite Dev Server on port 5173    (frontend hot reload)
|     |-- Proxies /api/* to :3001
|
|-- Express Dev Server on port 3001 (backend with ts-node/nodemon)
|     |-- Prisma client auto-generated
|     |-- .env loaded via dotenv
```

---

## 10. Background Jobs and Scheduled Tasks

The admin portal runs five scheduled tasks via `setInterval` inside the Express process:

| Task | Interval | Purpose |
|------|----------|---------|
| `cleanupExpiredSessions` | Every 1 hour | Remove expired JWT refresh tokens from `admin_sessions` |
| `cleanupOldHeartbeats` | Every 1 hour | Delete heartbeat records older than 90 days |
| `aggregateDailyAnalytics` | Every 6 hours | Pre-compute daily analytics summaries for the dashboard |
| `checkLicenseExpiry` | Every 24 hours | Mark licenses with `valid_until < now` as `expired` |
| `detectStaleActivations` | Every 24 hours | Flag activations with no heartbeat in 30+ days |

**Note:** `checkLicenseExpiry` also runs once immediately on server startup to catch any licenses that expired while the server was down.

Additionally, the Hostinger cron system (configured via hPanel) can run standalone scripts:

| Cron Script | Schedule | Purpose |
|-------------|----------|---------|
| `check-license-expiry.js` | Daily 2:00 AM | Same as above, but runs as a separate process |
| `cleanup-sessions.js` | Every 6 hours | Session cleanup |
| `aggregate-analytics.js` | Daily 3:00 AM | Analytics aggregation |

---

## 11. Failure Modes and Resilience

### 11.1 Admin Portal Down

**Impact on desktop app:** Minimal for existing users.
- License validation: App falls back to offline mode using cached validation token. Works for up to **30 days** (`OFFLINE_GRACE_PERIOD_DAYS = 30`) without server contact.
- Heartbeat: Silently fails; no user-facing impact.
- Updates: No new update notifications; existing installed version continues working.
- New activations: BLOCKED -- new users cannot activate until portal is restored.
- Trial requests: BLOCKED -- cannot submit or check status.

**Recovery:** Restart Node.js process on Hostinger. Check PM2 logs. Verify MySQL is running.

### 11.2 MySQL Down

**Impact:** Admin portal API returns 500 errors on all database-dependent endpoints.
- Desktop app: Same as "Portal Down" -- falls back to offline mode.
- Admin UI: Dashboard and all management pages fail to load data.

**Recovery:** Restart MySQL via hPanel. Check disk space. Verify connection string in `.env`.

### 11.3 GitHub Down

**Impact on running systems:** None. GitHub is only used for code hosting and CI/CD.
- Desktop app: Continues working normally.
- Admin portal: Continues working normally.
- New builds: Cannot trigger CI/CD or create releases.
- Binary downloads: If release assets reference GitHub Releases URLs and GitHub is down, update downloads fail. Desktop app's update-check will return the URL but the download step will fail. App stays on current version.

### 11.4 DNS Hijacked / MITM Attack

**Impact on updates:** The minisign signature verification in `tauri-plugin-updater` prevents installation of malicious binaries. Even if an attacker intercepts the update-check response and substitutes a malicious download URL, the binary will fail signature verification because the attacker does not possess the minisign private key.

**Impact on license validation:** An attacker could potentially forge license validation responses. Mitigation: the desktop app should verify the HMAC of the validation token. The `CCF_HMAC_SECRET` is embedded in the app binary (not ideal for determined attackers but sufficient for the threat model).

### 11.5 HMAC Secret Compromised

**Impact:** CRITICAL. The attacker can generate unlimited valid license keys.

**Mitigation steps:**
1. Rotate the secret on the server immediately (update `CCF_HMAC_SECRET` in `.env`)
2. Release a new desktop app build with the new secret
3. All existing license keys generated with the old secret become invalid
4. Regenerate and redistribute all license keys (bulk operation via admin portal)
5. The 30-day offline grace period means existing users have time before forced revalidation

### 11.6 Server Load Estimation

At the current scale (< 100 customers), the Hostinger VPS handles all traffic comfortably. Each customer generates approximately:
- 1 activation request (one-time)
- 1 validation request per 30 days
- ~6 heartbeats per day (every 4 hours)
- ~1 update check per day

For 100 customers: ~600 heartbeats/day + ~3 validations/day + ~100 update checks/day = ~703 requests/day, or about 0.5 requests per minute. Well within capacity.

---

## 12. Secrets Inventory

### 12.1 Production Secrets (on Hostinger server in `~/backend/.env`)

```env
DATABASE_URL="mysql://[prefixed_user]:[password]@localhost:3306/[prefixed_db]"
JWT_SECRET="[64-char random hex string]"
JWT_REFRESH_SECRET="[64-char random hex string]"
CCF_HMAC_SECRET="[shared secret with desktop app]"
```

### 12.2 GitHub Secrets (in repository Settings > Secrets)

```
HOSTINGER_HOST     = [server IP address]
HOSTINGER_USER     = [SSH username]
HOSTINGER_SSH_KEY  = [Ed25519 private key, PEM format]
```

### 12.3 Developer Machine Secrets

```
Minisign private key    = [used to sign release binaries]
  (stored locally, never committed, never uploaded)
  Corresponding public key is embedded in tauri.conf.json
```

### 12.4 Generating New Secrets

```bash
# JWT secrets (64-char hex):
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# HMAC secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SSH key for deployment:
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/hostinger_deploy
```

---

## 13. Cost Summary

### Current Infrastructure

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Hostinger VPS | Business/Cloud hosting | ~$10/month |
| MySQL | Included with Hostinger | $0 |
| GitHub | Free (public repo) or $4/user (private) | $0-4/month |
| Domain (`cyberchakra.in`) | Annual | ~$1/month (amortized) |
| SSL (Let's Encrypt) | Free | $0 |
| Code signing certificate | Annual ($300-500) | ~$30-40/month (amortized) |
| **Total** | | **~$40-55/month** |

### Future Considerations

| Service | When Needed | Est. Cost |
|---------|-------------|-----------|
| AWS Mumbai (data residency) | Government customers | +$50-100/month |
| CDN (Cloudflare/BunnyCDN) | 100+ customers, binary downloads | +$5-20/month |
| SendGrid/AWS SES (email) | Email notifications at scale | +$10-20/month |
| Dedicated server upgrade | 500+ customers | +$40-80/month |

---

## 14. Scaling Path

### Phase 1: 1-100 Customers (Current)

- Hostinger VPS handles all traffic
- MySQL on same server
- GitHub Releases for binary hosting
- Manual release management
- Estimated load: < 1 request/minute

### Phase 2: 100-500 Customers

- Add Cloudflare CDN in front of Hostinger for static asset caching
- Move binary downloads to a CDN (BunnyCDN or Cloudflare R2) instead of GitHub Releases
- Upgrade Hostinger plan for more RAM/CPU
- Add Redis for rate limiting (currently in-memory via `express-rate-limit`)
- Consider read replica for MySQL if analytics queries slow down the API
- Estimated load: ~5 requests/minute

### Phase 3: 500+ Customers

- Migrate to dedicated cloud infrastructure (AWS Mumbai for Indian data residency)
- Separate API server from database server
- Add proper job queue (BullMQ/Redis) for background tasks instead of `setInterval`
- Implement connection pooling (PgBouncer if migrating to PostgreSQL)
- Add APM monitoring (Datadog, New Relic, or self-hosted)
- Consider horizontal scaling with load balancer
- Estimated load: ~25+ requests/minute

---

## 15. Developer Quickstart

### Setting Up the Admin Portal Locally

```bash
# 1. Navigate to the admin portal
cd docs/admin-portal

# 2. Copy environment files
cp .env.example .env
cp .env.example backend/.env
cp .env.example frontend/.env

# 3. Start MySQL (Docker)
docker compose up -d

# 4. Install dependencies
npm run install:all

# 5. Push Prisma schema to create tables
npm run db:push

# 6. Seed the default admin account
npm run db:seed

# 7. Start development servers (frontend :5173 + backend :3001)
npm run dev

# 8. Open http://localhost:5173
# Login: admin@cyberchakra.in / ChangeMe123!
```

### Setting Up the Desktop App Locally

```bash
# Prerequisites: Rust, Node.js 20+, system deps (see CLAUDE.md)

# 1. Install dependencies
npm install

# 2. Run in development mode
npm run tauri dev

# 3. Build for production
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/ (Windows)
#         src-tauri/target/release/bundle/appimage/ (Linux)
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Desktop app config (updater endpoint, pubkey, bundle settings) |
| `src-tauri/src/licensing/mod.rs` | License data structures and constants |
| `src-tauri/src/licensing/validation.rs` | License activation/validation logic (Rust client side) |
| `src-tauri/src/licensing/fingerprint.rs` | Hardware fingerprint generation |
| `src-tauri/src/licensing/offline.rs` | Offline grace period logic |
| `docs/admin-portal/backend/prisma/schema.prisma` | Admin portal database schema |
| `docs/admin-portal/backend/src/routes/license.public.routes.ts` | Desktop app API endpoints |
| `docs/admin-portal/backend/src/services/rollout.ts` | Staged rollout engine |
| `docs/admin-portal/backend/src/lib/license-key.ts` | License key generation + HMAC validation |
| `docs/admin-portal/backend/src/cron/index.ts` | Background scheduled tasks |
| `docs/admin-portal/.htaccess` | URL rewriting + API proxy + SPA fallback |
| `docs/admin-portal/.github/workflows/deploy.yml` | Deployment pipeline |

### How to Deploy a New Admin Portal Version

1. Merge your PR to the main branch.
2. Go to **GitHub Actions > Deploy to Hostinger > Run workflow**.
3. Select environment (`production` or `staging`).
4. Wait for the workflow to complete (~3-5 minutes).
5. Verify: `curl https://admin.cyberchakra.in/api/v1/health`

### How to Release a New Desktop App Version

1. Update version in `src-tauri/tauri.conf.json` and `Cargo.toml`.
2. Build: `npm run tauri build`
3. Sign the binary with minisign: `minisign -Sm target/release/bundle/nsis/*.zip`
4. Create a GitHub Release with the tag (e.g., `v2.1.0`).
5. Upload the installer + `.sig` file to the release.
6. In the admin portal, create a new Release record:
   - Version: `2.1.0`
   - Channel: `stable`
   - Upload asset with the GitHub download URL + signature.
7. (Optional) Configure a rollout policy (staged: 10% -> 50% -> 100%).
8. Publish the release.
9. Desktop apps will discover the update on their next update-check.

---

## Appendix A: Sequence Diagram Summary

```
Developer ---- git push ----> GitHub ---- CI ----> Build + Test
                                |
                          Tag release
                                |
                                v
                         GitHub Releases
                         (binaries + sigs)
                                |
                       Admin creates Release
                         record in portal
                                |
                                v
                         Admin Portal (MySQL)
                         stores release metadata
                         + download URLs
                                |
                                v
Desktop App ---- GET /update-check ----> Admin Portal
      |                                       |
      |    <---- Tauri JSON + download URL ---+
      |
      +---- Download binary from GitHub Releases
      |
      +---- Verify minisign signature
      |
      +---- Install update
```

## Appendix B: Environment-Specific Configuration

| Setting | Development | Production |
|---------|------------|------------|
| `DATABASE_URL` | `mysql://root:password@localhost:3306/ccf_admin` | `mysql://[user]:[pass]@localhost:3306/[db]` |
| `JWT_SECRET` | `change-this-...` | 64-char random hex |
| `CCF_HMAC_SECRET` | `must-match-desktop-app` | Production shared secret |
| `PORT` | `3001` | `3001` |
| `CORS_ORIGIN` | `http://localhost:5173` | `https://admin.cyberchakra.in` |
| `NODE_ENV` | `development` | `production` |
| `VITE_API_URL` | `http://localhost:3001` | `https://admin.cyberchakra.in` |
| Update endpoint (Tauri) | N/A | `https://license.cyberchakra.in/api/update-check.php?...` |

## Appendix C: Related Documentation

| Document | Location | Description |
|----------|----------|-------------|
| Admin Portal README | `docs/admin-portal/README.md` | Quick start, scripts, env vars |
| Hostinger Deploy Guide | `docs/admin-portal/hostinger-deploy.md` | Step-by-step server deployment |
| CI/CD Deployment Guide | `docs/admin-portal/.github/DEPLOYMENT.md` | GitHub Secrets setup, rollback |
| Master Plan | `docs/admin-portal/specs/MASTER_PLAN.md` | Full architecture proposal + roadmap |
| Migration Strategy | `docs/admin-portal/specs/MIGRATION_STRATEGY.md` | PHP-to-Node.js migration plan |
| Database Schema (SQL) | `docs/admin-portal/specs/001_database_schema.sql` | Full SQL DDL |
| API Specification | `docs/admin-portal/specs/002_api_specification.yaml` | OpenAPI spec |
| Analytics Dashboard Spec | `docs/admin-portal/specs/ANALYTICS_DASHBOARD_SPEC.md` | Analytics features |
| UI/UX Design Spec | `docs/ADMIN_PORTAL_UI_UX_DESIGN.md` | Portal design system |
| Desktop App Architecture | `docs/SYSTEM_ARCHITECTURE.md` | Desktop app internals |
| Release Guide | `docs/RELEASE_GUIDE.md` | Building + signing + distributing |
| Security Audit | `docs/SECURITY_AUDIT_REPORT.md` | Security findings |
