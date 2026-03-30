# CCF Admin Portal -- Critical Gaps Audit Report

**Date:** 2026-03-30
**Scope:** Full-stack audit of ccf-admin-portal (backend API, frontend SPA, security, desktop integration, release pipeline, legal compliance)
**Auditor:** Automated gap analysis across 13 audit dimensions

---

## 1. CRITICAL (Must Fix Before Production Use)

### C-01: No Password Change / Reset Mechanism
- **Description:** There is no endpoint for admins to change their password, nor any password-reset flow. The only password ever set is the seed value `ChangeMe123!`. Once deployed, an admin who forgets their password is permanently locked out, and the default seed password persists forever if nobody changes it directly in the database.
- **File:** `backend/src/routes/auth.routes.ts` (entire file -- missing PATCH /change-password, POST /forgot-password)
- **Severity:** CRITICAL -- security + operational
- **Fix effort:** 4-6 hours (add change-password endpoint, optional email-based reset)

### C-02: No MFA Implementation Despite Schema Column
- **Description:** The `admin_users` table has a `mfa_secret` column, but there is zero MFA code anywhere in the backend. For a law-enforcement forensics tool, multi-factor authentication is a baseline compliance requirement (ISO 27001, CJIS). Any attacker who obtains the single JWT secret can impersonate any admin.
- **File:** `backend/prisma/schema.prisma:138` (mfaSecret field), `backend/src/routes/auth.routes.ts` (login flow -- no MFA check)
- **Severity:** CRITICAL -- compliance + security
- **Fix effort:** 8-12 hours (TOTP implementation with speakeasy/otplib, enrollment flow, recovery codes)

### C-03: HMAC Validation Token Falls Back to Empty String
- **Description:** `validation-token.ts:16` uses `process.env.CCF_HMAC_SECRET || ""` -- if the env var is missing, the HMAC is computed with an empty secret. This means any attacker can forge valid offline validation tokens. The `license-key.ts` module correctly throws if the secret is missing, but `validation-token.ts` silently degrades.
- **File:** `backend/src/lib/validation-token.ts:16`
- **Severity:** CRITICAL -- license bypass
- **Fix effort:** 15 minutes (throw error instead of falling back to empty string)

### C-04: Mock Auth Bypass in Production Frontend
- **Description:** When the backend is unreachable (network error on fetch), the frontend `authStore.ts` falls back to creating a mock `super_admin` session with a fake token. If the frontend were served from a CDN while the API is momentarily down, any user could get a mock super_admin session. The mock fallback must be gated behind `NODE_ENV === 'development'` or removed entirely.
- **File:** `frontend/src/stores/authStore.ts:68-84`
- **Severity:** CRITICAL -- authentication bypass
- **Fix effort:** 30 minutes (wrap mock fallback in dev-only check)

### C-05: Semver Comparison Is String Equality Only
- **Description:** The update-check endpoint compares `currentVersion === latestRelease.version` using exact string equality. This means version `1.0.0` will be told to "update" to `1.0.0-beta.1` (different string), and version `0.9.0` will not be offered version `1.0.0` if a `0.9.1` was published later chronologically. No actual semver comparison (major.minor.patch) is performed.
- **File:** `backend/src/routes/license.public.routes.ts:898`
- **Severity:** CRITICAL -- desktop app may receive wrong updates or skip critical updates
- **Fix effort:** 1-2 hours (add semver package, compare properly)

### C-06: XSS in Email Templates (HTML Injection)
- **Description:** All email templates directly interpolate user-controlled strings (org names, ticket messages, rejection reasons, license keys) into HTML without escaping. An attacker can inject arbitrary HTML/JS via a ticket reply body, organization name, or trial request name, leading to stored XSS in admin email clients.
- **File:** `backend/src/services/email-templates.ts` (all template functions)
- **Severity:** CRITICAL -- stored XSS via email
- **Fix effort:** 2-3 hours (add HTML entity escaping to all interpolated values)

### C-07: Race Condition in Activation Count
- **Description:** License activation involves separate read-then-write operations without a transaction: (1) read active count, (2) check limit, (3) create activation, (4) update count. Two simultaneous activation requests can both pass the limit check and create activations beyond `maxActivations`.
- **File:** `backend/src/routes/license.public.routes.ts:230-277`
- **Severity:** CRITICAL -- license enforcement bypass
- **Fix effort:** 2-3 hours (wrap in prisma.$transaction with serializable isolation or use atomic increment with check)

