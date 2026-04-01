# Cyber Chakra Forensics - Admin Portal Master Plan

**Date:** 2026-03-28
**Status:** Proposed
**Research:** 14-agent comprehensive audit of existing codebase + architecture research

---

## Executive Summary

This document proposes the architecture, design, and implementation roadmap for a **cloud-hosted Admin Portal** for Cyber Chakra Forensics (CMF). The portal will replace the existing PHP license server at `cyberchakra.online` with a modern, full-featured admin dashboard that manages licenses, customers, analytics, software distribution, and support.

**The portal serves two audiences:**
1. **CMF Company Admins** -- Dashboard to manage licenses, customers, analytics, releases, and support
2. **Desktop App (Machine-to-Server)** -- Public API endpoints for license activation, validation, heartbeat, updates, and announcements

---

## 1. Current State Audit

### What CMF Is
A **production-grade desktop forensics application** built with Tauri v2 (Rust + React 19) for law enforcement, forensic investigators, and legal professionals. Key stats:
- **60+ database tables** (SQLite with SQLCipher)
- **100+ Tauri IPC commands** (equivalent to API endpoints)
- **20+ forensic parsers** (WhatsApp, Instagram, Signal, Telegram, Gmail, etc.)
- **3-role RBAC** (Admin, Examiner, Viewer) + 6-role per-case RBAC
- **Section 65B BSA 2023** compliance for Indian courts

### Existing License Infrastructure
| Component | Current State |
|-----------|--------------|
| License Server | PHP at `https://cyberchakra.online/api` |
| Key Format | `CCF-XXXX-XXXX-XXXX-XXXX` (HMAC-SHA256 checksum) |
| Activation | Hardware fingerprint binding (SHA256 of machine ID + CPU + motherboard + MAC + disk) |
| Validation | Online check every 30 days, 30-day offline grace period |
| Heartbeat | Reports cases_created, acquisitions, reports_generated |
| Updates | Tauri plugin updater checks `update-check.php` |
| Downloads | `cyberchakra.online/portal/downloads.php` |

### What's Missing (Why We Need the Portal)
- No unified admin dashboard (admin features scattered across Settings tabs)
- No customer/organization management
- No analytics or usage insights
- No release management (manual file uploads)
- No staged rollouts or version blocking
- No trial-to-paid conversion tracking
- No support ticket management from admin side
- No bulk license operations
- No revenue/billing tracking

---

## 2. Technology Stack

### Recommended Stack

| Concern | Choice | Reasoning |
|---------|--------|-----------|
| **Framework** | Next.js 15 (App Router) | Server Components for data-dense dashboards; Server Actions eliminate API boilerplate; Route Handlers for desktop app API |
| **Database** | PostgreSQL on Neon | Serverless auto-scaling; DB branching for preview deploys; native connection pooling |
| **ORM** | Drizzle ORM | SQL-first (team writes raw SQL in Rust daily); serverless-native; no codegen; 36KB vs Prisma's 600KB |
| **Admin Auth** | Clerk | Built-in MFA, roles, organizations, audit logs; `@clerk/nextjs` first-class integration |
| **Hosting** | Vercel | Zero-config Next.js deploy; edge middleware; cron jobs; custom domains |
| **Styling** | Tailwind CSS + shadcn/ui | Identical design system as desktop app for brand consistency |
| **Real-time** | SSE + Vercel KV (Redis) | Unidirectional push for live dashboard; serverless-compatible |
| **API (Internal)** | Server Actions | Type-safe mutations for admin UI; no fetch/state management needed |
| **API (External)** | REST Route Handlers | Desktop app speaks HTTP/JSON via Rust's `reqwest` |
| **Validation** | Zod v4 | Already used in desktop app; schemas can be shared |
| **Charts** | Recharts | Already used in desktop app |
| **Tables** | TanStack Table | Already used in desktop app |
| **Icons** | Lucide React | Already used in desktop app |

### What to Reuse from Desktop App
- **Copy:** shadcn/ui components, Tailwind config/CSS variables, design tokens, Zod schemas, TypeScript type definitions for license API
- **Don't copy:** Zustand stores (Server Components replace client state), Tauri-specific code, authStore (Clerk replaces it)

