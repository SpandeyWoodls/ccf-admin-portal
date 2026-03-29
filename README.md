# CCF Admin Portal

Cloud admin dashboard for **Cyber Chakra Forensics** -- manages licenses, organizations, releases, support tickets, trial requests, analytics, and software distribution for the CCF desktop forensics application.

This portal replaces the legacy PHP license server with a full-stack TypeScript solution deployed on Hostinger Cloud.

---

## Tech Stack

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand 5, Recharts, Radix UI, React Hook Form + Zod |
| Backend    | Node.js 20, Express 4, TypeScript, Prisma ORM 6                           |
| Database   | MySQL 8.x                                                                  |
| Auth       | JWT (access + refresh tokens), bcryptjs, session tracking                  |
| Email      | Nodemailer (SMTP)                                                          |
| API Docs   | Swagger (swagger-jsdoc + swagger-ui-express)                               |
| CI/CD      | GitHub Actions (CI on push, auto-deploy staging, manual deploy production) |
| Hosting    | Hostinger Cloud VPS (admin.cyberchakra.in)                                 |

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+ (ships with Node.js 20)
- **MySQL** 8.x (via Docker or a local install)
- **Docker** (optional, for the local MySQL container)

---

## Quick Start (Local Development)

```bash
# 1. Navigate to the admin portal directory
cd docs/admin-portal

# 2. Copy the environment template into the backend
cp .env.example backend/.env

# 3. Install all dependencies (frontend + backend)
npm run install:all

# 4. Start MySQL
#    Option A -- Docker (recommended):
docker compose up -d
#    Option B -- local MySQL install:
#    mysql -u root -p -e "CREATE DATABASE ccf_admin_dev;"

# 5. Generate the Prisma client and push the schema
cd backend && npx prisma generate && cd ..
npm run db:push

# 6. Seed the database with a default admin account
npm run db:seed

# 7. Start frontend and backend concurrently
npm run dev

# Frontend:  http://localhost:5173
# Backend:   http://localhost:3001
# Swagger:   http://localhost:3001/api-docs  (if enabled)
```

The Vite dev server proxies `/api` requests to the backend automatically, so no separate `VITE_API_URL` is needed in development.

### Default Admin Login

| Field    | Value                  |
| -------- | ---------------------- |
| Email    | `admin@cyberchakra.in` |
| Password | `ChangeMe123!`         |

**Change this password immediately after first login.**

---

## Project Structure