### C-08: No CSRF Protection
- **Description:** The admin portal uses JWT Bearer tokens in Authorization headers (good), but the frontend stores tokens in localStorage and sends them automatically. There is no CSRF token mechanism. While Bearer tokens mitigate classic CSRF, the CORS configuration allows credentials. A more defense-in-depth approach is needed, especially since the admin portal manages law-enforcement forensics licenses.
- **File:** `backend/src/index.ts:93-100` (CORS config with credentials: true)
- **Severity:** HIGH (mitigated by Bearer auth pattern, but no defense-in-depth)
- **Fix effort:** 4-6 hours

### C-09: Sanitization Only Strips `<script>` Tags
- **Description:** The input sanitization middleware only strips `<script>` tags via regex. It does not handle `<img onerror=...>`, `<svg onload=...>`, `javascript:` URIs, event handler attributes, or any other XSS vector. This provides a false sense of security.
- **File:** `backend/src/middleware/sanitize.ts:22-23`
- **Severity:** CRITICAL -- insufficient XSS protection
- **Fix effort:** 1-2 hours (use a proper sanitization library like DOMPurify or sanitize-html, or encode all output)

### C-10: `dist/` Directory Committed to Repository
- **Description:** The `.gitignore` lists `dist/` and `backend/dist/`, but both `backend/dist/` and `frontend/dist/` directories exist in the working tree with compiled output. If these are committed, they leak compiled source, inflate the repo, and create merge conflicts. The `frontend/dist/` also exposes the production build on GitHub.
- **File:** `.gitignore`, `backend/dist/`, `frontend/dist/`
- **Severity:** HIGH -- repo hygiene, potential secret leakage in compiled output
- **Fix effort:** 30 minutes (git rm -r --cached dist directories)

---

## 2. HIGH (Fix Soon)

### H-01: No Admin User Management API
- **Description:** There are no endpoints to create, list, update, or delete admin users. The only way to create an admin is via the seed script. In production, if you need to add a support agent or revoke a compromised admin, you must directly modify the database.
- **File:** Missing file -- no `admin-user.admin.routes.ts`
- **Severity:** HIGH -- operational
- **Fix effort:** 6-8 hours

### H-02: No Session Invalidation on Password/Role Change
- **Description:** If an admin's role is changed or their account is deactivated directly in the database, all their existing JWT sessions remain valid until natural expiry (up to 1 hour for access tokens, 7 days for refresh tokens). The `requireAuth` middleware does check `isActive`, but the session-based refresh tokens are not invalidated.
- **File:** `backend/src/routes/auth.routes.ts` (no session purge on account changes)
- **Severity:** HIGH -- security
- **Fix effort:** 2-3 hours

### H-03: CI/CD Workflow Points to Wrong Directory
- **Description:** Both `.github/workflows/ci.yml` and `deploy.yml` use `working-directory: docs/admin-portal` and trigger on `paths: 'docs/admin-portal/**'`. But the actual codebase is at the repository root (`ccf-admin-portal/`), not under `docs/admin-portal/`. This means CI never runs and deploys will fail.
- **File:** `.github/workflows/ci.yml:3-9`, `.github/workflows/deploy.yml:36`
- **Severity:** HIGH -- CI/CD completely broken
- **Fix effort:** 30 minutes (update paths)

### H-04: No Rate Limiting on Refresh Token Endpoint
- **Description:** The `/api/v1/auth/refresh` endpoint has no specific rate limiter. It inherits the `adminLimiter` (100/min), but a compromised refresh token could be used to rapidly generate new access tokens.
- **File:** `backend/src/routes/auth.routes.ts:233`, `backend/src/index.ts:139`
- **Severity:** HIGH -- security
- **Fix effort:** 30 minutes

### H-05: No Pagination Limit Enforcement on Bulk Export
- **Description:** The `/api/v1/admin/bulk/export` endpoint fetches ALL matching licenses with no limit. With a large database (thousands of licenses), this could exhaust memory and crash the process or cause a very long response.
- **File:** `backend/src/routes/bulk.admin.routes.ts:227-228`
- **Severity:** HIGH -- reliability
- **Fix effort:** 1 hour (add streaming or pagination)