### What NOT to Use
- **Not Supabase** -- bundles auth/storage you won't use; Neon gives pure Postgres without overhead
- **Not PlanetScale** -- MySQL; team expertise is SQLite/PostgreSQL
- **Not NextAuth** -- requires building your own user management, roles, MFA
- **Not tRPC** -- desktop app is a Rust HTTP client, not a TypeScript tRPC client
- **Not GraphQL** -- overkill for two well-defined clients (admin UI + desktop app)
- **Not WebSockets** -- no bidirectional need; SSE is simpler for serverless

---

## 3. Portal Modules

### 3.1 Authentication & Admin Management
- **Clerk-powered** authentication with mandatory MFA (TOTP + WebAuthn)
- **4 admin roles:** Super Admin, Admin, Support, Viewer
- IP whitelisting for admin access
- Session management with audit logging
- All admin actions logged to immutable audit trail

### 3.2 License Management
The core module -- replaces the existing PHP license server.

**License Tiers:**

| Tier | Target | Max Activations | Key Features |
|------|--------|----------------|--------------|
| **Individual** | Solo examiner | 1 machine | Logical acquisition, WhatsApp parser, basic reports |
| **Team** | Lab teams (3-10) | 5 machines | + Physical imaging, multi-user, cloud acquisition |
| **Enterprise** | Large forensic labs | 25 machines | + Advanced analytics, API access, custom reports |
| **Government** | Law enforcement | 50+ machines | + Section 65B tools, offline deployment, audit export |

**Key Features:**
- License generation with HMAC-SHA256 checksum (compatible with existing desktop client)
- License lifecycle: Issue -> Activate -> Validate -> Renew/Revoke
- Hardware binding management (view machines, force deactivate, transfer)
- Bulk operations (generate N licenses, CSV import/export)
- Trial management with conversion tracking
- Feature flags per license (physical imaging, cloud acquisition, etc.)
- Expiry alerts and renewal workflows

**Dashboard Metrics:**
- Total active licenses (with trend)
- Expiring within 30 days
- Trial conversion rate
- Revenue summary
- Usage heatmap by organization

### 3.3 Customer/Organization Management
A lightweight CRM built for forensics software sales.

**Organization Model:**
- Types: Government Agency, Private Forensic Lab, Law Firm, Academic, Individual
- Indian tax compliance (GST/PAN/TAN numbers)
- Parent/child hierarchy (headquarters + branches)
- Multiple contacts per org (primary, billing, technical, decision maker)

**Customer Lifecycle:**
- Lead -> Trial -> Customer -> Renewal pipeline
- Health scoring (usage + engagement + adoption + recency)
- Churn risk detection (declining usage alerts)
- Activity log and communication history

**Invitation System:**
- Email-based invitation with approval workflow
- Self-service signup with auto-screening (auto-approve `@gov.in`/`@nic.in` domains)
- Organization onboarding wizard

### 3.4 Analytics Dashboard
Comprehensive usage analytics from desktop app telemetry.

**Executive KPIs:**
- Monthly/Daily Active Users (MAU/DAU)
- DAU/MAU stickiness ratio
- Feature adoption rates (which extraction types used most)
- License utilization (active vs total seats)
- Version adoption (% on latest)
- Geographic distribution
- Case volume trends
- Revenue metrics (ARR, MRR, churn rate, net revenue retention)

**Customer Health Scoring:**
- Composite 0-100 score: Usage (35%) + Engagement (25%) + Adoption (20%) + Recency (20%)
- Five segments: Champion, Healthy, At Risk, Critical, Dormant
- Automated alerts for declining usage patterns
- Upsell identification (seat utilization >85% + high feature adoption)

**Enhanced Telemetry** (extend desktop app heartbeat):
- Per-extraction-type breakdowns
- Performance metrics (acquisition speed, app health)
- Feature usage flags (10 trackable features)
- Error summaries (common failures)
- Heartbeat frequency: 4h active, 24h idle

**Privacy Safeguards:**
- NO case details, evidence data, suspect names, FIR numbers, or device serials leave the desktop app
- PII hashed (SHA256 for emails/machine names in analytics)
- IP addresses discarded after rate-limiting
- Opt-out capability
- Compliance: IT Act 2000, DPDP Act 2023, ISO 27001

### 3.5 Software Distribution & Updates
Replace manual PHP-based download portal.

**Download Portal:**
- Authenticated downloads (license key required)
- Platform auto-detection (Windows/Linux)
- Version history with changelogs (markdown)
- Beta/stable channels per organization
- Download analytics (who, what, when)
- SHA256 checksums with copy-to-clipboard