```
admin-portal/
├── frontend/                        # React + Vite SPA
│   ├── src/
│   │   ├── App.tsx                  # Router and app shell
│   │   ├── main.tsx                 # Entry point
│   │   ├── index.css                # Tailwind base styles
│   │   ├── components/
│   │   │   ├── layout/              # DashboardLayout, Sidebar, Topbar, ProtectedRoute
│   │   │   ├── licenses/            # CreateLicenseDialog, BulkOperationsDialog
│   │   │   ├── organizations/       # CreateOrgDialog
│   │   │   ├── shared/              # DataTable, StatCard, CommandPalette, EmptyState, etc.
│   │   │   └── ui/                  # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── lib/                     # api.ts (Axios/fetch wrapper), utils.ts, toast.ts
│   │   ├── pages/                   # Route-level pages:
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── LicensesPage.tsx / LicenseDetailPage.tsx
│   │   │   ├── OrganizationsPage.tsx / OrgDetailPage.tsx
│   │   │   ├── ReleasesPage.tsx
│   │   │   ├── DownloadsPage.tsx
│   │   │   ├── TrialsPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── AuditPage.tsx
│   │   │   ├── AnnouncementsPage.tsx
│   │   │   ├── SupportPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── stores/                  # Zustand stores:
│   │       ├── authStore.ts
│   │       ├── dashboardStore.ts
│   │       ├── licenseStore.ts
│   │       ├── organizationStore.ts
│   │       ├── releaseStore.ts
│   │       ├── trialStore.ts
│   │       ├── auditStore.ts
│   │       ├── announcementStore.ts
│   │       └── supportStore.ts
│   ├── vite.config.ts               # Vite config with /api proxy
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                         # Express + Prisma API
│   ├── prisma/
│   │   └── schema.prisma            # 20 models, MySQL provider
│   ├── src/
│   │   ├── index.ts                 # Express app bootstrap
│   │   ├── env-check.ts             # Validates required env vars on startup
│   │   ├── healthcheck.ts           # Standalone health check script
│   │   ├── seed.ts                  # Seeds default admin user
│   │   ├── seed-staging.ts          # Seeds staging test data
│   │   ├── swagger.ts               # Swagger/OpenAPI setup
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── dashboard.routes.ts
│   │   │   ├── license.admin.routes.ts
│   │   │   ├── license.public.routes.ts   # Desktop app endpoints (activate, validate, deactivate)
│   │   │   ├── org.admin.routes.ts
│   │   │   ├── release.admin.routes.ts
│   │   │   ├── rollout.admin.routes.ts
│   │   │   ├── download.routes.ts
│   │   │   ├── trial.admin.routes.ts
│   │   │   ├── trial.public.routes.ts     # Desktop app trial request endpoints
│   │   │   ├── announcement.admin.routes.ts
│   │   │   ├── audit.admin.routes.ts
│   │   │   ├── bulk.admin.routes.ts
│   │   │   ├── support.admin.routes.ts
│   │   │   ├── support.public.routes.ts   # Desktop app support ticket endpoints
│   │   │   └── webhook.routes.ts          # GitHub Actions release webhook
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT verification
│   │   │   ├── errorHandler.ts      # Global error handler
│   │   │   ├── logger.ts            # Request logging
│   │   │   ├── rateLimiter.ts       # Rate limiting
│   │   │   ├── sanitize.ts          # Input sanitization
│   │   │   └── validate.ts          # Zod-based request validation
│   │   ├── lib/
│   │   │   ├── prisma.ts            # Prisma client singleton
│   │   │   ├── audit.ts             # Audit log helper
│   │   │   ├── license-key.ts       # License key generation (CCF-XXXX-XXXX format)
│   │   │   ├── response.ts          # Standardized response envelope
│   │   │   └── validation-token.ts  # HMAC validation tokens for desktop
│   │   ├── services/
│   │   │   ├── email.ts             # Nodemailer transport
│   │   │   ├── email-templates.ts   # HTML email templates
│   │   │   ├── featureFlags.ts      # License feature flag logic
│   │   │   └── rollout.ts           # Staged rollout engine
│   │   ├── cron/                    # Scheduled jobs (node-cron or manual runners)
│   │   │   ├── index.ts
│   │   │   ├── analytics-aggregation.ts / run-analytics-aggregation.ts
│   │   │   ├── heartbeat-cleanup.ts / run-heartbeat-cleanup.ts
│   │   │   ├── license-expiry.ts / run-license-expiry.ts
│   │   │   ├── session-cleanup.ts / run-session-cleanup.ts
│   │   │   └── stale-activations.ts / run-stale-activations.ts
│   │   └── __tests__/
│   │       ├── integration.test.ts          # End-to-end API test suite
│   │       └── desktop-api-compat.test.ts   # Verifies desktop Rust struct compatibility
│   └── package.json
│
├── scripts/                         # DevOps and deployment scripts
│   ├── deploy.sh                    # Builds and packages for Hostinger upload
│   ├── hostinger-setup.sh           # One-time server setup (deps, schema, seed)
│   ├── hostinger.htaccess           # LiteSpeed rewrite rules for deploy package
│   ├── backup-db.sh                 # MySQL backup with rotation (cron-friendly)
│   └── reset-staging.sh             # Wipe and re-seed staging database
│
├── specs/                           # Specifications and planning docs
│   ├── 001_database_schema.sql
│   ├── 002_api_specification.yaml
│   ├── 003_implementation_notes.sql
│   ├── MASTER_PLAN.md
│   ├── MIGRATION_STRATEGY.md
│   ├── ANALYTICS_DASHBOARD_SPEC.md
│   ├── DESKTOP_UPDATE_EXPERIENCE_SPEC.md
│   ├── UPDATE_DELIVERY_PIPELINE.md
│   ├── UPDATE_MANAGEMENT_UX_SPEC.md
│   ├── VERSION_CONTROL_AND_RELEASE_STRATEGY.md
│   └── CICD_BUILD_MATRIX_RELEASE_AUTOMATION.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Lint, typecheck, build, security audit; auto-deploy to staging
│       └── deploy.yml               # Manual production deployment with confirmation gate
│
├── .env.example                     # Root environment variable template
├── .htaccess                        # LiteSpeed config for admin.cyberchakra.in
├── .htaccess.license                # LiteSpeed config for license.cyberchakra.in
├── docker-compose.yml               # Local MySQL 8.0 for development
├── package.json                     # Root workspace scripts
├── DEPLOYMENT_CHECKLIST.md
├── ADMIN_PORTAL_SECURITY_ARCHITECTURE.md
├── ECOSYSTEM_ARCHITECTURE.md
├── ENVIRONMENT_MANAGEMENT.md
├── HOSTINGER_DEPLOYMENT_TOPOLOGY.md
└── INSTALLER_CUSTOMIZATION_AND_BRANDING.md
```

