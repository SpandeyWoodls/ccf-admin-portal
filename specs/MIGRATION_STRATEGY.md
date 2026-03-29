# License Server Migration Strategy
# PHP (license.cyberchakra.in) -> Admin Portal (admin.cyberchakra.in)

**Date:** 2026-03-28
**Author:** Agent 13 (License Server Migration Researcher)
**Status:** Proposed

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Zero-Downtime Migration Plan](#2-zero-downtime-migration-plan)
3. [API Compatibility Layer](#3-api-compatibility-layer)
4. [Data Migration](#4-data-migration)
5. [URL Transition Strategy](#5-url-transition-strategy)
6. [Rollback Plan](#6-rollback-plan)
7. [Desktop App Update Coordination](#7-desktop-app-update-coordination)
8. [Testing Strategy](#8-testing-strategy)
9. [Runbook: Cutover Day](#9-runbook-cutover-day)

---

## 1. Architecture Overview

### Current State

```
Desktop App (Rust/reqwest)
    |
    | POST https://license.cyberchakra.in/api/activate.php
    | POST https://license.cyberchakra.in/api/validate.php
    | POST https://license.cyberchakra.in/api/deactivate.php
    | POST https://license.cyberchakra.in/api/heartbeat.php
    | GET  https://license.cyberchakra.in/api/update-check.php
    | GET  https://license.cyberchakra.in/api/announcements.php
    | GET  https://license.cyberchakra.in/api/health.php
    |
    v
PHP Server (license.cyberchakra.in)
    |
    v
MySQL/SQLite (PHP server's DB)
```

### Target State

```
Desktop App (Rust/reqwest)
    |
    | POST https://admin.cyberchakra.in/api/public/v1/license/activate
    | POST https://admin.cyberchakra.in/api/public/v1/license/validate
    | POST https://admin.cyberchakra.in/api/public/v1/license/deactivate
    | POST https://admin.cyberchakra.in/api/public/v1/heartbeat
    | POST https://admin.cyberchakra.in/api/public/v1/update-check
    | GET  https://admin.cyberchakra.in/api/public/v1/announcements
    |
    v
Next.js Admin Portal (admin.cyberchakra.in / Vercel)
    |
    v
PostgreSQL (Neon)
```

### Transition State (During Migration)

```
Desktop App (Rust/reqwest)
    |
    | POST https://license.cyberchakra.in/api/activate.php
    |
    v
Nginx/LiteSpeed Reverse Proxy (license.cyberchakra.in)
    |
    | Rewrite: /api/activate.php -> /api/public/v1/license/activate
    |
    v
Next.js Admin Portal (admin.cyberchakra.in)
    |
    v
Compatibility Middleware (transforms responses to PHP format)
    |
    v
PostgreSQL (Neon)
```

---

## 2. Zero-Downtime Migration Plan

### Phase 1: Deploy New Portal Alongside PHP Server (Week 1-2)

**Goal:** New portal is running and serving admin dashboard, but NOT handling desktop app traffic.

**Steps:**

1. Deploy admin portal to `admin.cyberchakra.in` on Vercel
2. Run database schema (`001_database_schema.sql`) on Neon PostgreSQL
3. Set up admin auth (Clerk), verify admin login works
4. Implement the public API endpoints that mirror PHP behavior (see Section 3)
5. Run the data migration (see Section 4) to populate PostgreSQL from PHP DB

**Verification:**
- Admin can log in to `admin.cyberchakra.in`
- All public API endpoints return correct JSON when tested manually
- No desktop app traffic touches the new portal yet

### Phase 2: Compatibility Proxy Layer (Week 3)

**Goal:** Route desktop app traffic through the new portal via a proxy, with the PHP server as fallback.

**Option A: Nginx Reverse Proxy on license.cyberchakra.in (RECOMMENDED)**

Add these rewrite rules to the Nginx config on the server hosting `license.cyberchakra.in`:

```nginx
# /etc/nginx/sites-available/license.cyberchakra.in

upstream new_portal {
    server admin.cyberchakra.in:443;
}

upstream php_fallback {
    server 127.0.0.1:9000;  # PHP-FPM
}

server {
    listen 443 ssl;
    server_name license.cyberchakra.in;

    # SSL config...

    # === PHASE 2A: Shadow traffic (log comparison, no switching) ===
    # Mirror requests to new portal for response comparison
    # (uses nginx mirror module)

    # === PHASE 2B: Progressive cutover ===
    # Route percentage of traffic to new portal

    # Compatibility proxy: rewrite .php paths to new API paths
    # and wrap responses in the ServerResponse format

    # activate.php -> new portal
    location = /api/activate.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/license/activate;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;

        # Fallback to PHP if new portal is down
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_activate_fallback;
    }

    location @php_activate_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/activate.php;
    }

    # validate.php -> new portal
    location = /api/validate.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/license/validate;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_validate_fallback;
    }

    location @php_validate_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/validate.php;
    }

    # deactivate.php -> new portal
    location = /api/deactivate.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/license/deactivate;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_deactivate_fallback;
    }

    location @php_deactivate_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/deactivate.php;
    }

    # heartbeat.php -> new portal
    location = /api/heartbeat.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/heartbeat;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_heartbeat_fallback;
    }

    location @php_heartbeat_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/heartbeat.php;
    }

    # update-check.php -> new portal
    location = /api/update-check.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/update-check;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_update_fallback;
    }

    location @php_update_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/update-check.php;
    }

    # announcements.php -> new portal
    location = /api/announcements.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/announcements;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;
        error_page 502 503 504 = @php_announcements_fallback;
    }

    location @php_announcements_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/announcements.php;
    }

    # health.php -> new portal health endpoint
    location = /api/health.php {
        proxy_pass https://admin.cyberchakra.in/api/compat/v1/health;
        proxy_set_header Host admin.cyberchakra.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_intercept_errors on;

        # If new portal is down, return 200 from PHP as health check
        error_page 502 503 504 = @php_health_fallback;
    }

    location @php_health_fallback {
        fastcgi_pass php_fallback;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /var/www/html/api/health.php;
    }
}
```

**Option B: If Using LiteSpeed (Hostinger)**

Add `.htaccess` rewrite rules at `/api/`:

```apache
# /var/www/html/api/.htaccess

RewriteEngine On

# Phase 2: Proxy to new portal
RewriteCond %{REQUEST_URI} ^/api/activate\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/license/activate [P,L]

RewriteCond %{REQUEST_URI} ^/api/validate\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/license/validate [P,L]

RewriteCond %{REQUEST_URI} ^/api/deactivate\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/license/deactivate [P,L]

RewriteCond %{REQUEST_URI} ^/api/heartbeat\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/heartbeat [P,L]

RewriteCond %{REQUEST_URI} ^/api/update-check\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/update-check [P,L]

RewriteCond %{REQUEST_URI} ^/api/announcements\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/announcements [P,L]

RewriteCond %{REQUEST_URI} ^/api/health\.php$ [NC]
RewriteRule ^(.*)$ https://admin.cyberchakra.in/api/compat/v1/health [P,L]
```

### Phase 3: Update Desktop App to Use New Endpoints (Week 5-6)

**Goal:** Desktop app points directly to admin portal, removing proxy dependency.

This requires a desktop app update. Change `LicenseServerConfig::default()` to use the new URL:

```rust
// src-tauri/src/licensing/mod.rs
impl Default for LicenseServerConfig {
    fn default() -> Self {
        Self {
            base_url: "https://admin.cyberchakra.in/api/public/v1".to_string(),
            api_key: None,
        }
    }
}
```

And update all endpoint URL constructions:

```rust
// In validation.rs:
// Old: format!("{}/activate.php", config.base_url)
// New: format!("{}/license/activate", config.base_url)

// Old: format!("{}/validate.php", config.base_url)
// New: format!("{}/license/validate", config.base_url)

// Old: format!("{}/deactivate.php", config.base_url)
// New: format!("{}/license/deactivate", config.base_url)

// In offline.rs:
// Old: format!("{}/health.php", config.base_url)
// New: format!("{}/health", config.base_url)

// In commands/license.rs:
// Old: format!("{}/announcements.php", config.base_url)
// New: format!("{}/announcements", config.base_url)
```

**Keep backward compatibility:** The new portal should continue to serve both:
- `/api/compat/v1/...` (compatibility routes with PHP response format)
- `/api/public/v1/...` (clean new API format)

This allows older desktop app versions that haven't updated to continue working via the proxy.

### Phase 4: Decommission PHP Server (Week 8+)

**Prerequisites (ALL must be true):**
- [ ] 100% of traffic flowing through new portal for at least 14 days
- [ ] Zero errors in new portal logs related to license operations
- [ ] All active desktop app users have validated at least once through new portal
- [ ] PHP server access logs show zero direct hits (all proxied)
- [ ] New desktop app version with direct admin.cyberchakra.in URLs released
- [ ] At least 70% of active users on the new desktop app version

**Steps:**
1. Stop accepting new traffic on PHP server
2. Export final database snapshot from PHP as archive
3. Keep PHP server running in read-only mode for 30 more days (matches offline grace period)
4. After 30 days, take PHP server down
5. Keep DNS record for `license.cyberchakra.in` pointing to a static page explaining the migration

---

## 3. API Compatibility Layer

### The Critical Constraint

The desktop app's Rust code deserializes server responses using these exact structs:

```rust
// From src-tauri/src/licensing/mod.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerResponse {
    pub success: bool,
    pub data: Option<ServerResponseData>,
    pub error: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerResponseData {
    pub license_id: Option<i64>,
    pub organization: Option<String>,
    pub expires_at: Option<String>,
    pub validation_token: Option<String>,
    pub next_validation: Option<String>,
    pub valid: Option<bool>,
    #[serde(default)]
    pub announcements: Vec<Announcement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Announcement {
    pub message: String,
    pub announcement_type: String,  // "info", "warning", "critical"
}
```

### Serde Behavior Analysis

Understanding how Rust's `serde_json` handles response variations is critical:

| Scenario | Serde Behavior | Risk |
|----------|---------------|------|
| Extra unknown field in JSON | **Silently ignored** by default (no `#[serde(deny_unknown_fields)]`) | SAFE - new portal can add extra fields |
| Missing `success` field | **Deserialization FAILS** (`success: bool` is required) | CRITICAL - must always include |
| Missing `data` field | OK - it's `Option<ServerResponseData>` | SAFE |
| Missing `error` field | OK - it's `Option<String>` | SAFE |
| Missing `message` field | OK - it's `Option<String>` | SAFE |
| `data.announcements` missing | OK - has `#[serde(default)]` so defaults to `Vec::new()` | SAFE |
| `data.license_id` is UUID string instead of i64 | **Deserialization FAILS** - type mismatch | CRITICAL - must be integer or null |
| `data.expires_at` is date object instead of string | **Deserialization FAILS** | CRITICAL - must be string |
| `data.valid` is 1/0 instead of true/false | **Deserialization FAILS** - JSON bool expected | CRITICAL |
| `null` vs missing field | Both work for Option fields | SAFE |
| Empty string `""` for Option<String> | Deserializes to `Some("")` not `None` | CAUTION - behavior differs |

### Compatibility Routes Implementation

The new portal needs a `/api/compat/v1/` route group that wraps the new API in the old `ServerResponse` format.

#### Activation Compatibility Route

```typescript
// app/api/compat/v1/license/activate/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // The desktop app sends ActivationRequest format:
    // {
    //   "license_key": "CCF-XXXX-XXXX-XXXX-XXXX",
    //   "hardware_fingerprint": "sha256_hash",
    //   "user_email": "user@example.com",
    //   "machine_name": "DESKTOP-ABC",
    //   "os_info": "Windows 11...",
    //   "app_version": "2.1.0"
    // }

    // Map to new API field names
    const newApiBody = {
      license_key: body.license_key,
      machine_id: body.hardware_fingerprint, // field rename
      machine_name: body.machine_name,
      os_info: body.os_info,
      app_version: body.app_version,
      // user_email is stored separately in new schema
    };

    // Call the actual new portal logic
    const result = await activateLicense(newApiBody, body.user_email);

    if (!result.success) {
      // Return PHP-compatible error format
      return NextResponse.json({
        success: false,
        data: null,
        error: result.errorCode,
        message: result.message,
      });
    }

    // Return PHP-compatible success format
    // CRITICAL: data.license_id MUST be an integer, not UUID
    return NextResponse.json({
      success: true,
      data: {
        license_id: result.numericId,           // integer, not UUID
        organization: result.organizationName,
        expires_at: result.expiresAt,           // string or null
        validation_token: result.validationToken,
        next_validation: result.nextValidation, // RFC3339 string
        valid: true,
        announcements: result.announcements.map(a => ({
          message: a.body || a.title,           // flatten to message string
          announcement_type: a.announcement_type,
        })),
      },
      error: null,
      message: "License activated successfully",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      data: null,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    }, { status: 500 });
  }
}
```

#### Validation Compatibility Route

```typescript
// app/api/compat/v1/license/validate/route.ts

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Desktop app sends ValidationRequest:
  // {
  //   "license_key": "CCF-XXXX-XXXX-XXXX-XXXX",
  //   "hardware_fingerprint": "sha256_hash",
  //   "app_version": "2.1.0"
  // }

  const result = await validateLicense({
    license_key: body.license_key,
    machine_id: body.hardware_fingerprint,
    app_version: body.app_version,
  });

  return NextResponse.json({
    success: result.valid,
    data: {
      license_id: result.numericId,
      organization: result.organizationName,
      expires_at: result.expiresAt,
      validation_token: generateValidationToken(
        body.license_key,
        body.hardware_fingerprint,
        result.expiresAt
      ),
      next_validation: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      valid: result.valid,
      announcements: [],
    },
    error: result.valid ? null : result.errorCode,
    message: result.message,
  });
}
```

#### Deactivation Compatibility Route

```typescript
// app/api/compat/v1/license/deactivate/route.ts

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Desktop app sends:
  // {
  //   "license_key": "CCF-XXXX-XXXX-XXXX-XXXX",
  //   "hardware_fingerprint": "sha256_hash"
  // }

  const result = await deactivateLicense({
    license_key: body.license_key,
    machine_id: body.hardware_fingerprint,
  });

  return NextResponse.json({
    success: result.success,
    data: null,
    error: result.success ? null : "DEACTIVATION_FAILED",
    message: result.message,
  });
}
```

#### Health Compatibility Route

```typescript
// app/api/compat/v1/health/route.ts

export async function GET() {
  // The desktop app's check_server_connectivity() just checks
  // response.status().is_success() -- any 200 OK is fine.
  return NextResponse.json({ status: "ok" });
}
```

#### Announcements Compatibility Route

```typescript
// app/api/compat/v1/announcements/route.ts

export async function GET() {
  const announcements = await getActiveAnnouncements();

  // Desktop app expects:
  // {
  //   "success": true,
  //   "data": {
  //     "announcements": [
  //       { "message": "...", "announcement_type": "info" }
  //     ]
  //   }
  // }

  return NextResponse.json({
    success: true,
    data: {
      announcements: announcements.map(a => ({
        message: a.body || a.title,
        announcement_type: mapAnnouncementType(a.announcement_type),
      })),
    },
  });
}

// Map new portal types to desktop-app-compatible types
function mapAnnouncementType(type: string): string {
  const mapping: Record<string, string> = {
    'info': 'info',
    'warning': 'warning',
    'critical': 'critical',
    'maintenance': 'warning',  // desktop app only knows 3 types
    'feature': 'info',
    'promotion': 'info',
  };
  return mapping[type] || 'info';
}
```

### Exact Request/Response Format Map

| Endpoint | PHP Endpoint | Desktop Sends | Desktop Expects (ServerResponse) |
|----------|-------------|---------------|----------------------------------|
| activate | `POST /api/activate.php` | `ActivationRequest` JSON body | `{ success: bool, data: { license_id: i64, organization: str, expires_at: str?, validation_token: str, next_validation: str, valid: bool?, announcements: [] }, error: str?, message: str? }` |
| validate | `POST /api/validate.php` | `ValidationRequest` JSON body | Same ServerResponse format. `data.valid` = true/false is key. |
| deactivate | `POST /api/deactivate.php` | `{ license_key, hardware_fingerprint }` | `{ success: bool, data: null, error: str?, message: str? }` |
| heartbeat | `POST /api/heartbeat.php` | `HeartbeatRequest` JSON body | `HeartbeatResponse { success: bool, announcements: [str], update_available: UpdateInfo? }` -- NOTE: different struct! |
| announcements | `GET /api/announcements.php` | No body | `{ success: bool, data: { announcements: [{ message, announcement_type }] } }` |
| health | `GET /api/health.php` | No body | Any 2xx response (checked via `is_success()`) |
| update-check | `GET /api/update-check.php` | Query params | Tauri updater JSON format (separate from ServerResponse) |

### Critical Field Type Constraints

| Field | Rust Type | JSON Type | Constraint |
|-------|----------|-----------|------------|
| `success` | `bool` | `true`/`false` | REQUIRED. Cannot be 1/0. |
| `data` | `Option<ServerResponseData>` | object or null | Must be object or absent/null |
| `data.license_id` | `Option<i64>` | integer or null | CANNOT be UUID string. Must convert UUID to numeric. |
| `data.organization` | `Option<String>` | string or null | |
| `data.expires_at` | `Option<String>` | string or null | RFC3339 format string, NOT Date object |
| `data.validation_token` | `Option<String>` | string or null | Base64 encoded token |
| `data.next_validation` | `Option<String>` | string or null | RFC3339 format string |
| `data.valid` | `Option<bool>` | true/false/null | |
| `data.announcements` | `Vec<Announcement>` | array | Defaults to [] if missing |
| `error` | `Option<String>` | string or null | |
| `message` | `Option<String>` | string or null | |

### The license_id Problem

The new portal schema uses UUIDs for `licenses.id`. But the desktop app expects `data.license_id` as `Option<i64>`.

**Solution:** Add a `numeric_id SERIAL` column to the `licenses` table:

```sql
ALTER TABLE licenses ADD COLUMN numeric_id SERIAL;
CREATE UNIQUE INDEX idx_licenses_numeric_id ON licenses (numeric_id);
```

The compatibility layer returns `numeric_id` instead of the UUID `id`.

---

## 4. Data Migration

### Step 1: Export from PHP Server Database

First, determine the PHP server's database structure. Connect to it and export:

```bash
# SSH into the PHP server
ssh user@license.cyberchakra.in

# If MySQL:
mysqldump -u root -p license_db \
  --single-transaction \
  --routines \
  --triggers \
  --complete-insert \
  > /tmp/php_license_export_$(date +%Y%m%d).sql

# Also export as CSV for clean import:
mysql -u root -p license_db -e "
  SELECT
    license_key,
    hardware_fingerprint,
    user_email,
    organization,
    activated_at,
    expires_at,
    is_active,
    created_at
  FROM licenses
" --batch --raw > /tmp/licenses_export.tsv

mysql -u root -p license_db -e "
  SELECT
    license_key,
    hardware_fingerprint,
    machine_name,
    os_info,
    app_version,
    ip_address,
    activated_at,
    last_heartbeat,
    is_active
  FROM activations
" --batch --raw > /tmp/activations_export.tsv
```

### Step 2: Transform and Import to PostgreSQL

```sql
-- Run this on the Neon PostgreSQL database

-- Step 2a: Create temporary staging tables
CREATE TEMP TABLE staging_licenses (
    old_id          INTEGER,
    license_key     TEXT NOT NULL,
    user_email      TEXT,
    organization    TEXT,
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ
);

CREATE TEMP TABLE staging_activations (
    license_key         TEXT NOT NULL,
    hardware_fingerprint TEXT NOT NULL,
    machine_name        TEXT,
    os_info             TEXT,
    app_version         TEXT,
    ip_address          TEXT,
    activated_at        TIMESTAMPTZ,
    last_heartbeat      TIMESTAMPTZ,
    is_active           BOOLEAN DEFAULT TRUE
);

-- Step 2b: Import CSV/TSV data (via psql \copy or COPY command)
-- Adjust format based on actual PHP database export

\copy staging_licenses FROM '/tmp/licenses_export.tsv' WITH (FORMAT text, HEADER true)
\copy staging_activations FROM '/tmp/activations_export.tsv' WITH (FORMAT text, HEADER true)

-- Step 2c: Create organizations from unique organization names
INSERT INTO organizations (name, slug, org_type, status)
SELECT DISTINCT
    COALESCE(organization, 'Unknown Organization'),
    lower(regexp_replace(COALESCE(organization, 'unknown'), '[^a-zA-Z0-9]+', '-', 'g')),
    'other',
    'active'
FROM staging_licenses
WHERE organization IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

-- Step 2d: Create contacts from unique emails
INSERT INTO contacts (organization_id, first_name, last_name, email, role)
SELECT DISTINCT
    o.id,
    split_part(sl.user_email, '@', 1),
    '',
    sl.user_email,
    'primary'
FROM staging_licenses sl
JOIN organizations o ON o.name = COALESCE(sl.organization, 'Unknown Organization')
WHERE sl.user_email IS NOT NULL
ON CONFLICT (email, organization_id) DO NOTHING;

-- Step 2e: Import licenses
INSERT INTO licenses (
    organization_id,
    contact_id,
    license_key,
    license_type,
    status,
    issued_at,
    activated_at,
    expires_at,
    max_activations,
    current_activations
)
SELECT
    o.id,
    c.id,
    sl.license_key,
    CASE
        WHEN sl.license_key LIKE 'CCF-TRIAL-%' THEN 'trial'::license_type
        ELSE 'standard'::license_type
    END,
    CASE
        WHEN NOT sl.is_active THEN 'suspended'::license_status
        WHEN sl.expires_at IS NOT NULL AND sl.expires_at < NOW() THEN 'expired'::license_status
        WHEN sl.activated_at IS NOT NULL THEN 'active'::license_status
        ELSE 'pending_activation'::license_status
    END,
    COALESCE(sl.created_at, NOW()),
    sl.activated_at,
    sl.expires_at,
    1,
    CASE WHEN sl.is_active AND sl.activated_at IS NOT NULL THEN 1 ELSE 0 END
FROM staging_licenses sl
LEFT JOIN organizations o ON o.name = COALESCE(sl.organization, 'Unknown Organization')
LEFT JOIN contacts c ON c.email = sl.user_email AND c.organization_id = o.id
ON CONFLICT (license_key) DO UPDATE SET
    status = EXCLUDED.status,
    activated_at = EXCLUDED.activated_at;

-- Step 2f: Import activations
INSERT INTO license_activations (
    license_id,
    machine_id,
    machine_name,
    os_info,
    app_version,
    ip_address,
    is_active,
    activated_at,
    deactivated_at,
    last_heartbeat
)
SELECT
    l.id,
    sa.hardware_fingerprint,
    sa.machine_name,
    sa.os_info,
    sa.app_version,
    sa.ip_address::inet,
    sa.is_active,
    sa.activated_at,
    CASE WHEN NOT sa.is_active THEN sa.activated_at ELSE NULL END,
    sa.last_heartbeat
FROM staging_activations sa
JOIN licenses l ON l.license_key = sa.license_key
ON CONFLICT (license_id, machine_id) DO UPDATE SET
    last_heartbeat = EXCLUDED.last_heartbeat,
    is_active = EXCLUDED.is_active;

-- Step 2g: Log the migration as a license event
INSERT INTO license_events (license_id, event_type, triggered_by, details)
SELECT
    id,
    'created'::license_event_type,
    'system:php_migration',
    jsonb_build_object('source', 'php_server', 'migration_date', NOW()::text)
FROM licenses;
```

### Step 3: Validate Migration

```sql
-- Verification queries: run AFTER migration

-- Check 1: Row count comparison
SELECT 'staging_licenses' as source, COUNT(*) FROM staging_licenses
UNION ALL
SELECT 'licenses' as source, COUNT(*) FROM licenses
UNION ALL
SELECT 'staging_activations' as source, COUNT(*) FROM staging_activations
UNION ALL
SELECT 'license_activations' as source, COUNT(*) FROM license_activations;

-- Check 2: All license keys migrated
SELECT sl.license_key
FROM staging_licenses sl
LEFT JOIN licenses l ON l.license_key = sl.license_key
WHERE l.id IS NULL;
-- Expected: 0 rows

-- Check 3: All active activations migrated with correct fingerprint
SELECT sa.license_key, sa.hardware_fingerprint
FROM staging_activations sa
LEFT JOIN licenses l ON l.license_key = sa.license_key
LEFT JOIN license_activations la ON la.license_id = l.id AND la.machine_id = sa.hardware_fingerprint
WHERE la.id IS NULL AND sa.is_active = TRUE;
-- Expected: 0 rows

-- Check 4: Expiry dates match
SELECT
    sl.license_key,
    sl.expires_at as old_expires,
    l.expires_at as new_expires,
    sl.expires_at = l.expires_at as matches
FROM staging_licenses sl
JOIN licenses l ON l.license_key = sl.license_key
WHERE sl.expires_at IS NOT NULL AND sl.expires_at != l.expires_at;
-- Expected: 0 rows
```

### What Must Be Preserved

| Data | PHP Column | PostgreSQL Column | Critical? |
|------|-----------|-------------------|-----------|
| License key | `license_key` | `licenses.license_key` | YES - desktop app uses this |
| Hardware fingerprint | `hardware_fingerprint` | `license_activations.machine_id` | YES - license binding |
| Activation timestamp | `activated_at` | `licenses.activated_at` | YES - offline grace calculation |
| Expiry date | `expires_at` | `licenses.expires_at` | YES - license validity |
| Organization name | `organization` | `organizations.name` | YES - displayed in UI |
| User email | `user_email` | `contacts.email` | YES - used in activation |
| Machine name | `machine_name` | `license_activations.machine_name` | NICE TO HAVE |
| OS info | `os_info` | `license_activations.os_info` | NICE TO HAVE |
| Last heartbeat | `last_heartbeat` | `license_activations.last_heartbeat` | YES - activity tracking |

---

## 5. URL Transition Strategy

### Analysis of Options

| Option | Description | Pros | Cons | Risk |
|--------|------------|------|------|------|
| **A: Same domain, versioned paths** | `license.cyberchakra.in/api/v2/...` | No CORS issues, single domain | Requires PHP server to handle routing, couples old and new | Medium |
| **B: New subdomain** | `admin.cyberchakra.in/api/public/v1/...` | Clean separation, independent deployment, independent scaling | Requires desktop app update for direct access, CORS if mixing | Low |
| **C: Same domain, rewrite .php** | `license.cyberchakra.in/api/activate.php` -> proxied | Zero desktop app changes needed | Proxy adds latency, single point of failure at proxy | Medium |

### RECOMMENDED: Option B + C Combined (Belt and Suspenders)

**Phase 2-3:** Use Option C (proxy rewrites) so existing desktop apps work without updates.
**Phase 3+:** Release desktop app update with Option B (direct to `admin.cyberchakra.in`).
**Phase 4:** Remove proxy once most users have updated.

**This is safest because:**
1. No desktop app update required for initial cutover (proxy handles it)
2. New desktop app versions get cleaner, faster direct connections
3. If proxy breaks, the 30-day offline grace period protects users
4. Old and new systems are fully independent (different infrastructure)
5. Rollback is trivial (change proxy target back to PHP)

### DNS Configuration

```
# Current
license.cyberchakra.in  A     <Hostinger PHP server IP>

# Add (do NOT change existing)
admin.cyberchakra.in    CNAME cname.vercel-dns.com

# Phase 2: license.cyberchakra.in stays as-is (proxy on same server)
# Phase 4: license.cyberchakra.in can be pointed to a redirect page
```

### CORS Configuration

The desktop app uses `reqwest` (Rust HTTP client), NOT a browser. Therefore CORS headers are irrelevant for the desktop app API. However, if the admin portal UI ever needs to call these endpoints from a browser:

```typescript
// middleware.ts (Next.js)
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/compat/') ||
      request.nextUrl.pathname.startsWith('/api/public/')) {
    const response = NextResponse.next();
    // No CORS needed for desktop app (reqwest ignores CORS)
    // But add for debugging from browser:
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-License-Key');
    return response;
  }
}
```

---

## 6. Rollback Plan

### Tier 1: Immediate Rollback (< 5 minutes)

**Trigger:** New portal returns errors for >5% of requests, or any activation/validation failure.

**Action:** Change nginx/LiteSpeed proxy target back to PHP:

```bash
# On the license.cyberchakra.in server:

# Option A: Nginx - swap to PHP config
sudo cp /etc/nginx/sites-available/license-php-only.conf \
        /etc/nginx/sites-available/license.cyberchakra.in
sudo nginx -t && sudo systemctl reload nginx

# Option B: LiteSpeed - disable .htaccess rewrites
mv /var/www/html/api/.htaccess /var/www/html/api/.htaccess.disabled
# LiteSpeed picks up .htaccess changes without restart
```

**Pre-requisite:** Keep the PHP server running and its database updated (dual-write, see below).

### Tier 2: DNS-Level Rollback (< 30 minutes)

**Trigger:** Proxy server itself is down.

**Action:** Not needed if using the proxy approach (proxy is on same server as PHP). But if the proxy is on a separate server:

```bash
# Cloudflare DNS API (if using Cloudflare):
curl -X PUT "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "license",
    "content": "<PHP_SERVER_IP>",
    "ttl": 60,
    "proxied": false
  }'
```

### Tier 3: Desktop App Grace Period (30-day safety net)

**Trigger:** Both proxy and DNS rollback fail, or new portal is down for extended period.

**Automatic behavior:** The desktop app has a built-in 30-day offline grace period:
- If the server is unreachable, the app continues working using cached validation
- `OFFLINE_GRACE_PERIOD_DAYS = 30` (in `src-tauri/src/licensing/mod.rs`)
- Users see warnings at 14 days, critical warnings at 7 days
- App blocks only after 30 days of no server contact

**This means:** Even a complete server outage gives you 30 days to fix things before any user is affected.

### Dual-Write Strategy (During Phase 2-3)

To enable instant rollback, both databases must stay in sync:

```
Desktop App -> Proxy -> New Portal -> PostgreSQL
                                   |
                                   +-> Sync job writes to PHP MySQL (every 5 min)
```

Implementation:

```typescript
// lib/sync/dual-write.ts

// After each activation/deactivation in the new portal,
// queue a sync job to update the PHP database
async function syncToPhpDatabase(operation: LicenseOperation) {
  // Use a queue (Vercel KV / Redis) to batch sync
  await redis.lpush('php_sync_queue', JSON.stringify(operation));
}

// Cron job runs every 5 minutes
// app/api/cron/sync-php/route.ts
export async function GET() {
  const operations = await redis.lrange('php_sync_queue', 0, -1);
  if (operations.length === 0) return NextResponse.json({ synced: 0 });

  // Sync each operation to PHP database
  for (const op of operations) {
    const operation = JSON.parse(op);
    await syncOperationToPhp(operation);
  }

  await redis.del('php_sync_queue');
  return NextResponse.json({ synced: operations.length });
}
```

---

## 7. Desktop App Update Coordination

### When Should the Desktop App Switch to New Endpoints?

**Timeline:**

| When | What Changes | Who Is Affected |
|------|-------------|----------------|
| Day 0 (Phase 2 start) | Proxy routes to new portal | All existing users, transparently |
| Week 4 (Phase 3 start) | New app version released with direct `admin.cyberchakra.in` URLs | Only users who update |
| Week 8+ (Phase 4) | Proxy decommissioned | Users who haven't updated still work via offline grace |

### Can We Do It Without a Desktop App Update?

**YES, for the critical path.** The proxy approach (Phase 2) requires zero desktop app changes. The desktop app will continue to call `license.cyberchakra.in/api/activate.php`, and the proxy silently routes to the new portal.

**However, a desktop app update IS recommended for:**
1. Removing dependency on the proxy server
2. Using the cleaner API paths
3. Leveraging new features (enhanced heartbeat, analytics telemetry)
4. Better error messages from new portal

### Recommended Approach

```
Week 1-2: Deploy new portal, migrate data
Week 3:   Enable proxy (zero app changes needed)
Week 4:   Monitor proxy for 7 days, confirm stability
Week 5:   Release desktop app update with new URLs (optional update)
Week 6-7: Most users auto-update, monitor adoption
Week 8:   Decommission PHP server
```

### Desktop App Code Changes for Phase 3

The minimal change is to update `LicenseServerConfig`:

```rust
// src-tauri/src/licensing/mod.rs

pub struct LicenseServerConfig {
    pub base_url: String,
    pub api_key: Option<String>,
}

impl Default for LicenseServerConfig {
    fn default() -> Self {
        Self {
            // NEW: Use admin portal directly
            base_url: "https://admin.cyberchakra.in/api/public/v1".to_string(),
            api_key: None,
        }
    }
}
```

And update the URL construction in `validation.rs`:

```rust
// OLD
let url = format!("{}/activate.php", config.base_url);
// NEW
let url = format!("{}/license/activate", config.base_url);

// OLD
let url = format!("{}/validate.php", config.base_url);
// NEW
let url = format!("{}/license/validate", config.base_url);

// OLD
let url = format!("{}/deactivate.php", config.base_url);
// NEW
let url = format!("{}/license/deactivate", config.base_url);
```

And in `offline.rs`:

```rust
// OLD
let url = format!("{}/health.php", config.base_url);
// NEW
let url = format!("{}/health", config.base_url);
```

And in `commands/license.rs`:

```rust
// OLD
let url = format!("{}/announcements.php", config.base_url);
// NEW
let url = format!("{}/announcements", config.base_url);
```

**Important:** The `ServerResponse` struct does NOT change. The new portal's `/api/public/v1/` endpoints should return the same JSON format as the compatibility layer. This can be the same code internally -- the `/api/compat/v1/` and `/api/public/v1/` routes can share the same handler.

---

## 8. Testing Strategy

### 8.1 Snapshot Tests: PHP vs New Portal Response Comparison

Before cutting over, capture snapshots of every PHP endpoint response and verify the new portal returns byte-compatible JSON.

```bash
#!/bin/bash
# scripts/snapshot-test-migration.sh
# Run this BEFORE enabling the proxy

set -euo pipefail

PHP_BASE="https://license.cyberchakra.in/api"
NEW_BASE="https://admin.cyberchakra.in/api/compat/v1"
TEST_KEY="CCF-TEST-TEST-TEST-TEST"  # Use a dedicated test license
TEST_FP="test_fingerprint_hash_for_migration"

echo "=== Testing activate ==="
PHP_RESP=$(curl -s -X POST "$PHP_BASE/activate.php" \
  -H "Content-Type: application/json" \
  -d "{
    \"license_key\": \"$TEST_KEY\",
    \"hardware_fingerprint\": \"$TEST_FP\",
    \"user_email\": \"test@cyberchakra.in\",
    \"machine_name\": \"MIGRATION-TEST\",
    \"os_info\": \"Test OS\",
    \"app_version\": \"2.0.0\"
  }")

NEW_RESP=$(curl -s -X POST "$NEW_BASE/license/activate" \
  -H "Content-Type: application/json" \
  -d "{
    \"license_key\": \"$TEST_KEY\",
    \"hardware_fingerprint\": \"$TEST_FP\",
    \"user_email\": \"test@cyberchakra.in\",
    \"machine_name\": \"MIGRATION-TEST\",
    \"os_info\": \"Test OS\",
    \"app_version\": \"2.0.0\"
  }")

# Compare JSON structure (not exact values, since timestamps differ)
PHP_KEYS=$(echo "$PHP_RESP" | jq -S 'keys')
NEW_KEYS=$(echo "$NEW_RESP" | jq -S 'keys')

if [ "$PHP_KEYS" = "$NEW_KEYS" ]; then
  echo "  PASS: Top-level keys match"
else
  echo "  FAIL: Top-level keys differ"
  echo "  PHP: $PHP_KEYS"
  echo "  NEW: $NEW_KEYS"
fi

# Check data field structure
PHP_DATA_KEYS=$(echo "$PHP_RESP" | jq -S '.data | keys // empty')
NEW_DATA_KEYS=$(echo "$NEW_RESP" | jq -S '.data | keys // empty')

if [ "$PHP_DATA_KEYS" = "$NEW_DATA_KEYS" ]; then
  echo "  PASS: data field keys match"
else
  echo "  FAIL: data field keys differ"
  echo "  PHP: $PHP_DATA_KEYS"
  echo "  NEW: $NEW_DATA_KEYS"
fi

# Check field types
echo "  PHP success type: $(echo "$PHP_RESP" | jq -r '.success | type')"
echo "  NEW success type: $(echo "$NEW_RESP" | jq -r '.success | type')"
echo "  PHP data.license_id type: $(echo "$PHP_RESP" | jq -r '.data.license_id | type')"
echo "  NEW data.license_id type: $(echo "$NEW_RESP" | jq -r '.data.license_id | type')"

echo ""
echo "=== Testing validate ==="
# Deactivate first, then test validate
# ... (similar pattern for each endpoint)

echo ""
echo "=== Testing health ==="
PHP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$PHP_BASE/health.php")
NEW_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$NEW_BASE/health")
echo "  PHP status: $PHP_HEALTH"
echo "  NEW status: $NEW_HEALTH"

echo ""
echo "=== Testing announcements ==="
PHP_ANN=$(curl -s "$PHP_BASE/announcements.php")
NEW_ANN=$(curl -s "$NEW_BASE/announcements")
echo "  PHP: $(echo "$PHP_ANN" | jq -S 'keys')"
echo "  NEW: $(echo "$NEW_ANN" | jq -S 'keys')"
```

### 8.2 Rust Deserialization Test

Add a test to the desktop app that validates real server responses can deserialize:

```rust
// src-tauri/src/licensing/tests/migration_compat.rs

#[cfg(test)]
mod migration_tests {
    use crate::licensing::{ServerResponse, ServerResponseData, Announcement};

    #[test]
    fn test_new_portal_activate_response_deserializes() {
        // Exact JSON from new portal's compat endpoint
        let json = r#"{
            "success": true,
            "data": {
                "license_id": 42,
                "organization": "Test Org",
                "expires_at": "2027-03-28T00:00:00Z",
                "validation_token": "base64encodedtoken==",
                "next_validation": "2026-04-27T00:00:00Z",
                "valid": true,
                "announcements": [
                    {"message": "Welcome!", "announcement_type": "info"}
                ]
            },
            "error": null,
            "message": "License activated successfully"
        }"#;

        let resp: ServerResponse = serde_json::from_str(json)
            .expect("New portal response must deserialize");
        assert!(resp.success);
        assert!(resp.data.is_some());
        let data = resp.data.unwrap();
        assert_eq!(data.license_id, Some(42));
        assert_eq!(data.organization.as_deref(), Some("Test Org"));
        assert_eq!(data.announcements.len(), 1);
    }

    #[test]
    fn test_new_portal_extra_fields_ignored() {
        // New portal may return extra fields not in the Rust struct
        let json = r#"{
            "success": true,
            "data": {
                "license_id": 42,
                "organization": "Test Org",
                "expires_at": null,
                "validation_token": "token",
                "next_validation": "2026-04-27T00:00:00Z",
                "valid": true,
                "announcements": [],
                "license_type": "standard",
                "features": {"cloud_acquisition": true},
                "extra_field_from_new_portal": "should be ignored"
            },
            "error": null,
            "message": "OK",
            "request_id": "uuid-from-new-portal"
        }"#;

        let resp: ServerResponse = serde_json::from_str(json)
            .expect("Extra fields should be silently ignored by serde");
        assert!(resp.success);
    }

    #[test]
    fn test_new_portal_validate_response_deserializes() {
        let json = r#"{
            "success": true,
            "data": {
                "license_id": null,
                "organization": "CBI",
                "expires_at": "2027-01-01T00:00:00Z",
                "validation_token": "newtoken==",
                "next_validation": "2026-04-27T12:00:00Z",
                "valid": true,
                "announcements": []
            },
            "error": null,
            "message": null
        }"#;

        let resp: ServerResponse = serde_json::from_str(json)
            .expect("Validate response must deserialize");
        assert!(resp.success);
        assert_eq!(resp.data.unwrap().valid, Some(true));
    }

    #[test]
    fn test_new_portal_error_response_deserializes() {
        let json = r#"{
            "success": false,
            "data": null,
            "error": "MAX_ACTIVATIONS_REACHED",
            "message": "This license has reached its maximum number of activations."
        }"#;

        let resp: ServerResponse = serde_json::from_str(json)
            .expect("Error response must deserialize");
        assert!(!resp.success);
        assert!(resp.data.is_none());
        assert_eq!(resp.error.as_deref(), Some("MAX_ACTIVATIONS_REACHED"));
    }

    #[test]
    fn test_new_portal_deactivate_response_deserializes() {
        let json = r#"{
            "success": true,
            "data": null,
            "error": null,
            "message": "License deactivated successfully"
        }"#;

        let resp: ServerResponse = serde_json::from_str(json)
            .expect("Deactivate response must deserialize");
        assert!(resp.success);
    }

    #[test]
    fn test_perpetual_license_null_expiry() {
        let json = r#"{
            "success": true,
            "data": {
                "license_id": 1,
                "organization": "Govt Agency",
                "expires_at": null,
                "validation_token": "token",
                "next_validation": "2026-04-27T00:00:00Z",
                "valid": true,
                "announcements": []
            },
            "error": null,
            "message": "OK"
        }"#;

        let resp: ServerResponse = serde_json::from_str(json).unwrap();
        assert!(resp.data.unwrap().expires_at.is_none());
    }
}
```

### 8.3 Load Testing

```bash
# Use k6 or similar to verify the new portal handles expected load

# Install k6
# brew install k6 (macOS) or choco install k6 (Windows)

# k6-migration-test.js
cat << 'EOF' > k6-migration-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // ramp up
    { duration: '5m', target: 10 },   // steady state
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // less than 1% failure rate
  },
};

const BASE = 'https://admin.cyberchakra.in/api/compat/v1';

export default function () {
  // Health check
  const health = http.get(`${BASE}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  // Validate (most common operation)
  const validate = http.post(`${BASE}/license/validate`,
    JSON.stringify({
      license_key: 'CCF-LOAD-TEST-LOAD-TEST',
      hardware_fingerprint: `load_test_${__VU}`,
      app_version: '2.0.0',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(validate, {
    'validate 200': (r) => r.status === 200,
    'validate has success': (r) => JSON.parse(r.body).success !== undefined,
  });

  sleep(1);
}
EOF

k6 run k6-migration-test.js
```

---

## 9. Runbook: Cutover Day

### Pre-Cutover Checklist (T-24 hours)

- [ ] All snapshot tests pass (PHP vs new portal responses match)
- [ ] Rust deserialization tests pass
- [ ] Data migration verification queries return 0 mismatches
- [ ] Load test passes with <500ms p95 and <1% error rate
- [ ] Admin portal is accessible at `admin.cyberchakra.in`
- [ ] PHP server backup taken and stored
- [ ] PHP database final export completed
- [ ] Dual-write sync job tested
- [ ] Rollback nginx config pre-staged at `/etc/nginx/sites-available/license-php-only.conf`
- [ ] Team alerted: DevOps, Support, Management
- [ ] No major customer events scheduled (demos, trials)

### Cutover Steps (T=0, Recommended: Tuesday 10:00 AM IST)

```bash
# Step 1: Final data sync (T-5 min)
ssh license-server "cd /var/www && php artisan migrate:final-sync"

# Step 2: Enable proxy (T=0)
ssh license-server "
  sudo cp /etc/nginx/sites-available/license-proxy.conf \
          /etc/nginx/sites-available/license.cyberchakra.in
  sudo nginx -t
  sudo systemctl reload nginx
"

# Step 3: Verify proxy is working (T+1 min)
curl -s https://license.cyberchakra.in/api/health.php | jq .
# Expected: {"status":"ok"} from new portal

# Step 4: Monitor for 15 minutes (T+1 to T+15)
# Watch logs:
#   - New portal: Vercel logs dashboard
#   - Proxy: tail -f /var/log/nginx/access.log
#   - Errors: tail -f /var/log/nginx/error.log

# Step 5: Enable dual-write sync (T+15 min)
# Deploy the sync cron job on Vercel

# Step 6: Send "all clear" or "rollback" decision at T+30 min
```

### Monitoring During Cutover

```bash
# Terminal 1: Watch proxy access log
ssh license-server "tail -f /var/log/nginx/access.log | grep -E 'activate|validate|deactivate'"

# Terminal 2: Watch proxy error log
ssh license-server "tail -f /var/log/nginx/error.log"

# Terminal 3: Watch new portal for 5xx errors
# (Use Vercel dashboard or CLI)
vercel logs --filter "status >= 500"

# Terminal 4: Test activation manually
curl -X POST https://license.cyberchakra.in/api/activate.php \
  -H "Content-Type: application/json" \
  -d '{"license_key":"CCF-TEST-TEST-TEST-TEST","hardware_fingerprint":"cutover_test","user_email":"test@cyberchakra.in","machine_name":"CUTOVER","os_info":"Test","app_version":"2.0.0"}'
```

### Rollback Trigger Conditions

| Condition | Action | Who Decides |
|-----------|--------|-------------|
| >5% of requests return 5xx | Immediate rollback | DevOps |
| Any activation returns non-JSON | Immediate rollback | DevOps |
| `success` field missing from response | Immediate rollback | DevOps |
| p95 latency >3s for 5+ minutes | Assess, likely rollback | DevOps + Engineering |
| Customer reports activation failure | Investigate (may be isolated) | Support + Engineering |
| New portal completely unreachable | Automatic fallback via proxy error_page | Automated |

### Post-Cutover Verification (T+1 hour)

```bash
# Verify real user traffic is flowing through new portal
# Check Vercel analytics for request counts

# Verify data is being written to PostgreSQL
psql $NEON_URL -c "
  SELECT event_type, COUNT(*)
  FROM license_events
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY event_type;
"

# Verify dual-write sync is working
psql $NEON_URL -c "
  SELECT * FROM pg_stat_activity WHERE query LIKE '%php_sync%';
"
```

---

## Appendix A: Validation Token Compatibility

The desktop app creates and verifies HMAC-SHA256 validation tokens. The new portal MUST use the same HMAC secret (`CCF_HMAC_SECRET` environment variable) and the same token format:

```json
// Base64-encoded JSON:
{
    "license_key": "CCF-XXXX-XXXX-XXXX-XXXX",
    "hardware_fingerprint": "sha256_hash",
    "validated_at": "2026-03-28T10:00:00Z",
    "expires_at": "2027-01-01T00:00:00Z",
    "signature": "hmac_sha256_hex_string"
}
```

Signature computed as:
```
HMAC-SHA256(
    key = CCF_HMAC_SECRET,
    data = "{license_key}:{hardware_fingerprint}:{validated_at}:{expires_at|perpetual}"
)
```

**The new portal's TypeScript implementation must produce byte-identical signatures:**

```typescript
// lib/crypto/hmac.ts
import { createHmac } from 'crypto';

export function generateValidationToken(
  licenseKey: string,
  hardwareFingerprint: string,
  expiresAt: string | null
): string {
  const validatedAt = new Date().toISOString();
  const expiresStr = expiresAt || 'perpetual';

  const dataToSign = `${licenseKey}:${hardwareFingerprint}:${validatedAt}:${expiresStr}`;

  const hmac = createHmac('sha256', process.env.CCF_HMAC_SECRET!);
  hmac.update(dataToSign);
  const signature = hmac.digest('hex');

  const tokenData = {
    license_key: licenseKey,
    hardware_fingerprint: hardwareFingerprint,
    validated_at: validatedAt,
    expires_at: expiresAt,
    signature,
  };

  return Buffer.from(JSON.stringify(tokenData)).toString('base64');
}
```

---

## Appendix B: Files That Need Changes in Desktop App (Phase 3)

| File | Change |
|------|--------|
| `src-tauri/src/licensing/mod.rs` | Update `LicenseServerConfig::default()` base_url |
| `src-tauri/src/licensing/validation.rs` | Remove `.php` from URL construction in `call_activation_api`, `call_validation_api`, `call_deactivation_api` |
| `src-tauri/src/licensing/offline.rs` | Remove `.php` from `check_server_connectivity` URL |
| `src-tauri/src/commands/license.rs` | Remove `.php` from `fetch_announcements` URL |

Total: 4 files, ~10 lines changed. Minimal blast radius.

---

## Appendix C: Heartbeat Response Format Difference

Note that the heartbeat endpoint uses a DIFFERENT response struct than the other endpoints:

```rust
// This is NOT ServerResponse -- it's HeartbeatResponse
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatResponse {
    pub success: bool,
    pub announcements: Vec<String>,         // Vec<String>, not Vec<Announcement>!
    pub update_available: Option<UpdateInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
    pub changelog: String,
}
```

The compat endpoint for heartbeat must return this exact format, NOT the `ServerResponse` format.

---

## Appendix D: Request Field Name Mapping

The desktop app sends `hardware_fingerprint` but the new portal schema uses `machine_id`:

| Desktop App Field | New Portal Field | Mapping Required |
|-------------------|-----------------|-----------------|
| `hardware_fingerprint` | `machine_id` | YES - compat layer translates |
| `user_email` | Stored in `contacts.email`, not in activation | YES - compat layer handles |
| `license_key` | `license_key` | No change |
| `machine_name` | `machine_name` | No change |
| `os_info` | `os_info` | No change |
| `app_version` | `app_version` | No change |

The compatibility routes handle this translation transparently.