**Release Management:**
- GitHub Actions integration (auto-publish builds from CI/CD)
- Release notes editor (markdown -> rendered HTML)
- Asset management (upload binaries, signatures)
- Draft -> Published -> Deprecated -> Yanked lifecycle

**Staged Rollouts:**
- Percentage-based rollout (10% -> 50% -> 100%)
- Targeted rollout (specific orgs or tiers)
- Deterministic hash for consistent rollout decisions
- Configurable soak time per stage (e.g., 24h before advancing)
- Health monitoring during rollout
- Automatic or manual stage advancement

**Version Blocking & Rollback:**
- Block specific versions (security issues)
- Force-update to safe version
- Rollback = block bad version + re-point to known-good
- Desktop app's Tauri updater handles "downgrade" updates

**Update Check API:**
- Replaces `update-check.php`
- Returns Tauri updater JSON format (non-negotiable, dictated by `tauri-plugin-updater`)
- Respects rollout policies, version blocks, and channel assignments
- Injects license key + fingerprint via custom headers

### 3.6 Announcements & Notifications
- In-app announcements displayed in desktop app
- Targeting: global, by org, by tier, by version, by platform
- Types: info, warning, critical, maintenance
- Dismissible vs persistent
- Action buttons (deep links: `ccf://update`, or HTTPS URLs)
- Email notifications for new releases, expiry warnings
- Maintenance window announcements

### 3.7 Support Ticket System (Basic)
- Ticket creation from admin portal + desktop app
- Threaded messages with internal notes
- SLA tracking per license tier
- Feature request tracking with org voting
- Bug severity classification
- Knowledge base links

### 3.8 Settings & Configuration
- Admin user management
- Portal configuration
- Email template management
- Webhook configuration
- API key management for programmatic access

---

## 4. Database Schema (Key Tables)

**17 tables** in PostgreSQL:

| Table | Purpose |
|-------|---------|
| `organizations` | Customer orgs with type, GST, parent/child, soft-delete |
| `contacts` | People within orgs; role-based (primary, billing, technical) |
| `licenses` | License keys with type/tier/status/expiry/feature flags (JSONB) |
| `license_activations` | Machine bindings with fingerprint, OS, app version |
| `license_events` | Immutable audit trail of all license operations |
| `analytics_events` | Raw usage telemetry from desktop app |
| `analytics_daily` | Pre-aggregated daily stats (materialized) |
| `releases` | Software versions with semver, channel, severity |
| `release_assets` | Per-platform binaries with SHA-256 hashes, Tauri signatures |
| `downloads` | Download tracking with completion status |
| `announcements` | In-app messages with targeting rules (JSONB) |
| `admin_users` | Portal admins with MFA (TOTP + backup codes) |
| `admin_sessions` | JWT session tracking with refresh tokens |
| `admin_audit_log` | Immutable admin action log (trigger prevents UPDATE/DELETE) |
| `support_tickets` | Tickets with threaded messages and SLA tracking |
| `invoices` | Basic billing with INR default, GST support |
| `trial_conversions` | Trial-to-paid funnel tracking |

Full SQL schema: `docs/admin-portal/001_database_schema.sql`
Full API specification: `docs/admin-portal/002_api_specification.yaml`

---

## 5. API Design

### Two API Surfaces

**1. Admin API** (Clerk JWT auth, internal use):
- Server Actions for mutations (no REST needed for admin UI)
- Used by admin portal frontend only

**2. Public API** (license key auth, external use):
- REST Route Handlers compatible with existing desktop app

### Public API Endpoints (Desktop App Compatibility)

| Endpoint | Method | Purpose | Replaces |
|----------|--------|---------|----------|
| `/api/v1/license/activate` | POST | Bind license to machine | `activate.php` |
| `/api/v1/license/validate` | POST | Check license validity | `validate.php` |
| `/api/v1/license/deactivate` | POST | Release activation slot | `deactivate.php` |
| `/api/v1/heartbeat` | POST | Usage stats + server commands | `heartbeat.php` |
| `/api/v1/update-check` | POST | Check for new version | `update-check.php` |
| `/api/v1/announcements` | GET | Fetch active announcements | `announcements.php` |
| `/api/v1/download/{releaseId}/{platform}` | GET | Download binary | `downloads.php` |
| `/api/v1/support/ticket` | POST | Submit support ticket | -- (new) |
| `/api/v1/analytics` | POST | Batch telemetry submission | -- (new) |

