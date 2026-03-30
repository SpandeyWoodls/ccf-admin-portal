# CCF Admin Portal - System Status
Last verified: 2026-03-30

## Live URL: https://cyberchakra.online
## Login: admin@cyberchakra.in

## Health Check
- API: `GET /api/v1/health` returns `{"status":"ok"}` (verified)
- Frontend: Loads correctly (verified)

## Feature Status

### Working (Verified)
- [x] Login/Auth (JWT-based with refresh tokens, bcrypt passwords)
- [x] Dashboard (stats, charts, recent activity)
- [x] Create Organization (with contacts, CRUD routes)
- [x] Create License (admin routes with full CRUD, bulk generate/export/revoke/extend)
- [x] License Activate (public endpoint, HMAC token generation, perpetual license support)
- [x] License Validate (public endpoint, fresh HMAC token on each validation)
- [x] License Deactivate (public endpoint)
- [x] Heartbeat (public endpoint with legacy PHP redirect)
- [x] Announcements (CRUD with role-based write access)
- [x] Support Tickets (public create/reply + admin manage/assign/status)
- [x] Trial Requests (public submit + admin approve/reject)
- [x] Audit Log (admin-only, tracks all mutations)
- [x] RBAC (4 roles: super_admin, admin, support, viewer -- enforced per route)
- [x] Auto-deploy on git push (CI workflow deploys to staging on push to main)

### Partially Working
- [~] Release Wizard (triggers GitHub workflow_dispatch, passes version/channel/releaseNotes; auto-tagging added but end-to-end untested with real build)
- [~] Update Delivery (download routes exist: check-update, latest, download-stats; no published releases to serve yet)
- [~] Email Notifications (templates exist for trial approval/rejection, ticket replies; SMTP + sendmail transports implemented, SMTP credentials not yet configured on server)
- [~] Staged Rollouts (full backend: create rollout policy, advance stages, pause/resume/cancel/skip, soak time enforcement; frontend page exists; not tested with real traffic)
- [~] Version Blocking (backend routes for create/list/delete blocked versions with forceUpdateTo; not tested end-to-end)

### Not Yet Tested
- [ ] Desktop App pointing to live portal (Rust license client needs HMAC secret + API URL configured)
- [ ] Offline Validation (HMAC token signing aligned between Node and Rust, but not tested on device)
- [ ] NSIS Installer Hooks (installer framework present in desktop repo but not wired to portal)
- [ ] Production Deploy Workflow (deploy.yml exists with SSH/SCP, requires Hostinger secrets in GitHub)

## Repository Status

### ccf-admin-portal (main)
- Latest commit: `7cb90ee` - Fix: perpetual license HMAC signing, sendmail transport, release wizard notes
- Remote: https://github.com/SpandeyWoodls/ccf-admin-portal.git
- Branch: main (up to date with origin)

### cyber-chakra-forensics (windows-port)
- Latest commit: `191a272` - Fix CI/CD workflows: correct rust-toolchain action name, release build deps
- Remote: https://github.com/SpandeyWoodls/cyber-chakra-forensics
- Branch: windows-port (up to date with origin)

## Key Fixes Applied This Session
1. **Perpetual license HMAC signing** - validation-token.ts now uses "perpetual" sentinel for null expires_at, matching Rust convention
2. **Sendmail transport** - email.ts supports SMTP, sendmail binary (Hostinger VPS), or graceful no-op fallback
3. **Release wizard notes** - releaseNotes now passed through to GitHub workflow dispatch inputs
4. **Schema sync** - workflowRunId added to Release model for build tracking
5. **CI workflow fixes** - Corrected `dtolnay/rust-toolchain` action name (was `rust-action`), added missing Linux deps

## Next Steps
1. Configure SMTP credentials (or enable USE_SENDMAIL=true) on Hostinger VPS
2. Set up GitHub secrets for production deploy workflow (HOSTINGER_HOST, HOSTINGER_USER, HOSTINGER_SSH_KEY)
3. Test release wizard end-to-end: trigger build from portal -> GitHub Actions -> publish release
4. Point desktop app to https://cyberchakra.online/api/v1 and test full license lifecycle
5. Test offline validation with HMAC tokens on a machine without internet
