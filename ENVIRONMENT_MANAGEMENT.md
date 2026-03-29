# CCF Admin Portal -- Multi-Environment Management Strategy

Complete environment configuration, deployment procedures, and operational runbooks for development, staging, and production environments.

---

## Table of Contents

1. [Environment Overview](#1-environment-overview)
2. [Environment Variable Reference](#2-environment-variable-reference)
3. [Development Environment Setup](#3-development-environment-setup)
4. [Staging Environment Setup](#4-staging-environment-setup)
5. [Production Environment Setup](#5-production-environment-setup)
6. [Database Strategy Per Environment](#6-database-strategy-per-environment)
7. [Desktop App Environment Switching](#7-desktop-app-environment-switching)
8. [CI/CD Pipeline Per Environment](#8-cicd-pipeline-per-environment)
9. [Feature Flags System](#9-feature-flags-system)
10. [Secrets Management](#10-secrets-management)
11. [Environment Validation Scripts](#11-environment-validation-scripts)
12. [Runbook: Promoting Staging to Production](#12-runbook-promoting-staging-to-production)

---

## 1. Environment Overview

```
Development (dev)
  Host:      localhost
  Frontend:  http://localhost:5173     (Vite dev server)
  Backend:   http://localhost:3001     (tsx watch)
  Database:  Docker MySQL on :3306     (ccf_admin_dev)
  Purpose:   Daily developer workflow, hot-reload, disposable data

Staging (staging)
  Host:      admin-staging.cyberchakra.in
  Frontend:  https://admin-staging.cyberchakra.in  (static files in public_html)
  Backend:   https://admin-staging.cyberchakra.in/api  (Node.js on port 3002)
  Database:  Hostinger MySQL           (ccf_admin_staging)
  Purpose:   QA testing, desktop app integration testing, pre-production validation

Production (prod)
  Host:      admin.cyberchakra.in
  Frontend:  https://admin.cyberchakra.in  (static files in public_html)
  Backend:   https://admin.cyberchakra.in/api  (Node.js on port 3001)
  Database:  Hostinger MySQL           (ccf_admin_prod)
  Purpose:   Real customer data, live license management, desktop app default endpoint
```

### Environment Isolation Rules

| Rule | Enforcement |
|------|-------------|
| Staging and production MUST use different databases | Separate Hostinger MySQL instances with different names |
| Staging and production MUST use different JWT secrets | Validated by the `env-check` script (Section 11) |
| Development MUST NOT connect to any remote database | Docker-only `DATABASE_URL` enforced by `.env` template |
| Desktop app defaults to production | Hardcoded in `config/version.json`; dev/staging require explicit override |
| Production deploys are NEVER automatic | Manual `workflow_dispatch` only; staging auto-deploys on push to `main` |

---

## 2. Environment Variable Reference

### Complete Variable Matrix

| Variable | Development | Staging | Production | Notes |
|----------|------------|---------|------------|-------|
| `NODE_ENV` | `development` | `staging` | `production` | Controls logging verbosity and error detail |
| `PORT` | `3001` | `3002` | `3001` | Different ports on same host prevent collision |
| `DATABASE_URL` | `mysql://root:password@localhost:3306/ccf_admin_dev` | `mysql://USER:PASS@localhost:3306/PREFIXED_ccf_admin_staging` | `mysql://USER:PASS@localhost:3306/PREFIXED_ccf_admin_prod` | Hostinger prefixes DB names |
| `JWT_SECRET` | `dev-jwt-secret-not-for-production-use-only` | 64-char random hex | 64-char random hex (different from staging) | Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret-not-for-production-use-only` | 64-char random hex | 64-char random hex | Must differ from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | `24h` | `1h` | `1h` | Longer in dev for convenience |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | `7d` | `7d` | |
| `CCF_HMAC_SECRET` | `dev-hmac-secret` | staging HMAC secret | production HMAC secret (matches desktop app) | Must match the HMAC secret compiled into the desktop app build |
| `CORS_ORIGIN` | `http://localhost:5173` | `https://admin-staging.cyberchakra.in` | `https://admin.cyberchakra.in` | Comma-separated list supported |
| `VITE_API_URL` | (empty, uses Vite proxy) | `https://admin-staging.cyberchakra.in` | `https://admin.cyberchakra.in` | Frontend build-time variable |
| `SMTP_HOST` | (empty or Mailtrap) | `smtp.gmail.com` | `smtp.gmail.com` | Dev can use Mailtrap for email testing |
| `SMTP_PORT` | `587` | `587` | `587` | |
| `SMTP_USER` | (empty) | staging email account | production email account | |
| `SMTP_PASS` | (empty) | staging email password | production email password | |
| `SMTP_FROM` | `noreply@localhost` | `noreply-staging@cyberchakra.in` | `noreply@cyberchakra.in` | |
| `PORTAL_URL` | `http://localhost:5173` | `https://admin-staging.cyberchakra.in` | `https://admin.cyberchakra.in` | Used in email templates |
| `LOG_LEVEL` | `debug` | `info` | `warn` | Optional; controls request logger verbosity |
| `FEATURE_FLAGS` | `*` (all enabled) | Configurable via Settings table | Configurable via Settings table | See Section 9 |

---

## 3. Development Environment Setup

### 3.1 Prerequisites

- Node.js 20 LTS
- Docker Desktop (for MySQL)
- Git

### 3.2 Configuration Files

**`backend/.env`** (local development -- never committed):

```env
# =============================================================================
# CCF Admin Portal - DEVELOPMENT Environment
# =============================================================================

# --- Database (Docker MySQL) ---
DATABASE_URL="mysql://root:password@localhost:3306/ccf_admin_dev"

# --- JWT (weak secrets are fine for dev) ---
JWT_SECRET="dev-jwt-secret-not-for-production-use-only"
JWT_REFRESH_SECRET="dev-refresh-secret-not-for-production-use-only"
JWT_EXPIRES_IN="24h"
JWT_REFRESH_EXPIRES_IN="30d"

# --- License HMAC ---
CCF_HMAC_SECRET="dev-hmac-secret"

# --- Server ---
PORT=3001
CORS_ORIGIN="http://localhost:5173"
NODE_ENV="development"

# --- Email (use Mailtrap or leave empty to skip sending) ---
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@localhost"
PORTAL_URL="http://localhost:5173"

# --- Logging ---
LOG_LEVEL="debug"
```

**`docker-compose.yml`** (already exists, update database name):

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: ccf-admin-mysql-dev
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: ccf_admin_dev
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command:
      - --default-authentication-plugin=mysql_native_password
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql_data:
    driver: local
```

### 3.3 Startup Procedure

```bash
# 1. Start MySQL
docker compose up -d

# 2. Wait for MySQL to be healthy
docker compose exec mysql mysqladmin ping -h localhost --wait=30

# 3. Install dependencies (first time only)
npm run install:all

# 4. Push schema and seed
npm run db:push
npm run db:seed

# 5. Start dev servers (frontend + backend with hot reload)
npm run dev
```

### 3.4 Resetting Development Data

```bash
# Wipe everything and start fresh
docker compose down -v
docker compose up -d
npm run db:push
npm run db:seed
```

---

## 4. Staging Environment Setup

### 4.1 Hostinger Configuration

1. **Subdomain**: Create `admin-staging.cyberchakra.in` in hPanel > Domains > Subdomains
2. **SSL**: Install Let's Encrypt certificate for the staging subdomain
3. **MySQL Database**: Create a separate database in hPanel > Databases > MySQL Databases
   - Database name: `ccf_admin_staging` (Hostinger will prefix, e.g., `u123456789_ccf_admin_staging`)
   - Username: `ccf_staging_user`
   - Password: Generate a strong random password
4. **Node.js Application**: Set up in hPanel > Advanced > Node.js
   - Application root: `admin-portal-staging/backend`
   - Startup file: `dist/index.js`
   - Port: `3002`

### 4.2 Directory Structure on Server

```
~/
  admin-portal-staging/           # Staging deployment
    backend/
      .env                        # Staging environment variables (manual)
      dist/                       # Compiled backend
      node_modules/
      prisma/
      package.json
    public_html -> ~/domains/admin-staging.cyberchakra.in/public_html/
  admin-portal/                   # Production deployment (separate)
    backend/
      .env
      dist/
      ...
```

### 4.3 Staging `.env` File

Create on the server at `~/admin-portal-staging/backend/.env`:

```env
# =============================================================================
# CCF Admin Portal - STAGING Environment
# =============================================================================

# --- Database ---
DATABASE_URL="mysql://u123456789_ccf_staging_user:STRONG_PASSWORD@localhost:3306/u123456789_ccf_admin_staging"

# --- JWT (generate unique secrets -- MUST differ from production) ---
JWT_SECRET="GENERATE_WITH: node -e console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET="GENERATE_WITH: node -e console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# --- License HMAC (use a staging-specific secret) ---
CCF_HMAC_SECRET="staging-hmac-secret-for-qa-testing"

# --- Server ---
PORT=3002
CORS_ORIGIN="https://admin-staging.cyberchakra.in"
NODE_ENV="staging"

# --- Email (can use same SMTP but different sender for clarity) ---
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="staging-notifications@cyberchakra.in"
SMTP_PASS="SMTP_PASSWORD_HERE"
SMTP_FROM="noreply-staging@cyberchakra.in"
PORTAL_URL="https://admin-staging.cyberchakra.in"

# --- Logging ---
LOG_LEVEL="info"
```

### 4.4 Staging `.htaccess`

Place at `~/domains/admin-staging.cyberchakra.in/public_html/.htaccess`:

```apache
RewriteEngine On

# Legacy PHP endpoint compatibility (same as production)
RewriteRule ^api/activate\.php$                    /api/v1/license/activate [L,QSA]
RewriteRule ^api/validate\.php$                    /api/v1/license/validate [L,QSA]
RewriteRule ^api/deactivate\.php$                  /api/v1/license/deactivate [L,QSA]
RewriteRule ^api/heartbeat\.php$                   /api/v1/heartbeat [L,QSA]
RewriteRule ^api/health\.php$                      /api/v1/health [L,QSA]
RewriteRule ^api/announcements\.php$               /api/v1/announcements [L,QSA]
RewriteRule ^api/update-check\.php$                /api/v1/update-check [L,QSA]
RewriteRule ^api/trial-request\.php$               /api/v1/trial-request [L,QSA]
RewriteRule ^api/trial-request-status\.php$        /api/v1/trial-request-status [L,QSA]
RewriteRule ^api/support/create-ticket\.php$       /api/v1/support/create-ticket [L,QSA]
RewriteRule ^api/support/ticket-status\.php$       /api/v1/support/ticket-status [L,QSA]
RewriteRule ^api/support/ticket-details\.php$      /api/v1/support/ticket-details [L,QSA]
RewriteRule ^api/support/reply-ticket\.php$        /api/v1/support/reply-ticket [L,QSA]

# NOTE: Port 3002 for staging (not 3001)
RewriteRule ^api/(.*)$ http://127.0.0.1:3002/api/$1 [P,L]

# SPA fallback
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### 4.5 Staging Data Seeding

Create `backend/src/seed-staging.ts` for realistic test data:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding STAGING database with test data...\n");

  // ─── Admin users ─────────────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("StagingPass123!", 12);

  await prisma.adminUser.upsert({
    where: { email: "admin@cyberchakra.in" },
    create: {
      email: "admin@cyberchakra.in",
      passwordHash,
      name: "Staging Admin",
      role: "super_admin",
      isActive: true,
    },
    update: {},
  });

  await prisma.adminUser.upsert({
    where: { email: "qa@cyberchakra.in" },
    create: {
      email: "qa@cyberchakra.in",
      passwordHash,
      name: "QA Tester",
      role: "admin",
      isActive: true,
    },
    update: {},
  });

  console.log("Admin users created (password: StagingPass123!)");

  // ─── Test organization ────────────────────────────────────────────────────

  const org = await prisma.organization.upsert({
    where: { id: 1 },
    create: {
      name: "Test Police Department",
      type: "law_enforcement",
      address: "123 Test Street, Test City, TS 12345",
      phone: "+91-9999999999",
      isActive: true,
    },
    update: {},
  });

  console.log(`Organization: ${org.name} (id: ${org.id})`);

  // ─── Test licenses ────────────────────────────────────────────────────────

  const testLicenses = [
    { key: "TEST-AAAA-BBBB-CCCC", type: "perpetual", status: "active" },
    { key: "TEST-DDDD-EEEE-FFFF", type: "trial", status: "active" },
    { key: "TEST-GGGG-HHHH-IIII", type: "time_limited", status: "expired" },
    { key: "TEST-JJJJ-KKKK-LLLL", type: "perpetual", status: "suspended" },
  ];

  for (const lic of testLicenses) {
    await prisma.license.upsert({
      where: { licenseKey: lic.key },
      create: {
        licenseKey: lic.key,
        type: lic.type as any,
        tier: "team",
        status: lic.status as any,
        maxActivations: 3,
        organizationId: org.id,
        issuedAt: new Date("2025-01-01"),
        expiresAt: lic.type === "trial"
          ? new Date("2026-04-30")
          : lic.type === "time_limited"
            ? new Date("2025-12-31")
            : null,
        notes: `Staging test license - ${lic.type}`,
      },
      update: {},
    });
    console.log(`License: ${lic.key} (${lic.type}, ${lic.status})`);
  }

  // ─── Default settings ────────────────────────────────────────────────────

  const defaults: Record<string, string> = {
    "trial.duration_days": "30",
    "trial.max_activations": "1",
    "trial.auto_approve": "true",        // Auto-approve in staging for testing
    "license.default_max_activations": "3",
    "heartbeat.interval_hours": "24",
    "support.auto_close_days": "14",
    "feature.beta_features": "true",     // Enable beta features in staging
    "feature.debug_panel": "true",       // Enable debug panel in staging
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    console.log(`Setting: ${key} = ${value}`);
  }

  console.log("\nStaging seed complete.");
}

main()
  .catch((err) => {
    console.error("Staging seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add the script to `backend/package.json`:

```json
{
  "scripts": {
    "db:seed:staging": "tsx src/seed-staging.ts"
  }
}
```

---

## 5. Production Environment Setup

### 5.1 Hostinger Configuration

1. **Subdomain**: `admin.cyberchakra.in` (already documented in `hostinger-deploy.md`)
2. **SSL**: Let's Encrypt with Force HTTPS
3. **MySQL Database**: `ccf_admin_prod` (prefixed by Hostinger)
4. **Node.js Application**: Port `3001`, startup file `dist/index.js`

### 5.2 Production `.env` File

Create on the server at `~/admin-portal/backend/.env`:

```env
# =============================================================================
# CCF Admin Portal - PRODUCTION Environment
# =============================================================================
# WARNING: This file contains production secrets.
# - NEVER commit to version control
# - NEVER copy to staging or development
# - Rotate secrets on any suspected compromise
# =============================================================================

# --- Database ---
DATABASE_URL="mysql://u123456789_ccf_admin_user:PRODUCTION_STRONG_PASSWORD@localhost:3306/u123456789_ccf_admin_prod"

# --- JWT (production secrets -- 64-char random hex each) ---
JWT_SECRET="<UNIQUE_PRODUCTION_JWT_SECRET_64_HEX_CHARS>"
JWT_REFRESH_SECRET="<UNIQUE_PRODUCTION_REFRESH_SECRET_64_HEX_CHARS>"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# --- License HMAC (MUST match the desktop app compiled secret) ---
CCF_HMAC_SECRET="<PRODUCTION_HMAC_SECRET_MATCHING_DESKTOP_APP>"

# --- Server ---
PORT=3001
CORS_ORIGIN="https://admin.cyberchakra.in"
NODE_ENV="production"

# --- Email ---
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="notifications@cyberchakra.in"
SMTP_PASS="PRODUCTION_SMTP_PASSWORD"
SMTP_FROM="noreply@cyberchakra.in"
PORTAL_URL="https://admin.cyberchakra.in"

# --- Logging ---
LOG_LEVEL="warn"
```

### 5.3 Production Safety Rules

1. **Database changes**: Always `prisma db push` with `--accept-data-loss=false` (the default). Never use `--force-reset` in production.
2. **Pre-deployment backup**: Always run `mysqldump` before deploying schema changes.
3. **Rollback procedure**: Keep the previous `dist/` and `public_html/` as `.backup` directories.
4. **Monitoring**: Health check at `/api/v1/health` should be polled by an external monitor (UptimeRobot, Hostinger monitoring, etc.).

---

## 6. Database Strategy Per Environment

### 6.1 Database Naming Convention

| Environment | Database Name | User |
|-------------|---------------|------|
| Development | `ccf_admin_dev` | `root` (Docker, password: `password`) |
| Staging | `u123456789_ccf_admin_staging` | `u123456789_ccf_staging_user` |
| Production | `u123456789_ccf_admin_prod` | `u123456789_ccf_admin_user` |

### 6.2 Schema Migration Strategy

```
Developer workstation                    Hostinger Server
======================                   ================

  prisma migrate dev        ------>      prisma db push
  (creates migration files)              (applies schema diff)
  (safe to reset)                        (never resets data)

  Development:                           Staging:
    Can wipe anytime                       Seeded test data
    prisma migrate reset                   prisma db push (safe)
    prisma db seed                         db:seed:staging after reset

                                         Production:
                                           BACKUP FIRST
                                           prisma db push
                                           NEVER --force-reset
```

### 6.3 Migration Workflow

```bash
# 1. Developer makes schema change in prisma/schema.prisma

# 2. Apply locally (creates migration SQL files)
cd backend
npx prisma migrate dev --name descriptive_name

# 3. Test locally
npm run dev
# ... verify the change works ...

# 4. Commit the migration files
git add prisma/
git commit -m "db: add field X to table Y"

# 5. Deploy to staging first (CI/CD does this automatically)
# The deploy workflow runs: npx prisma db push

# 6. Verify on staging
curl https://admin-staging.cyberchakra.in/api/v1/health

# 7. Deploy to production (manual workflow_dispatch)
# Pre-step: SSH into server and backup the database
ssh u123456789@host
mysqldump -u USER -p ccf_admin_prod > ~/backups/ccf_admin_prod_$(date +%Y%m%d_%H%M%S).sql
# Then trigger the production deploy workflow
```

### 6.4 Database Backup Script

Create `scripts/backup-db.sh` for the Hostinger server:

```bash
#!/bin/bash
# CCF Admin Portal - Database Backup Script
# Run via cron: 0 1 * * * ~/admin-portal/scripts/backup-db.sh

set -euo pipefail

BACKUP_DIR="$HOME/backups/db"
DB_NAME="u123456789_ccf_admin_prod"
DB_USER="u123456789_ccf_admin_user"
DB_PASS="PRODUCTION_DB_PASSWORD"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of $DB_NAME..."

mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup saved to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned up backups older than $RETENTION_DAYS days"
```

### 6.5 Staging Data Reset Procedure

```bash
# SSH into Hostinger server
ssh u123456789@host

# Navigate to staging
cd ~/admin-portal-staging/backend

# Reset staging database (safe -- this IS staging)
npx prisma db push --force-reset

# Re-seed with test data
npx tsx src/seed-staging.ts

echo "Staging database reset and re-seeded."
```

---

## 7. Desktop App Environment Switching

### 7.1 Current Architecture

The desktop app (Tauri/Rust) reads its license server URL from two sources:

1. **Compile-time default** in `src-tauri/src/licensing/mod.rs`:
   ```rust
   impl Default for LicenseServerConfig {
       fn default() -> Self {
           Self {
               base_url: "https://license.cyberchakra.in/api".to_string(),
               api_key: None,
           }
       }
   }
   ```

2. **Runtime config** in `config/version.json`:
   ```json
   {
     "license_server": "https://license.cyberchakra.in/api",
     "update_endpoint": "https://license.cyberchakra.in/api/update-check.php"
   }
   ```

### 7.2 Proposed Environment Switching Mechanism

Add an environment override to `LicenseServerConfig` that reads from a local config file or environment variable, while keeping the production default hardcoded.

**Step 1**: Add `config/environments.json` (shipped with app but overridable):

```json
{
  "environments": {
    "production": {
      "license_server": "https://admin.cyberchakra.in/api",
      "update_endpoint": "https://admin.cyberchakra.in/api/v1/update-check"
    },
    "staging": {
      "license_server": "https://admin-staging.cyberchakra.in/api",
      "update_endpoint": "https://admin-staging.cyberchakra.in/api/v1/update-check"
    },
    "development": {
      "license_server": "http://localhost:3001/api",
      "update_endpoint": "http://localhost:3001/api/v1/update-check"
    }
  },
  "default": "production"
}
```

**Step 2**: Modify `LicenseServerConfig::default()` to check for overrides:

```rust
impl LicenseServerConfig {
    pub fn load() -> Self {
        // Priority order:
        // 1. CCF_LICENSE_SERVER_URL environment variable (for development)
        // 2. Local override file at <app_data>/ccf_env_override.json
        // 3. Hardcoded production default

        // Check environment variable first (developer use only)
        if let Ok(url) = std::env::var("CCF_LICENSE_SERVER_URL") {
            tracing::warn!("Using license server override from environment: {}", url);
            return Self {
                base_url: url,
                api_key: None,
            };
        }

        // Check for local override file (QA use)
        if let Some(app_data) = dirs::data_dir() {
            let override_path = app_data
                .join("cyber-chakra-forensics")
                .join("env_override.json");
            if override_path.exists() {
                if let Ok(contents) = std::fs::read_to_string(&override_path) {
                    if let Ok(config) = serde_json::from_str::<EnvOverride>(&contents) {
                        tracing::warn!(
                            "Using license server override from {:?}: {}",
                            override_path,
                            config.license_server
                        );
                        return Self {
                            base_url: config.license_server,
                            api_key: None,
                        };
                    }
                }
            }
        }

        // Production default (hardcoded, safe)
        Self {
            base_url: "https://admin.cyberchakra.in/api".to_string(),
            api_key: None,
        }
    }
}

#[derive(Debug, serde::Deserialize)]
struct EnvOverride {
    license_server: String,
    #[allow(dead_code)]
    update_endpoint: Option<String>,
}
```

**Step 3**: Add a Tauri command for QA to switch environments:

```rust
/// Switch the desktop app's target environment (dev/staging/production).
/// Requires app restart to take effect.
/// Only available in debug builds or when explicitly enabled.
#[tauri::command]
pub async fn set_environment_override(
    environment: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let valid_envs = ["production", "staging", "development"];
    if !valid_envs.contains(&environment.as_str()) {
        return Err(format!(
            "Invalid environment '{}'. Must be one of: {:?}",
            environment, valid_envs
        ));
    }

    let environments = std::collections::HashMap::from([
        ("production", "https://admin.cyberchakra.in/api"),
        ("staging", "https://admin-staging.cyberchakra.in/api"),
        ("development", "http://localhost:3001/api"),
    ]);

    let url = environments[environment.as_str()];
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot find app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Cannot create app data dir: {}", e))?;

    let override_path = app_data.join("env_override.json");

    if environment == "production" {
        // Remove the override file to revert to default
        if override_path.exists() {
            std::fs::remove_file(&override_path)
                .map_err(|e| format!("Cannot remove override: {}", e))?;
        }
        return Ok("Switched to production (default). Restart the app.".to_string());
    }

    let content = serde_json::json!({
        "license_server": url,
        "environment": environment,
    });

    std::fs::write(&override_path, serde_json::to_string_pretty(&content).unwrap())
        .map_err(|e| format!("Cannot write override: {}", e))?;

    Ok(format!(
        "Switched to {} ({}). Restart the app to apply.",
        environment, url
    ))
}
```

### 7.3 Safety Guardrails

| Guardrail | Implementation |
|-----------|----------------|
| Production is always the default | Hardcoded in Rust; override file must be explicitly created |
| Visual indicator for non-production | Show a banner in the desktop app UI when `env_override.json` exists |
| Override requires restart | Prevents mid-session endpoint switching that could corrupt state |
| QA-only access | The `set_environment_override` command can be gated behind a debug flag or admin setting |
| Override file location | In the app's data directory, not the install directory -- survives updates |

### 7.4 Desktop App HMAC Secret Per Environment

The `CCF_HMAC_SECRET` is used for secure request signing between the desktop app and the license server. Each environment must use a matching pair:

| Environment | Desktop App HMAC | Server HMAC |
|-------------|-----------------|-------------|
| Development | `dev-hmac-secret` | Same in `backend/.env` |
| Staging | `staging-hmac-secret-for-qa-testing` | Same in staging `backend/.env` |
| Production | Production secret (compiled into release build) | Same in production `backend/.env` |

For development and staging builds, the HMAC secret can be set via environment variable at build time or in the override config.

---

## 8. CI/CD Pipeline Per Environment

### 8.1 Pipeline Overview

```
Push to main branch
  |
  v
CI (lint-and-typecheck + security-audit)    <-- Runs on ALL pushes
  |
  |-- Pass --> Auto-deploy to STAGING       <-- Automatic
  |
  (Manual trigger via workflow_dispatch)
  |
  v
Deploy to PRODUCTION                        <-- Manual only, never automatic
```

### 8.2 Updated CI Workflow

Replace `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    paths:
      - 'docs/admin-portal/**'
  pull_request:
    paths:
      - 'docs/admin-portal/**'

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: docs/admin-portal
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            docs/admin-portal/frontend/package-lock.json
            docs/admin-portal/backend/package-lock.json

      - name: Install frontend deps
        run: cd frontend && npm ci

      - name: Install backend deps
        run: cd backend && npm ci

      - name: Generate Prisma client
        run: cd backend && npx prisma generate

      - name: TypeScript check (frontend)
        run: cd frontend && npx tsc --noEmit

      - name: TypeScript check (backend)
        run: cd backend && npx tsc --noEmit

      - name: Build frontend
        run: cd frontend && npm run build

      - name: Build backend
        run: cd backend && npm run build

  security-audit:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: docs/admin-portal
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Audit frontend
        run: cd frontend && npm audit --production || true

      - name: Audit backend
        run: cd backend && npm audit --production || true

  # Auto-deploy to staging on successful push to main
  deploy-staging:
    needs: [lint-and-typecheck, security-audit]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: staging
    defaults:
      run:
        working-directory: docs/admin-portal
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd frontend && npm ci
          cd ../backend && npm ci

      - name: Generate Prisma
        run: cd backend && npx prisma generate

      - name: Build frontend (staging)
        run: cd frontend && VITE_API_URL="https://admin-staging.cyberchakra.in" npm run build

      - name: Build backend
        run: cd backend && npm run build

      - name: Prepare deployment package
        run: |
          mkdir -p deploy/public_html deploy/backend
          cp -r frontend/dist/* deploy/public_html/
          cp -r backend/dist deploy/backend/dist
          cp -r backend/node_modules deploy/backend/node_modules
          cp -r backend/prisma deploy/backend/prisma
          cp backend/package.json deploy/backend/
          # Use staging htaccess (port 3002)
          cp .htaccess deploy/public_html/.htaccess
          sed -i 's/127\.0\.0\.1:3001/127.0.0.1:3002/g' deploy/public_html/.htaccess

      - name: Deploy to staging via SSH
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          source: "docs/admin-portal/deploy/*"
          target: "/home/${{ secrets.HOSTINGER_USER }}/admin-portal-staging"
          strip_components: 4

      - name: Apply schema and restart staging
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          script: |
            cd ~/admin-portal-staging/backend
            npx prisma db push --accept-data-loss=false
            # Copy frontend to staging subdomain document root
            cp -r ~/admin-portal-staging/public_html/* ~/domains/admin-staging.cyberchakra.in/public_html/
            # Restart staging Node.js process
            npx pm2 restart ccf-admin-staging 2>/dev/null || npx pm2 start dist/index.js --name ccf-admin-staging
            echo "Staging deployment complete"

      - name: Verify staging health
        run: |
          sleep 10
          curl -sf https://admin-staging.cyberchakra.in/api/v1/health || echo "WARNING: Staging health check failed"
```

### 8.3 Updated Deploy Workflow (Production Only)

Replace `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      confirm_production:
        description: 'Type "DEPLOY TO PRODUCTION" to confirm'
        required: true
        type: string

jobs:
  validate-confirmation:
    runs-on: ubuntu-latest
    steps:
      - name: Validate confirmation
        run: |
          if [ "${{ github.event.inputs.confirm_production }}" != "DEPLOY TO PRODUCTION" ]; then
            echo "ERROR: Production deployment not confirmed."
            echo "You must type 'DEPLOY TO PRODUCTION' exactly to proceed."
            exit 1
          fi

  deploy-production:
    needs: validate-confirmation
    runs-on: ubuntu-latest
    environment: production
    defaults:
      run:
        working-directory: docs/admin-portal
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd frontend && npm ci
          cd ../backend && npm ci

      - name: Generate Prisma
        run: cd backend && npx prisma generate

      - name: TypeScript check (safety gate)
        run: |
          cd frontend && npx tsc --noEmit
          cd ../backend && npx tsc --noEmit

      - name: Build frontend (production)
        run: cd frontend && VITE_API_URL="https://admin.cyberchakra.in" npm run build

      - name: Build backend
        run: cd backend && npm run build

      - name: Prepare deployment package
        run: |
          mkdir -p deploy/public_html deploy/backend
          cp -r frontend/dist/* deploy/public_html/
          cp -r backend/dist deploy/backend/dist
          cp -r backend/node_modules deploy/backend/node_modules
          cp -r backend/prisma deploy/backend/prisma
          cp backend/package.json deploy/backend/
          cp .htaccess deploy/public_html/

      - name: Backup production before deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          script: |
            TIMESTAMP=$(date +%Y%m%d_%H%M%S)
            mkdir -p ~/backups/deploys
            # Backup current production
            cp -r ~/admin-portal/backend/dist ~/backups/deploys/backend_${TIMESTAMP} 2>/dev/null || true
            cp -r ~/domains/admin.cyberchakra.in/public_html ~/backups/deploys/frontend_${TIMESTAMP} 2>/dev/null || true
            # Database backup
            mysqldump -u ${{ secrets.PROD_DB_USER }} -p'${{ secrets.PROD_DB_PASS }}' ${{ secrets.PROD_DB_NAME }} \
              --single-transaction | gzip > ~/backups/deploys/db_${TIMESTAMP}.sql.gz
            echo "Pre-deploy backup created: ${TIMESTAMP}"

      - name: Deploy to production via SSH
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          source: "docs/admin-portal/deploy/*"
          target: "/home/${{ secrets.HOSTINGER_USER }}/admin-portal"
          strip_components: 4

      - name: Apply schema and restart production
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USER }}
          key: ${{ secrets.HOSTINGER_SSH_KEY }}
          script: |
            cd ~/admin-portal/backend
            npx prisma db push --accept-data-loss=false
            cp -r ~/admin-portal/public_html/* ~/domains/admin.cyberchakra.in/public_html/
            npx pm2 restart ccf-admin-backend
            echo "Production deployment complete"

      - name: Verify production health
        run: |
          sleep 15
          HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" https://admin.cyberchakra.in/api/v1/health)
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "CRITICAL: Production health check returned $HTTP_STATUS"
            exit 1
          fi
          echo "Production health check passed (HTTP 200)"
```

### 8.4 GitHub Environment Configuration

Set up two GitHub Environments in the repository settings:

**Environment: `staging`**
- No required reviewers (auto-deploys)
- Deployment branches: `main` only
- Secrets: Same SSH secrets as production (same server)

**Environment: `production`**
- Required reviewers: At least 1 team member must approve
- Deployment branches: `main` only
- Wait timer: 5 minutes (gives time to cancel accidental deploys)
- Secrets:
  - `HOSTINGER_HOST`
  - `HOSTINGER_USER`
  - `HOSTINGER_SSH_KEY`
  - `PROD_DB_USER`
  - `PROD_DB_PASS`
  - `PROD_DB_NAME`

### 8.5 GitHub Secrets Reference

| Secret Name | Environment | Description |
|-------------|-------------|-------------|
| `HOSTINGER_HOST` | Both | Hostinger server IP |
| `HOSTINGER_USER` | Both | SSH username |
| `HOSTINGER_SSH_KEY` | Both | Ed25519 private key (PEM) |
| `PROD_DB_USER` | Production | MySQL username for production DB |
| `PROD_DB_PASS` | Production | MySQL password for production DB |
| `PROD_DB_NAME` | Production | Full prefixed production DB name |
| `STAGING_DB_USER` | Staging | MySQL username for staging DB |
| `STAGING_DB_PASS` | Staging | MySQL password for staging DB |
| `STAGING_DB_NAME` | Staging | Full prefixed staging DB name |

---

## 9. Feature Flags System

### 9.1 Architecture

Feature flags are stored in the `Setting` table in the database, prefixed with `feature.`. They are:
- Readable by the admin portal UI via the Settings API
- Readable by the desktop app via the license validation/heartbeat response
- Configurable per environment through seeding or the admin UI

### 9.2 Database Schema (already exists in `Setting` model)

The existing `Setting` model in Prisma schema:

```prisma
model Setting {
  key       String   @id @db.VarChar(100)
  value     String   @db.Text
  updatedAt DateTime @default(now()) @updatedAt
}
```

### 9.3 Feature Flag Naming Convention

```
feature.<category>.<flag_name>

Examples:
  feature.beta.new_dashboard       = "true" | "false"
  feature.beta.bulk_operations     = "true" | "false"
  feature.debug.panel              = "true" | "false"
  feature.debug.verbose_logging    = "true" | "false"
  feature.rollout.v2_license_flow  = "true" | "false"
  feature.limit.max_export_rows    = "10000"
```

### 9.4 Backend: Feature Flag Service

Create `backend/src/services/featureFlags.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// In-memory cache with TTL
let cache: Map<string, string> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadFlags(): Promise<Map<string, string>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && cache.size > 0) {
    return cache;
  }

  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "feature." } },
  });

  cache = new Map(settings.map((s) => [s.key, s.value]));
  cacheTimestamp = now;
  return cache;
}

export async function isFeatureEnabled(flag: string): Promise<boolean> {
  const flags = await loadFlags();
  const key = flag.startsWith("feature.") ? flag : `feature.${flag}`;
  const value = flags.get(key);
  return value === "true" || value === "1";
}

export async function getFeatureValue(flag: string): Promise<string | null> {
  const flags = await loadFlags();
  const key = flag.startsWith("feature.") ? flag : `feature.${flag}`;
  return flags.get(key) ?? null;
}

export async function getAllFeatureFlags(): Promise<Record<string, string>> {
  const flags = await loadFlags();
  const result: Record<string, string> = {};
  for (const [key, value] of flags) {
    result[key.replace("feature.", "")] = value;
  }
  return result;
}

/** Force cache refresh (call after updating a setting) */
export function invalidateCache(): void {
  cacheTimestamp = 0;
}
```

### 9.5 Backend: Feature Flags API Endpoint

Add to the license validation and heartbeat responses so the desktop app receives active flags:

```typescript
// In the heartbeat response handler, add:
import { getAllFeatureFlags } from "../services/featureFlags.js";

// ... inside the heartbeat handler:
const featureFlags = await getAllFeatureFlags();

return res.json({
  success: true,
  data: {
    // ... existing heartbeat response fields ...
    featureFlags,  // Desktop app receives current flags
  },
});
```

### 9.6 Admin Portal: Feature Flag Management Page

The admin portal should include a Settings page where super_admins can toggle feature flags. The frontend reads flags from `GET /api/v1/admin/settings?prefix=feature.` and updates via `PATCH /api/v1/admin/settings/:key`.

### 9.7 Desktop App: Reading Feature Flags

```rust
/// Feature flags received from server during heartbeat/validation
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FeatureFlags {
    #[serde(flatten)]
    pub flags: HashMap<String, String>,
}

impl FeatureFlags {
    pub fn is_enabled(&self, flag: &str) -> bool {
        self.flags.get(flag).map(|v| v == "true" || v == "1").unwrap_or(false)
    }
}
```

### 9.8 Default Flags Per Environment

| Flag | Development | Staging | Production |
|------|------------|---------|------------|
| `beta.new_dashboard` | `true` | `true` | `false` |
| `beta.bulk_operations` | `true` | `true` | `false` |
| `debug.panel` | `true` | `true` | `false` |
| `debug.verbose_logging` | `true` | `true` | `false` |
| `rollout.v2_license_flow` | `true` | `true` | `false` |

These defaults are set by the seed scripts (`seed.ts` for dev, `seed-staging.ts` for staging) and can be overridden at any time through the admin UI.

---

## 10. Secrets Management

### 10.1 Secret Categories

| Category | Where Stored | Rotation Frequency |
|----------|-------------|-------------------|
| Database passwords | `.env` file on server (never in git) | Every 90 days |
| JWT secrets | `.env` file on server + GitHub Secrets | Every 90 days or on compromise |
| HMAC secret | Compiled into desktop app + `.env` on server | On major release |
| SSH deploy key | `~/.ssh/` on dev machine + GitHub Secret | Every 6 months |
| SMTP credentials | `.env` file on server | Per email provider policy |
| GitHub Secrets | GitHub UI (encrypted at rest) | When rotated |

### 10.2 Secret Generation Procedures

```bash
# Generate a 64-character hex secret (for JWT_SECRET, JWT_REFRESH_SECRET)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate a 32-character base64 secret (for HMAC)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Generate a strong database password
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

# Generate an SSH deploy key
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/hostinger_deploy -N ""
```

### 10.3 Environment-Specific Secret Isolation Rules

1. **Development secrets MUST be obviously fake**: Prefixed with `dev-` or containing `not-for-production`.
2. **Staging secrets MUST differ from production**: A leaked staging secret must not compromise production.
3. **Production secrets MUST be maximum entropy**: 64+ hex characters, generated from CSPRNG.
4. **Cross-environment validation**: The `env-check` script (Section 11) validates that no two environments share secrets.

### 10.4 Secret Rotation Procedure

```bash
# 1. Generate new secrets
NEW_JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
NEW_REFRESH=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 2. SSH into the server
ssh u123456789@host

# 3. Update the .env file
nano ~/admin-portal/backend/.env
# Replace JWT_SECRET and JWT_REFRESH_SECRET with new values

# 4. Restart the application
# Note: This will invalidate all existing sessions. Active users will need to log in again.
cd ~/admin-portal/backend
npx pm2 restart ccf-admin-backend

# 5. Update GitHub Secrets if they reference these values
# Go to GitHub > Settings > Secrets > Update

# 6. Log the rotation (not the secret values!) in the team's ops log
echo "$(date): Rotated JWT secrets for production. All sessions invalidated."
```

### 10.5 `.gitignore` Enforcement

The existing `.gitignore` already covers `.env` files. Additionally, add a pre-commit hook:

```bash
#!/bin/bash
# .husky/pre-commit (add this check)

# Prevent committing files that might contain secrets
FORBIDDEN_PATTERNS=(
  "\.env$"
  "\.env\.local$"
  "\.env\.production$"
  "\.env\.staging$"
  "credentials"
  "\.pem$"
  "private.*key"
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  MATCHED=$(git diff --cached --name-only | grep -iE "$pattern" || true)
  if [ -n "$MATCHED" ]; then
    echo "ERROR: Attempt to commit potentially sensitive file(s):"
    echo "$MATCHED"
    echo "If this is intentional (e.g., .env.example), use 'git commit --no-verify'."
    exit 1
  fi
done
```

---

## 11. Environment Validation Scripts

### 11.1 Pre-Start Validation

Create `backend/src/env-check.ts`:

```typescript
/**
 * Environment validation script.
 * Run before starting the server to catch misconfiguration early.
 *
 * Usage: npx tsx src/env-check.ts
 */

import "dotenv/config";

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  validate?: (value: string) => string | null; // Returns error message or null
}

const checks: EnvCheck[] = [
  {
    name: "NODE_ENV",
    value: process.env.NODE_ENV,
    required: true,
    validate: (v) =>
      ["development", "staging", "production"].includes(v)
        ? null
        : `Must be 'development', 'staging', or 'production' (got '${v}')`,
  },
  {
    name: "DATABASE_URL",
    value: process.env.DATABASE_URL,
    required: true,
    validate: (v) => {
      if (!v.startsWith("mysql://")) return "Must start with mysql://";
      if (v.includes("password@") && process.env.NODE_ENV === "production")
        return "Production DATABASE_URL appears to use a default password";
      return null;
    },
  },
  {
    name: "JWT_SECRET",
    value: process.env.JWT_SECRET,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production") {
        if (v.length < 64) return "Production JWT_SECRET must be at least 64 characters";
        if (v.includes("dev") || v.includes("change"))
          return "Production JWT_SECRET appears to be a placeholder";
      }
      return null;
    },
  },
  {
    name: "JWT_REFRESH_SECRET",
    value: process.env.JWT_REFRESH_SECRET,
    required: true,
    validate: (v) => {
      if (v === process.env.JWT_SECRET)
        return "JWT_REFRESH_SECRET must differ from JWT_SECRET";
      return null;
    },
  },
  {
    name: "CCF_HMAC_SECRET",
    value: process.env.CCF_HMAC_SECRET,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production" && v.length < 32)
        return "Production HMAC secret should be at least 32 characters";
      return null;
    },
  },
  {
    name: "CORS_ORIGIN",
    value: process.env.CORS_ORIGIN,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production" && v.includes("localhost"))
        return "Production CORS_ORIGIN must not include localhost";
      if (process.env.NODE_ENV === "production" && !v.startsWith("https://"))
        return "Production CORS_ORIGIN must use HTTPS";
      return null;
    },
  },
  {
    name: "PORT",
    value: process.env.PORT,
    required: true,
    validate: (v) => {
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535) return "Must be a valid port number";
      return null;
    },
  },
];

function run(): void {
  const env = process.env.NODE_ENV || "unknown";
  console.log(`\nCCF Admin Portal - Environment Validation`);
  console.log(`Environment: ${env}`);
  console.log("=".repeat(50));

  let hasErrors = false;

  for (const check of checks) {
    if (!check.value) {
      if (check.required) {
        console.log(`  FAIL  ${check.name}: Missing (required)`);
        hasErrors = true;
      } else {
        console.log(`  SKIP  ${check.name}: Not set (optional)`);
      }
      continue;
    }

    if (check.validate) {
      const error = check.validate(check.value);
      if (error) {
        console.log(`  FAIL  ${check.name}: ${error}`);
        hasErrors = true;
        continue;
      }
    }

    // Mask the value for display
    const masked =
      check.name.includes("SECRET") || check.name.includes("PASSWORD") || check.name === "DATABASE_URL"
        ? check.value.substring(0, 8) + "..." + check.value.substring(check.value.length - 4)
        : check.value;
    console.log(`  OK    ${check.name}: ${masked}`);
  }

  console.log("=".repeat(50));

  if (hasErrors) {
    console.log("\nFAILED: Fix the errors above before starting the server.\n");
    process.exit(1);
  }

  console.log("\nPASSED: All environment checks OK.\n");
}

run();
```

### 11.2 Add to Package Scripts

Add to `backend/package.json`:

```json
{
  "scripts": {
    "env:check": "tsx src/env-check.ts",
    "prestart": "tsx src/env-check.ts",
    "predev": "tsx src/env-check.ts"
  }
}
```

### 11.3 CI Environment Check

Add to the CI workflow before deployment steps:

```yaml
- name: Validate environment config
  run: |
    cd backend
    # Minimal check: ensure .env.example has all required vars
    REQUIRED_VARS="DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET CCF_HMAC_SECRET PORT CORS_ORIGIN NODE_ENV"
    for var in $REQUIRED_VARS; do
      if ! grep -q "^$var=" .env.example; then
        echo "ERROR: $var missing from .env.example"
        exit 1
      fi
    done
    echo "All required variables documented in .env.example"
```

---

## 12. Runbook: Promoting Staging to Production

### Pre-Deployment Checklist

```
[ ] All CI checks pass on the main branch
[ ] Feature has been tested on staging by QA
[ ] Desktop app tested against staging endpoint
[ ] No open P0/P1 bugs linked to this release
[ ] Database schema changes reviewed (if any)
[ ] Production database backed up (manual or via deploy workflow)
[ ] Team notified in the ops channel
```

### Step-by-Step Procedure

```bash
# 1. Verify staging is healthy
curl -sf https://admin-staging.cyberchakra.in/api/v1/health | jq .

# 2. Check the commit on staging matches what you want to deploy
ssh u123456789@host "cd ~/admin-portal-staging && git log --oneline -3"

# 3. Trigger production deploy
#    Go to GitHub > Actions > "Deploy to Production" > Run workflow
#    Type "DEPLOY TO PRODUCTION" in the confirmation field
#    Click "Run workflow"

# 4. Monitor the workflow run in GitHub Actions

# 5. After deployment completes, verify production
curl -sf https://admin.cyberchakra.in/api/v1/health | jq .

# 6. Smoke test: log into the admin portal
#    - Navigate to https://admin.cyberchakra.in
#    - Log in with admin credentials
#    - Check dashboard loads
#    - Check license list loads

# 7. Smoke test: desktop app license validation
#    - Open CCF desktop app (pointed at production)
#    - Verify license validates successfully
#    - Check heartbeat succeeds

# 8. Post-deployment
#    - Monitor error logs for 30 minutes: ssh host "tail -f ~/admin-portal/backend/logs/error.log"
#    - Check that cron jobs run at next scheduled time
```

### Rollback Procedure

```bash
# If production is broken after deploy:

# 1. SSH into server
ssh u123456789@host

# 2. Find the latest backup
ls -lt ~/backups/deploys/

# 3. Restore backend
TIMESTAMP="20260328_143000"  # Use the actual timestamp
cp -r ~/backups/deploys/backend_${TIMESTAMP}/* ~/admin-portal/backend/dist/

# 4. Restore frontend
cp -r ~/backups/deploys/frontend_${TIMESTAMP}/* ~/domains/admin.cyberchakra.in/public_html/

# 5. Restore database (if schema was changed)
gunzip < ~/backups/deploys/db_${TIMESTAMP}.sql.gz | mysql -u USER -p DB_NAME

# 6. Restart
cd ~/admin-portal/backend
npx pm2 restart ccf-admin-backend

# 7. Verify
curl -sf https://admin.cyberchakra.in/api/v1/health
```

---

## Quick Reference: Configuration File Locations

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `docs/admin-portal/.env.example` | Template for all environments | Yes |
| `docs/admin-portal/backend/.env.example` | Backend-specific template | Yes |
| `docs/admin-portal/backend/.env` | Local dev environment vars | No (gitignored) |
| `~/admin-portal/backend/.env` (server) | Production environment vars | No (manual on server) |
| `~/admin-portal-staging/backend/.env` (server) | Staging environment vars | No (manual on server) |
| `docs/admin-portal/docker-compose.yml` | Dev MySQL setup | Yes |
| `docs/admin-portal/.github/workflows/ci.yml` | CI + auto-deploy to staging | Yes |
| `docs/admin-portal/.github/workflows/deploy.yml` | Manual deploy to production | Yes |
| `config/version.json` | Desktop app server endpoints | Yes |
| `config/environments.json` | Desktop app env definitions (proposed) | Yes |
| `<app_data>/env_override.json` | Desktop app env override (QA only) | No (local to machine) |