---

## Available Scripts

Run from the project root (`docs/admin-portal/`):

| Script                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start frontend (port 5173) and backend (port 3001) concurrently |
| `npm run dev:frontend`  | Start only the Vite dev server                                 |
| `npm run dev:backend`   | Start only the Express server (with `tsx watch`)               |
| `npm run build`         | Production build for both frontend and backend                 |
| `npm run install:all`   | Install dependencies in both frontend and backend              |
| `npm run db:push`       | Push Prisma schema to MySQL (create/update tables)             |
| `npm run db:seed`       | Seed database with default admin user                          |
| `npm run db:studio`     | Open Prisma Studio (visual database browser on port 5555)      |

Backend-only scripts (run from `backend/`):

| Script                       | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `npm run db:migrate`         | Create and apply Prisma migrations                         |
| `npm run db:generate`        | Regenerate Prisma client                                   |
| `npm run db:seed:staging`    | Seed staging database with test data                       |
| `npm run env:check`          | Validate that all required env vars are set                |
| `npm run test:integration`   | Run integration tests against a running backend            |
| `npm run healthcheck`        | Check if the backend health endpoint responds              |
| `npm run start`              | Start the compiled backend (production, from `dist/`)      |

---

## Environment Variables Reference

Copy `.env.example` to `backend/.env` and update the values. All variables and their purposes:

### Core (required)

| Variable             | Example                                          | Description                                        |
| -------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `DATABASE_URL`       | `mysql://root:password@localhost:3306/ccf_admin_dev` | MySQL connection string (Prisma format)         |
| `JWT_SECRET`         | 64+ character random string                      | Secret for signing access tokens                   |
| `JWT_REFRESH_SECRET` | 64+ character random string                      | Secret for signing refresh tokens                  |
| `CCF_HMAC_SECRET`    | Must match desktop app                           | HMAC secret shared with the CCF desktop app        |

### Server

| Variable    | Default                  | Description                                           |
| ----------- | ------------------------ | ----------------------------------------------------- |
| `NODE_ENV`  | `development`            | `development`, `staging`, or `production`             |
| `PORT`      | `3001`                   | Backend server port                                   |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (set to portal URL in production) |
| `LOG_LEVEL` | `debug`                  | Logging verbosity: `debug`, `info`, `warn`, `error`   |

### Authentication

| Variable                 | Default | Description                |
| ------------------------ | ------- | -------------------------- |
| `JWT_EXPIRES_IN`         | `1h`    | Access token lifetime      |
| `JWT_REFRESH_EXPIRES_IN` | `7d`    | Refresh token lifetime     |