**Migration Strategy:** Zero desktop app changes required. Use nginx URL rewrites from `.php` paths to new `/api/v1/` routes. The desktop app's 30-day offline grace period provides a natural safety buffer during cutover.

---

## 6. UI/UX Design

### Design System
- **Reuse** desktop app's shadcn/ui + Tailwind CSS design system
- **Primary color:** Steel blue (HSL 213 72% 48%) -- consistent with desktop app brand
- **Default theme:** Dark mode (power users, long monitoring sessions)
- **Font:** Geist (sans) + Geist Mono (code)
- **No Framer Motion** -- admin needs speed, not flair; CSS transitions only

### Navigation Structure
Collapsible left sidebar (260px expanded, 64px collapsed):

```
OVERVIEW
  Dashboard

MANAGEMENT
  Organizations
  Licenses
  Users (admin portal users)

INTELLIGENCE
  Analytics
  Telemetry

OPERATIONS
  Downloads & Releases
  Announcements
  Support Tickets

SYSTEM
  Settings
  Audit Log
```

### Dashboard Layout
```
+------------------------------------------------------------------+
| [KPI Card: Active    ] [KPI Card: Expiring ] [KPI Card: MAU     ]|
| [Licenses: 347 +12% ] [Soon: 12           ] [Users: 89  +5%    ]|
| [                    ] [                   ] [                   ]|
| [KPI Card: Revenue   ] [KPI Card: Trial    ] [KPI Card: Version ]|
| [MRR: 12.5L  +8%    ] [Conversion: 67%    ] [Latest: 78%       ]|
+------------------------------------------------------------------+
|                          |                                        |
| License Distribution     | Activations Over Time (12mo)           |
| [Donut Chart]            | [Line Chart with trend]                |
|                          |                                        |
+---------------------------+---------------------------------------+
|                                                                    |
| Recent Activity Feed               | Quick Actions                |
| - 2m ago: CBI activated CCF-AB**   | [+ New License]              |
| - 1h ago: NIA validated CCF-CD**   | [+ New Organization]         |
| - 3h ago: Trial started for ...    | [Publish Release]            |
|                                     | [Send Announcement]          |
+-------------------------------------+----------------------------+
```

### Design Inspiration
Draw from: **Vercel** (clean metrics), **Linear** (fast keyboard-first UX), **Stripe** (data tables + detail views), **Retool** (admin density), **Clerk** (auth flows)

---

## 7. Security Architecture

### Critical Requirements (Forensics Software Admin)

1. **MFA is mandatory** -- TOTP with replay prevention, WebAuthn as secondary, recovery codes as backup. No "skip" option.

2. **Host everything in India** -- AWS Mumbai (ap-south-1) primary, Hyderabad DR. Government customers demand data residency.

3. **Column-level encryption** for PII and license keys using envelope encryption (KMS master key -> DEK -> data).

4. **CERT-In compliance** -- 6-hour incident reporting, 180-day log retention, NTP sync to NPL servers (per April 2022 directions).