### H-06: Hardcoded Seed Password in Source Code
- **Description:** The seed script (`seed.ts:17`) hardcodes `ChangeMe123!` and the staging seed (`seed-staging.ts:25`) hardcodes `StagingPass123!`. Combined with C-01 (no password change flow), these passwords will persist into production.
- **File:** `backend/src/seed.ts:17`, `backend/src/seed-staging.ts:25`
- **Severity:** HIGH -- security
- **Fix effort:** 1 hour (read from env var, force password change on first login)

### H-07: No Automated Database Backup in Production
- **Description:** The `backup-db.sh` script exists but must be manually set up via cron on the server. There is no mention of automated backup configuration in the deployment workflow, and no backup verification or restore testing.
- **File:** `scripts/backup-db.sh`
- **Severity:** HIGH -- data loss risk
- **Fix effort:** 2-3 hours (integrate into deployment, add verification)

### H-08: No Connection Pooling Configuration
- **Description:** Prisma uses default connection pool settings. On Hostinger shared hosting, MySQL connections are limited. Under load, the application could exhaust the connection pool and crash.
- **File:** `backend/src/lib/prisma.ts` (no pool configuration)
- **Severity:** HIGH -- reliability
- **Fix effort:** 30 minutes (add connection_limit in DATABASE_URL or Prisma config)

### H-09: Docker Compose Uses Default MySQL Root Password
- **Description:** `docker-compose.yml` sets `MYSQL_ROOT_PASSWORD: password`. While this is for local dev, developers may accidentally use this configuration beyond local development.
- **File:** `docker-compose.yml:19`
- **Severity:** HIGH (local dev only, but risky pattern)
- **Fix effort:** 15 minutes (use env variable reference)

### H-10: Frontend Has No Automated Tests
- **Description:** There are zero test files in `frontend/src/`. No unit tests, no component tests, no E2E tests. For a security-critical admin portal, this is a significant quality gap.
- **File:** `frontend/` (missing test infrastructure entirely)
- **Severity:** HIGH -- quality
- **Fix effort:** 16-24 hours (set up Vitest + Testing Library, write critical path tests)

---

## 3. MEDIUM (Fix in Next Sprint)

### M-01: Settings Save Endpoint Not Implemented
- **Description:** The frontend `SettingsPage.tsx:447` has a TODO comment: "POST /api/v1/admin/settings when endpoint is built". The settings page UI exists but cannot actually save changes.
- **File:** `frontend/src/pages/SettingsPage.tsx:447`
- **Severity:** MEDIUM
- **Fix effort:** 4-6 hours

### M-02: Stale Activation Detection Has No User Notification
- **Description:** The `stale-activations` cron job detects activations with no heartbeat in 30+ days, but there is no notification sent to the org or admin. Stale activations silently consume activation slots.
- **File:** `backend/src/cron/stale-activations.ts`
- **Severity:** MEDIUM
- **Fix effort:** 2-3 hours

### M-03: No API Versioning Strategy
- **Description:** All routes are under `/api/v1/` but there is no mechanism for version negotiation or graceful deprecation. The legacy PHP redirects help, but there is no plan for v2 migration.
- **File:** `backend/src/index.ts:125-183`
- **Severity:** MEDIUM
- **Fix effort:** 2-4 hours (document strategy, add version header)

### M-04: Swagger Docs Source Path May Not Resolve in Production
- **Description:** `swagger.ts` references `apis: ["./src/routes/*.ts"]` which is a source-level path. In production, the compiled code runs from `dist/`, so swagger-jsdoc cannot find the JSDoc comments in `.ts` files. The Swagger UI will show an empty API.
- **File:** `backend/src/swagger.ts:50`
- **Severity:** MEDIUM -- documentation broken in production
- **Fix effort:** 1 hour (change to reference dist or pre-build spec JSON)

### M-05: No Graceful Shutdown Handling
- **Description:** The Express server does not handle `SIGTERM` or `SIGINT` for graceful shutdown. Active requests will be abruptly terminated on deploy, and cron `setInterval` timers will not be cleared.
- **File:** `backend/src/index.ts:226-237`
- **Severity:** MEDIUM -- reliability
- **Fix effort:** 1-2 hours