### Email (SMTP)

Leave empty in development to skip email sending. Use [Mailtrap](https://mailtrap.io) for staging.

| Variable     | Default                   | Description                      |
| ------------ | ------------------------- | -------------------------------- |
| `SMTP_HOST`  | (empty)                   | SMTP server hostname             |
| `SMTP_PORT`  | `587`                     | SMTP port                        |
| `SMTP_SECURE`| `false`                   | Use TLS                          |
| `SMTP_USER`  | (empty)                   | SMTP username                    |
| `SMTP_PASS`  | (empty)                   | SMTP password                    |
| `SMTP_FROM`  | `noreply@cyberchakra.in`  | From address for outgoing emails |
| `PORTAL_URL` | `http://localhost:5173`   | Portal URL used in email links   |

### CI/CD Webhook

| Variable                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | Webhook signing secret (must match GitHub repo secret) |

### Frontend (Vite)

| Variable       | Default | Description                                                             |
| -------------- | ------- | ----------------------------------------------------------------------- |
| `VITE_API_URL` | (empty) | API base URL. Leave empty in dev to use the Vite proxy. Set in production. |

**Generate secrets with:** `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Desktop App Compatibility

The admin portal serves as the license server for the CCF Tauri desktop application. The following public endpoints are consumed by the desktop app's Rust code and must maintain exact JSON field names and types:

**License lifecycle** (via `license.public.routes.ts`):
- `POST /api/v1/license/activate` -- Activate a license on a machine
- `POST /api/v1/license/validate` -- Validate an active license
- `POST /api/v1/license/deactivate` -- Deactivate a license from a machine
- `POST /api/v1/heartbeat` -- Usage heartbeat with analytics

**Trial requests** (via `trial.public.routes.ts`):
- `POST /api/v1/trial-request` -- Submit a trial request from the app
- `GET  /api/v1/trial-request-status` -- Check trial request status

**Support** (via `support.public.routes.ts`):
- `POST /api/v1/support/ticket` -- Submit a support ticket from the app

**Announcements**:
- `GET  /api/v1/announcements` -- Fetch active announcements for the app

**Health**:
- `GET  /api/v1/health` -- Desktop app checks connectivity (expects HTTP 200)

The desktop app uses `serde_json` to deserialize these responses. Response format compatibility is verified by `backend/src/__tests__/desktop-api-compat.test.ts`. The `CCF_HMAC_SECRET` must match the value compiled into the desktop app for the same environment.

---

## Deployment to Hostinger

### Environments

| Environment | URL                                  | Deploy method               |
| ----------- | ------------------------------------ | --------------------------- |
| Staging     | `https://admin-staging.cyberchakra.in` | Auto-deploy on push to `main` |
| Production  | `https://admin.cyberchakra.in`       | Manual via GitHub Actions workflow_dispatch |

### One-time Hostinger setup

1. Create the subdomain `admin.cyberchakra.in` in hPanel
2. Activate the SSL certificate (Let's Encrypt)
3. Create a MySQL database in hPanel
4. Configure Node.js in hPanel: version 20, entry file `backend/dist/index.js`
5. Upload an SSH key for CI/CD access

### Manual deployment (first time or without CI/CD)

```bash
# Build the deployment package locally
./scripts/deploy.sh production

# Upload to the server
scp -r deploy-YYYYMMDD-HHMMSS/* user@hostinger-ip:~/

# SSH in and complete setup
ssh user@hostinger-ip
cd backend
npm ci --production
cp .env.template .env
nano .env                    # Fill in production secrets
npx prisma db push
bash ~/scripts/hostinger-setup.sh   # First time only

# Restart Node.js via hPanel
```

### CI/CD deployment

**Staging** -- Automatic. Pushing to `main` triggers `.github/workflows/ci.yml`, which builds both frontend and backend, deploys to Hostinger via SCP/SSH, runs `prisma db push`, and restarts the staging process.

**Production** -- Manual. Go to GitHub Actions, select the "Deploy to Production" workflow, and type `DEPLOY TO PRODUCTION` to confirm. The workflow creates a pre-deployment backup, deploys, applies the schema, and runs a health check.

### Required GitHub Secrets

| Secret               | Description                              |
| -------------------- | ---------------------------------------- |
| `HOSTINGER_HOST`     | Hostinger server IP or hostname          |
| `HOSTINGER_USER`     | SSH username                             |
| `HOSTINGER_SSH_KEY`  | Private SSH key for the server           |

### DNS records

| Subdomain              | Type | Target            |
| ---------------------- | ---- | ----------------- |
| `admin.cyberchakra.in` | A    | Hostinger VPS IP  |
| `license.cyberchakra.in` | A  | Same Hostinger IP (backward compatibility) |

### Database backups

The `scripts/backup-db.sh` script creates compressed MySQL dumps with 30-day rotation. Set up cron on the server:

```bash
# Production -- daily at 1:00 AM
0 1 * * * ~/admin-portal/scripts/backup-db.sh production >> ~/logs/db-backup.log 2>&1

# Staging -- weekly on Sunday at 2:00 AM
0 2 * * 0 ~/admin-portal/scripts/backup-db.sh staging >> ~/logs/db-backup.log 2>&1
```

---

## Testing

### Integration tests

The integration test suite runs against a live backend and exercises the full API surface (auth, CRUD, license lifecycle).

```bash
# Ensure the backend is running with a clean database
npm run dev:backend

# In another terminal
cd backend
npm run test:integration     # npx tsx src/__tests__/integration.test.ts
```

### Desktop API compatibility tests

Verifies that public endpoint responses match the exact JSON structure the desktop Rust app expects (field names, types, nesting). This prevents serde deserialization failures in production.

```bash
cd backend
npx tsx src/__tests__/desktop-api-compat.test.ts
```

### CI checks

Every push to paths under `docs/admin-portal/` triggers the CI workflow which:

1. Installs dependencies for frontend and backend
2. Generates the Prisma client
3. Runs TypeScript type checking (`tsc --noEmit`) on both frontend and backend
4. Validates that all required env vars are documented in `.env.example`
5. Builds both frontend and backend
6. Runs `npm audit` on both packages

### Staging reset

To wipe and re-seed the staging database with fresh test data:

```bash
# On the Hostinger server
~/admin-portal-staging/scripts/reset-staging.sh
```

This script refuses to run if `NODE_ENV=production` is detected.

---

## Database Models

The Prisma schema (`backend/prisma/schema.prisma`) defines 20 models:

| Model               | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `AdminUser`          | Portal admin accounts (super_admin, admin, support, viewer) |
| `AdminSession`       | JWT session tracking with refresh tokens       |
| `Organization`       | Customer organizations (government, law enforcement, etc.) |
| `Contact`            | Organization contact persons                   |
| `License`            | License keys with type, tier, status, and activation limits |
| `LicenseActivation`  | Per-machine activations with hardware fingerprints |
| `LicenseEvent`       | Immutable event log for license state changes  |
| `Heartbeat`          | Usage telemetry from desktop app instances     |
| `Release`            | Software versions with channel and severity    |
| `ReleaseAsset`       | Per-platform downloadable files (Windows, Linux) |
| `RolloutPolicy`      | Staged rollout configuration per release       |
| `RolloutStage`       | Individual rollout stages (percentage, soak time) |
| `BlockedVersion`     | Versions that should force-update              |
| `Download`           | Download tracking per asset                    |
| `Announcement`       | In-app announcements targeted by org/tier/version |
| `SupportTicket`      | Support tickets from desktop app users         |
| `TicketMessage`      | Messages within a support ticket thread        |
| `AuditLog`           | Admin action audit trail (immutable)           |
| `Setting`            | Key-value application settings                 |
| `TrialRequest`       | Trial license requests submitted from the app  |

---

## License

Proprietary -- Cyber Chakra Forensics. All rights reserved.