5. **Immutable audit logs** -- SHA-256 hash chain (matching desktop app's pattern), database triggers prevent UPDATE/DELETE.

6. **The HMAC secret** (`CCF_HMAC_SECRET`) is the single most critical secret -- enables unlimited license generation if compromised. Must be in AWS Secrets Manager.

### API Security
- Rate limiting: 60 requests/hour per license key, 10/hour per unauthenticated IP
- CORS: Only allow `cyberchakra.online` origin
- Input validation: Zod schemas on all endpoints
- Short-lived download tokens (5-min signed JWTs)
- Binary integrity: SHA-256 at upload, re-computed server-side (never trust client hash)

### Compliance
- IT Act 2000 (India)
- DPDP Act 2023 (India's data protection)
- GDPR (if selling internationally)
- Penetration test by CERT-In empaneled vendor before onboarding government customers

---

## 8. Implementation Roadmap

### Phase 1 -- Foundation & MVP (Weeks 1-6)

**Goal:** Replace the PHP license server with the new portal. Admins can log in, manage licenses, and manage organizations. Desktop app works seamlessly.

| Week | Focus | Deliverables |
|------|-------|-------------|
| 1-2 | **Infrastructure** | Next.js project setup, Neon DB, Drizzle schema, Clerk auth, Vercel deploy, CI/CD pipeline |
| 3-4 | **License Management** | License CRUD, activation/deactivation, public API (activate, validate, deactivate, heartbeat), hardware binding view |
| 5 | **Customer Management** | Organization CRUD, contacts, license-to-org binding, basic search |
| 6 | **Dashboard MVP** | KPI cards, license distribution chart, recent activity feed, expiring-soon table |

**Critical Path:** Public API compatibility with desktop app. The activation/validation endpoints must return byte-identical JSON to what the Rust `serde_json::from_str` expects.

**Migration:** Run new portal in parallel with PHP server. Nginx rewrites route traffic. 30-day offline grace period = natural safety buffer.

### Phase 2 -- Analytics & Distribution (Weeks 7-10)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 7-8 | **Analytics Dashboard** | Heartbeat collection, usage charts, version distribution, MAU/DAU, customer health scores |
| 9 | **Release Management** | Release CRUD, asset upload, publish workflow, GitHub Actions webhook integration |
| 10 | **Download Portal** | Authenticated downloads, platform detection, update-check API (replaces `update-check.php`), staged rollout engine |

### Phase 3 -- Growth & Polish (Weeks 11-14)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 11 | **Announcements** | CRUD, targeting rules, desktop app fetch endpoint, email notifications |
| 12 | **Support System** | Ticket CRUD, threaded messages, SLA tracking, feature request voting |
| 13 | **Bulk Operations** | Bulk license generation, CSV import/export, bulk revoke/extend |
| 14 | **Audit & Billing** | Immutable audit log with hash chain, basic invoice tracking (GST-compliant), revenue dashboard |

### Phase 4 -- Scale & Optimize (Weeks 15-18)

| Week | Focus | Deliverables |
|------|-------|-------------|
| 15 | **Performance** | Redis caching (Vercel KV), SSE real-time dashboard, materialized views for analytics |
| 16 | **Advanced Security** | WebAuthn MFA, API v2 with OpenAPI docs, webhook system |
| 17 | **Integrations** | Slack notifications, email templates (SendGrid/AWS SES), scheduled reports |
| 18 | **Hardening** | Penetration test, CERT-In compliance audit, load testing, documentation |

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API response format mismatch | Desktop app breaks | Snapshot-test every response against Rust struct definitions; parallel-run both servers |
| Hardware fingerprint data loss during migration | Licenses deactivated | Export fingerprints from PHP DB first; validate row counts match |
| HMAC secret exposure | Unlimited license generation | AWS Secrets Manager from day 1; separate debug/release secrets |
| Neon serverless cold starts | Slow admin dashboard | Keep connection warm with Vercel cron; use Neon's serverless driver |
| Government customer data residency | Legal non-compliance | Host on AWS Mumbai (ap-south-1) from the start |
| Desktop app offline during cutover | Users locked out | 30-day grace period is the natural safety net |

---

## 9. Project Directory Structure

```
ccf-admin-portal/
  app/
    (auth)/                         # Clerk auth pages
      sign-in/[[...sign-in]]/page.tsx
      sign-up/[[...sign-up]]/page.tsx
    (dashboard)/                    # Authenticated admin pages
      layout.tsx                    # Sidebar + top bar + breadcrumbs
      page.tsx                      # Dashboard overview
      licenses/
        page.tsx                    # License list (Server Component)
        [id]/page.tsx               # License detail + activations
        new/page.tsx                # Issue new license
      organizations/
        page.tsx                    # Org list
        [id]/page.tsx               # Org detail + contacts + licenses
        new/page.tsx                # Create org
      analytics/
        page.tsx                    # Analytics dashboard
        telemetry/page.tsx          # Raw telemetry explorer
      releases/
        page.tsx                    # Release list
        [id]/page.tsx               # Release detail + assets
        new/page.tsx                # Create release
      announcements/
        page.tsx                    # Announcement list
        new/page.tsx                # Create announcement
      support/
        page.tsx                    # Ticket list
        [id]/page.tsx               # Ticket detail + messages
      audit/page.tsx                # Audit log viewer
      settings/page.tsx             # Portal settings
    api/                            # Public API for desktop app
      v1/
        license/
          activate/route.ts
          validate/route.ts
          deactivate/route.ts
        heartbeat/route.ts
        update-check/route.ts
        announcements/route.ts
        download/[releaseId]/[platform]/route.ts
        analytics/route.ts
        support/ticket/route.ts
      webhooks/
        github/route.ts             # GitHub Actions webhook
  components/
    ui/                             # shadcn/ui (copied from desktop app config)
    dashboard/                      # Dashboard widgets
    licenses/                       # License-specific components
    organizations/                  # Org-specific components
    analytics/                      # Charts and metrics
  lib/
    db/
      schema.ts                     # Drizzle schema (all 17 tables)
      index.ts                      # Drizzle client + Neon connection
      migrations/                   # Auto-generated SQL migrations
    actions/                        # Server Actions
      license-actions.ts
      organization-actions.ts
      release-actions.ts
      announcement-actions.ts
      support-actions.ts
    validators/                     # Zod schemas
      license.ts
      organization.ts
      analytics.ts
    crypto/
      license-key.ts                # Key generation (CCF-XXXX format)
      hmac.ts                       # HMAC-SHA256 for validation tokens
      fingerprint.ts                # Fingerprint verification
    utils/
      format.ts                     # Currency, date, number formatting
      constants.ts                  # License tiers, roles, etc.
  middleware.ts                     # Clerk auth + rate limiting + CORS
  drizzle.config.ts                # Drizzle Kit config
  vercel.json                      # Vercel config (cron jobs, rewrites)
  .env.local                       # Local environment variables
  .env.example                     # Template
```

---

## 10. Desktop App Changes Required

The admin portal can be deployed with **zero desktop app changes** initially (nginx rewrites handle PHP-to-new-API routing). However, these changes are recommended for Phase 2+:

1. **Extend `Announcement` struct** (`src-tauri/src/licensing/mod.rs`) -- add `id`, `title`, `priority`, `action_url`, `action_label`, `dismissible`, `starts_at`, `expires_at`

2. **Add license key header to update checker** -- inject `X-License-Key` and `X-Hardware-Fingerprint` headers for rollout targeting

3. **Enhanced heartbeat** -- extend `UsageStats` with per-extraction-type breakdowns, feature usage flags, performance metrics, error summaries

4. **Update endpoint URL** -- point to new versioned API when ready: `/api/v1/update-check` (from `/api/update-check.php`)

---

## 11. Cost Estimates

### Monthly Infrastructure (Estimated)

| Service | Tier | Estimated Cost |
|---------|------|---------------|
| Vercel | Pro ($20/mo) | $20/mo |
| Neon | Launch ($19/mo) | $19/mo |
| Clerk | Pro ($25/mo for 1000 MAU) | $25/mo |
| Vercel KV (Redis) | Hobby (included) | $0/mo |
| Domain (cyberchakra.online) | Already owned | $0/mo |
| **Total** | | **~$64/mo (~5,300 INR/mo)** |

*Scales to Pro tiers as needed. Government hosting on AWS Mumbai adds ~$50-100/mo for a small RDS instance if Neon's US data residency is a concern.*

---

## 12. Next Steps

1. **Review this plan** -- align on scope, priorities, and any additions
2. **Set up project** -- Initialize Next.js 15 project with the proposed structure
3. **Database schema** -- Run `001_database_schema.sql` on Neon
4. **Phase 1 Sprint 1** -- Auth (Clerk) + License CRUD + Public API activate/validate
5. **Parallel run** -- Deploy alongside PHP server, validate response compatibility
6. **Cutover** -- Point desktop app to new endpoints

---

## Appendix: Research Documents

| Document | Location | Agent |
|----------|----------|-------|
| Database Schema (SQL) | `docs/admin-portal/001_database_schema.sql` | Agent 13 |
| API Specification (OpenAPI) | `docs/admin-portal/002_api_specification.yaml` | Agent 13 |
| Implementation Notes (SQL) | `docs/admin-portal/003_implementation_notes.sql` | Agent 13 |
| Analytics Dashboard Spec | `docs/admin-portal/ANALYTICS_DASHBOARD_SPEC.md` | Agent 8 |
| UI/UX Design Spec | `docs/ADMIN_PORTAL_UI_UX_DESIGN.md` | Agent 10 |
| Customer/Org Management | `docs/master-plan/phase-5-commercial-readiness/CUSTOMER_ORG_MANAGEMENT_DESIGN.md` | Agent 9 |
| Security Architecture | `ADMIN_PORTAL_SECURITY_ARCHITECTURE.md` | Agent 12 |
| Implementation Roadmap | `RESEARCH/14_implementation_roadmap.md` | Agent 14 |