### M-06: LicenseActivation Unique Constraint May Block Re-Activation
- **Description:** The schema has `@@unique([licenseId, hardwareFingerprint])` on LicenseActivation. If a user deactivates and re-activates the same machine, the unique constraint blocks creating a new record. The current code re-uses the existing record, but this is fragile.
- **File:** `backend/prisma/schema.prisma:267`
- **Severity:** MEDIUM
- **Fix effort:** 2-3 hours (change to upsert pattern or soft-delete)

### M-07: No Health Check That Verifies Database Connectivity
- **Description:** The `/api/v1/health` endpoint returns `{ status: "ok" }` without actually querying the database. A server with a dead DB connection will report healthy.
- **File:** `backend/src/routes/license.public.routes.ts:682-684`
- **Severity:** MEDIUM -- monitoring
- **Fix effort:** 30 minutes (add a simple `SELECT 1` check)

### M-08: Frontend Error Boundary Missing
- **Description:** No React Error Boundary wraps the app. An unhandled exception in any component will white-screen the entire portal with no recovery.
- **File:** `frontend/src/App.tsx` (no ErrorBoundary)
- **Severity:** MEDIUM -- UX
- **Fix effort:** 1-2 hours

### M-09: No Request ID / Correlation ID
- **Description:** There is no request ID generated per request. Correlating frontend errors with backend logs is impossible in production.
- **File:** `backend/src/middleware/logger.ts`
- **Severity:** MEDIUM -- observability
- **Fix effort:** 1 hour

### M-10: BulkOperationsDialog Uses Demo/Fake License Keys
- **Description:** The frontend `BulkOperationsDialog.tsx` generates fake demo keys like `CCF-DEMO-0001-XXXX` for display purposes. If these mock values leak into API calls, they will create invalid records.
- **File:** `frontend/src/components/licenses/BulkOperationsDialog.tsx:529-535`
- **Severity:** MEDIUM
- **Fix effort:** 1 hour

---

## 4. LOW (Tech Debt)

### L-01: Duplicate PrismaClient Instantiation
- **Description:** `lib/audit.ts`, `services/featureFlags.ts`, and `lib/prisma.ts` each create their own `PrismaClient` instance. The singleton pattern in `lib/prisma.ts` is bypassed by the other two files, leading to multiple DB connection pools.
- **File:** `backend/src/lib/audit.ts:1`, `backend/src/services/featureFlags.ts:19`
- **Severity:** LOW -- resource waste
- **Fix effort:** 15 minutes (import from lib/prisma.ts)

### L-02: `BigInt.prototype.toJSON` Monkey-Patch
- **Description:** The global `BigInt.prototype.toJSON` override in `index.ts:121` is a fragile monkey-patch that affects all BigInt serialization globally. A more targeted approach (transform in Prisma middleware or custom serializer) would be safer.
- **File:** `backend/src/index.ts:121-123`
- **Severity:** LOW
- **Fix effort:** 1-2 hours

### L-03: No TypeScript Strict Mode in Backend
- **Description:** Backend uses non-null assertions (`req.admin!.id`) extensively, suggesting `strictNullChecks` may not be fully enabled or patterns rely on `!` operator.
- **File:** Multiple route files
- **Severity:** LOW
- **Fix effort:** 4-8 hours (enable strict, fix resulting errors)

### L-04: No API Response Type Contracts
- **Description:** Backend route handlers use `any` extensively for Prisma where clauses and response shaping. No shared type definitions between frontend and backend.
- **File:** Multiple route files (e.g., `license.admin.routes.ts:109`, `release.admin.routes.ts:59`)
- **Severity:** LOW
- **Fix effort:** 8-16 hours

### L-05: Backend Test Suite Uses Custom Runner, Not Standard Framework
- **Description:** All 5 test files use a custom `test()` helper with manual assertions instead of a real testing framework (Jest, Vitest). This means no test coverage reporting, no parallel execution, no watch mode, and no CI integration.
- **File:** `backend/src/__tests__/*.test.ts`
- **Severity:** LOW
- **Fix effort:** 8-12 hours (migrate to Vitest)

### L-06: Unused `multer` Dependency
- **Description:** `multer` is listed in backend `package.json` dependencies but is not imported anywhere in the source code.
- **File:** `backend/package.json:36`
- **Severity:** LOW -- unnecessary attack surface
- **Fix effort:** 5 minutes

### L-07: No Structured Logging
- **Description:** All logging uses `console.log/warn/error` with string messages. In production, these are hard to parse, filter, and aggregate. A structured logging library (winston, pino) would enable proper log management.
- **File:** All backend files
- **Severity:** LOW
- **Fix effort:** 4-6 hours

### L-08: Frontend Token Refresh Has No Automatic Scheduling
- **Description:** `authStore.ts` has a `refreshAuth()` method but nothing calls it automatically. Access tokens expire after 1 hour, and the user is silently redirected to login instead of transparently refreshing.
- **File:** `frontend/src/stores/authStore.ts:121-153`, `frontend/src/lib/api.ts:47-49`
- **Severity:** LOW -- UX friction
- **Fix effort:** 2-3 hours (add interceptor with auto-refresh on 401)

### L-09: No Content Security Policy Reporting
- **Description:** CSP is configured but has no `report-uri` or `report-to` directive. CSP violations happen silently with no visibility.
- **File:** `backend/src/index.ts:66-78`
- **Severity:** LOW
- **Fix effort:** 30 minutes

### L-10: Missing Prisma Migrations (Using db push Only)
- **Description:** `.gitignore` excludes `backend/prisma/migrations/` and the project uses `prisma db push` for schema changes. This means no migration history, no rollback capability, and no way to audit schema changes.
- **File:** `.gitignore`, `backend/package.json` scripts
- **Severity:** LOW (acceptable for early stage, but risky for production)
- **Fix effort:** 2-4 hours (switch to prisma migrate)

---

## 5. SUMMARY SCORECARD

| Dimension              | Score  | Key Issues                                                                                   |
|------------------------|--------|----------------------------------------------------------------------------------------------|
| **Backend API**        | 72/100 | Solid route coverage, good validation with Zod, comprehensive audit logging. Race conditions in activation, no admin user CRUD, no password management, settings endpoint missing. |
| **Frontend UI**        | 65/100 | Full page set with lazy loading, RBAC guards, command palette. No tests, mock auth bypass, no error boundary, no auto token refresh. |
| **Security**           | 45/100 | Helmet + rate limiting + bcrypt + HMAC present. But: no MFA, HMAC fallback to empty string, XSS in sanitizer and emails, no CSRF, no password change, mock auth bypass, hardcoded seed passwords. |
| **Desktop App Integration** | 78/100 | API contract matches Rust struct comments, HMAC validation tokens, heartbeat, announcements, update-check with rollout engine. String-only semver comparison is a critical gap. |
| **Release Pipeline**   | 40/100 | CI/CD YAML exists but points to wrong directory (broken). No Dockerfile. Manual deployment script. Webhook for GitHub releases is well-designed. No automated tests in CI. No staging smoke test automation. |
| **Legal Compliance**   | 35/100 | Law enforcement target market requires CJIS compliance (MFA mandatory), ISO 27001 audit trails (partially done), data retention policies (partially done), GDPR-style data subject rights (absent). No privacy policy, no terms of service, no data processing agreement template. |
| **Overall**            | **55/100** | The codebase has a solid architectural foundation with good separation of concerns, comprehensive audit logging, and a well-designed desktop app API contract. However, there are critical security gaps (no MFA, XSS vectors, HMAC fallback), operational gaps (no password management, no admin CRUD), and the CI/CD pipeline is non-functional. The project is suitable for internal testing/demo but NOT ready for production deployment to law enforcement customers without addressing at minimum all CRITICAL items. |

---

## Priority Fix Order

1. **C-03** HMAC empty string fallback (15 min)
2. **C-04** Mock auth bypass (30 min)
3. **C-09** Sanitization inadequacy (1-2 hrs)
4. **C-06** Email template XSS (2-3 hrs)
5. **C-05** Semver comparison (1-2 hrs)
6. **C-07** Activation race condition (2-3 hrs)
7. **C-01** Password change flow (4-6 hrs)
8. **C-02** MFA implementation (8-12 hrs)
9. **H-03** Fix CI/CD paths (30 min)
10. **H-01** Admin user management API (6-8 hrs)
11. **H-06** Remove hardcoded seed passwords (1 hr)
12. **C-08** CSRF defense-in-depth (4-6 hrs)

**Estimated total for all CRITICAL fixes: ~25-35 developer-hours**
**Estimated total for all CRITICAL + HIGH fixes: ~55-75 developer-hours**
