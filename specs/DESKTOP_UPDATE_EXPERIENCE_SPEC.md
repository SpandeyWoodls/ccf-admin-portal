# Desktop App Update Experience -- Complete Design Specification

**Agent:** 11 -- Desktop App Update Experience Researcher
**Date:** 2026-03-28
**Status:** Proposed
**Depends on:** MASTER_PLAN.md (Section 3.5), 002_api_specification.yaml (PublicUpdateCheck*)

---

## Executive Summary

This document specifies every interaction between the CMF desktop user and the software update system. It covers update check triggers, notification UX, download/install flow, forced security updates, air-gapped/offline installations, settings, update history, and every error path. The design accounts for:

- **Existing infrastructure:** `tauri-plugin-updater` (already in `lib.rs` line 60), `UpdateChecker.tsx` component, `@tauri-apps/plugin-updater` frontend, `check()` / `downloadAndInstall()` / `relaunch()` API surface.
- **Admin portal API:** `POST /api/public/v1/update-check` returning Tauri updater JSON format (`version`, `notes`, `pub_date`, `platforms`), with `is_mandatory`/`is_security` flags, staged rollouts, and version blocking.
- **License integration:** `licenseStore.ts` already has `UpdateInfo` with `is_mandatory`, `checkForUpdates()` via Rust IPC, and announcements piggybacked on validation.

---

## 1. Update Check Triggers

### 1.1 Recommended Strategy: Layered Approach (All Combined)

| Trigger | When | How | Rationale |
|---------|------|-----|-----------|
| **Post-login** | After successful auth, before showing Dashboard | Silent background fetch | User is waiting for Dashboard to load anyway; catches updates at natural entry point |
| **Periodic background** | Every 4 hours while app is open | `setInterval` with visibility check | Catches updates during long lab sessions without interrupting work |
| **License validation piggyback** | Every validation call (30-day cycle, or forced) | Server includes `update_available` flag in validation response | Zero extra network cost; server can push forced updates |
| **Manual** | User clicks "Check for Updates" in Settings | Explicit user action, shows spinner | User agency; troubleshooting aid |
| **Announcement-triggered** | Server sends announcement with `action_url: "ccf://update"` | Announcement card in app includes "Update Now" button | Admin can push update awareness without waiting for periodic check |

### 1.2 Why NOT Check Before Login

Checking before login creates two problems:
1. **License key unavailable** -- the update-check API needs `X-License-Key` for rollout targeting and channel assignment. Before login, the app has no authenticated session.
2. **Blocking startup** -- a slow network or timeout blocks the user from doing anything. Forensic examiners in field situations need the app accessible immediately.

**Decision:** Check AFTER login completes, in a non-blocking background task. The `Dashboard` component mount triggers it, not the login form.

### 1.3 Implementation: Update Check Orchestrator

```typescript
// src/services/updateCheckService.ts

import { check } from '@tauri-apps/plugin-updater';
import { useLicenseStore } from '@/stores/licenseStore';

interface UpdateCheckConfig {
  autoCheck: boolean;          // default: true
  checkFrequency: 'startup_only' | 'every_4h' | 'every_12h' | 'daily';
  channel: 'stable' | 'beta';
  skippedVersions: string[];   // versions user chose to skip
}

const CHECK_INTERVALS: Record<string, number> = {
  startup_only: 0,
  every_4h:  4 * 60 * 60 * 1000,
  every_12h: 12 * 60 * 60 * 1000,
  daily:     24 * 60 * 60 * 1000,
};

class UpdateCheckService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastCheckTimestamp: number = 0;

  /**
   * Called once after login succeeds and Dashboard mounts.
   * Starts the initial check + periodic timer.
   */
  async initialize(config: UpdateCheckConfig): Promise<void> {
    if (!config.autoCheck) return;

    // Initial check (debounced -- skip if checked <60s ago)
    const now = Date.now();
    if (now - this.lastCheckTimestamp > 60_000) {
      await this.performCheck(config);
    }

    // Periodic timer
    const interval = CHECK_INTERVALS[config.checkFrequency];
    if (interval > 0 && !this.intervalId) {
      this.intervalId = setInterval(() => {
        // Only check if tab is visible (don't waste cycles while minimized)
        if (!document.hidden) {
          this.performCheck(config);
        }
      }, interval);
    }
  }

  async performCheck(config: UpdateCheckConfig): Promise<void> {
    this.lastCheckTimestamp = Date.now();
    try {
      const update = await check();
      if (!update) return; // up to date

      // Skip if user previously dismissed this specific version
      if (config.skippedVersions.includes(update.version)) return;

      // Determine if mandatory (notes start with "[MANDATORY]" per backend convention)
      const isMandatory = update.body?.startsWith('[MANDATORY]') ?? false;

      // Dispatch to UI via zustand store
      useUpdateStore.getState().setAvailableUpdate({
        version: update.version,
        notes: update.body?.replace('[MANDATORY] ', '') ?? '',
        date: update.date ?? new Date().toISOString(),
        isMandatory,
        isSecurity: update.body?.toLowerCase().includes('security') ?? false,
        rawUpdate: update,
      });
    } catch (err) {
      console.warn('[UpdateCheck] Background check failed:', err);
      // Silent failure for background checks -- no toast
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const updateCheckService = new UpdateCheckService();
```

### 1.4 License Validation Piggyback

The existing `check_for_updates` Rust command (invoked by `licenseStore.checkForUpdates()`) already returns `UpdateInfo` with `is_mandatory`. When the license validation response includes update information, the store should cross-reference:

```
License validate response  -->  Has update_available: true?
                                   |
                              Yes: Set updateInfo in store
                                   |
                              Is it mandatory?
                              /            \
                           Yes              No
                            |                |
                    Show forced dialog    Show banner if not skipped
```

---

## 2. Update Available Notification (Standard / Non-Mandatory)

### 2.1 UI Component: Slide-In Banner

The notification appears as a slim banner at the top of the main content area (below the top bar, above the page content). It does NOT block any UI. The user can continue working.

```
+--------------------------------------------------------------------------+
|  [Top Bar: Cyber Chakra Forensics    Maximize | Minimize | Close]        |
+--------------------------------------------------------------------------+
| +----------------------------------------------------------------------+ |
| |  ^ Update Available                                           [ X ]  | |
| |                                                                      | |
| |  Version 2.1.0 -- Security Patch                  Released Mar 27   | |
| |                                                                      | |
| |  * Fixed WhatsApp crypt15 parser vulnerability                       | |
| |  * Improved physical imaging speed by 40%                            | |
| |  * Updated SQLCipher to 4.6.0                                       | |
| |                                                                      | |
| |  [Update Now]   [Remind Me Later]   [Skip This Version]             | |
| +----------------------------------------------------------------------+ |
|                                                                          |
|  [Normal page content continues below, fully interactive]                |
|                                                                          |
+--------------------------------------------------------------------------+
```

### 2.2 Interaction Details

| Action | Behavior | Persistence |
|--------|----------|-------------|
| **Update Now** | Starts download flow (Section 3). Banner transitions to download progress view. | -- |
| **Remind Me Later** | Dismisses banner. Re-shows on next periodic check (4h default) or next app launch. | Per-session only. `localStorage` flag cleared on app close. |
| **Skip This Version** | Dismisses banner. Adds `version` to `skippedVersions` in persisted settings. Never shows again for this version. | Persisted to `localStorage` via zustand persist middleware. Cleared when a NEWER version is available. |
| **[X] close** | Same as "Remind Me Later". | Per-session. |

### 2.3 Component Design

```tsx
// src/components/UpdateBanner.tsx

interface UpdateBannerProps {
  version: string;
  notes: string;
  date: string;
  isSecurity: boolean;
  onUpdateNow: () => void;
  onRemindLater: () => void;
  onSkipVersion: () => void;
}

export function UpdateBanner({
  version, notes, date, isSecurity, onUpdateNow, onRemindLater, onSkipVersion
}: UpdateBannerProps) {
  return (
    <div className="mx-4 mt-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Update Available</span>
              <Badge variant="secondary">v{version}</Badge>
              {isSecurity && (
                <Badge variant="destructive" className="text-xs">
                  <Shield className="mr-1 h-3 w-3" />
                  Security
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Released {formatRelativeDate(date)}
            </p>
            {notes && (
              <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                {notes}
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost" size="icon"
          onClick={onRemindLater}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2 ml-12">
        <Button size="sm" onClick={onUpdateNow}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Update Now
        </Button>
        <Button size="sm" variant="outline" onClick={onRemindLater}>
          Remind Me Later
        </Button>
        <Button
          size="sm" variant="ghost"
          className="text-muted-foreground"
          onClick={onSkipVersion}
        >
          Skip This Version
        </Button>
      </div>
    </div>
  );
}
```

### 2.4 Banner Placement in Layout

The banner renders inside the main layout component, after the top bar and before `<Outlet />`:

```tsx
// In src/layouts/MainLayout.tsx (conceptual)

<TopBar />
{updateAvailable && !updateDismissed && <UpdateBanner ... />}
<Outlet />  {/* Page content */}
```

This ensures the banner is visible on every page, not just Settings.

### 2.5 Release Notes Rendering

The `notes` field from the Tauri updater JSON is plain text or markdown. Parse it with a lightweight markdown renderer (`react-markdown` or simply split by newlines and prefix with bullet points). Keep it concise -- the admin portal should write release notes in bullet-point format.

If notes exceed 5 lines, show first 3 with "Show more..." toggle.

---

## 3. Download & Install Flow

### 3.1 State Machine

```
                  +----------+
                  |  IDLE    |
                  +----+-----+
                       |
                  checkForUpdates()
                       |
                  +----v-----+
                  | CHECKING |
                  +----+-----+
                       |
              +--------+--------+
              |                 |
         +----v----+      +----v------+
         |UP_TO_DATE|      | AVAILABLE |
         +---------+      +----+------+
                                |
                          downloadAndInstall()
                                |
                          +-----v-------+
                          | DOWNLOADING |  <-- User can continue working
                          +-----+-------+
                                |
                          +-----v-------+
                          | VERIFYING   |  <-- Signature check
                          +-----+-------+
                                |
                          +-----v-------+
                          | INSTALLING  |  <-- May trigger UAC on Windows
                          +-----+-------+
                                |
                          +-----v-------+
                          |   READY     |  <-- "Restart to apply"
                          +-----+-------+
                                |
                           relaunch()
                                |
                          +-----v-------+
                          | RESTARTING  |
                          +-------------+

         Error at any stage --> ERROR state with retry option
```

### 3.2 Download Progress UI

When user clicks "Update Now", the banner transforms in-place to show progress:

```
+----------------------------------------------------------------------+
|  Downloading update v2.1.0...                                        |
|                                                                      |
|  [===========================>              ] 67%                     |
|  45.2 MB / 67.4 MB                           ~12 seconds remaining   |
|                                                                      |
|  [Cancel Download]                                                   |
+----------------------------------------------------------------------+
```

**Stages after download completes:**

```
+----------------------------------------------------------------------+
|  Verifying signature...                                    [spinner] |
+----------------------------------------------------------------------+
```

```
+----------------------------------------------------------------------+
|  Installing update...                                      [spinner] |
|  This may take a moment. Do not close the application.               |
+----------------------------------------------------------------------+
```

```
+----------------------------------------------------------------------+
|  Update ready! Restart to apply v2.1.0                               |
|                                                                      |
|  [Restart Now]   [Restart Later]                                     |
+----------------------------------------------------------------------+
```

### 3.3 Can the User Continue Working During Download?

**Yes.** The download runs in a background thread via `tauri-plugin-updater`'s `downloadAndInstall()`. The user can navigate pages, run acquisitions, generate reports, etc. The progress banner stays pinned at the top.

**However:** during the INSTALLING phase (after download completes), the app may need to replace its own binary. On Windows with NSIS, the installer runs as a separate process. The user should be warned not to close the app during this brief phase.

### 3.4 What Happens If User Closes During Download?

| Phase | Close Behavior | Resume Behavior |
|-------|----------------|-----------------|
| **Downloading** | Download aborted. Partial file discarded. | Next update check re-triggers "Update Available" state. User must click "Update Now" again. No partial resume (Tauri updater does not support HTTP range requests for resume). |
| **Verifying** | Verification interrupted. Downloaded file may remain. | On next launch, `tauri-plugin-updater` detects pending update and re-verifies, or re-downloads if file corrupt. |
| **Installing** | **Dangerous.** Installer may leave app in inconsistent state. | Tauri + NSIS installer is designed to be atomic: it writes to a temp directory first, then swaps. If interrupted before swap, old binary is intact. If interrupted during swap (rare), repair install needed. |
| **Ready (waiting for restart)** | App closes. Update already installed to staging area. | On next launch, Tauri detects the pending update and applies it automatically before showing the UI. |

**Mitigation for "close during install":** Disable the window close button during the INSTALLING phase (use `setClosable(false)` via Tauri window API), and show a warning if the user tries to close via Task Manager or Alt+F4:

```typescript
// During install phase
import { getCurrentWindow } from '@tauri-apps/api/window';
await getCurrentWindow().setClosable(false);
// After install completes
await getCurrentWindow().setClosable(true);
```

### 3.5 Windows UAC Prompt

The NSIS installer for CMF uses `installMode: "currentUser"` (per `tauri.conf.json` line 89). This means:
- **No UAC prompt** for per-user installation (installs to `%LOCALAPPDATA%`).
- If the admin changes the installer to per-machine mode, UAC will appear.

**Recommendation:** Keep `currentUser` install mode. If UAC is needed in future:
1. Show a warning before the UAC prompt: "Windows will ask for administrator permission."
2. If UAC is declined, show: "Update requires administrator permission. Please try again or ask your IT administrator."
3. Log UAC denial to audit trail.

### 3.6 Active Acquisition Guard

Before starting download + install, check if any acquisition job is running:

```typescript
async function canStartUpdate(): Promise<{ allowed: boolean; reason?: string }> {
  const jobs = await invoke<JobInfo[]>('get_active_jobs');
  const runningJobs = jobs.filter(j => j.status === 'Running' || j.status === 'Queued');

  if (runningJobs.length > 0) {
    return {
      allowed: false,
      reason: `${runningJobs.length} acquisition job(s) in progress. Update will begin after completion.`,
    };
  }
  return { allowed: true };
}
```

If jobs are running:
- **Non-mandatory update:** Show "Update will begin after your current jobs complete. You can also update manually from Settings."
- **Mandatory update:** Show the forced update dialog (Section 4) with "Update After Job" option.

---

## 4. Forced Update Flow (Critical Security / Version Blocked)

### 4.1 When Does Forced Update Trigger?

Forced update occurs when the admin portal marks a version as blocked (via `blocked_versions` table) or a release as `is_mandatory: true`. The backend signals this by:
1. Including `[MANDATORY]` prefix in the `notes` field of the Tauri updater response.
2. Setting `is_mandatory: true` in the `check_for_updates` Rust command response (already in `UpdateInfo` type).

### 4.2 Forced Update Modal

This is a **modal dialog** (not a banner). It blocks normal interaction but does NOT prevent completing in-progress work.

```
+--------------------------------------------------------------------+
|                                                                    |
|     [Shield Icon]  Critical Security Update Required               |
|                                                                    |
|     Version 2.1.0 must be installed to continue using              |
|     Cyber Chakra Forensics.                                        |
|                                                                    |
|     This update addresses:                                         |
|     * CVE-2026-1234: WhatsApp crypt15 parser vulnerability         |
|     * SQLCipher memory safety fix                                  |
|                                                                    |
|     +--------------------------------------------------------+     |
|     | ! Deadline: You have 72 hours to update.               |     |
|     |   After Mar 30, 2026 the app will enter restricted     |     |
|     |   mode (read-only, no new acquisitions).               |     |
|     +--------------------------------------------------------+     |
|                                                                    |
|     +--------------------------------------------------------+     |
|     | (i) 2 active acquisitions detected.                    |     |
|     |     The update will not interrupt running jobs.         |     |
|     +--------------------------------------------------------+     |
|                                                                    |
|     [Update Now]                      [Update After Jobs Complete] |
|                                                                    |
+--------------------------------------------------------------------+
```

### 4.3 Forced Update Behavior

| Scenario | Behavior |
|----------|----------|
| **No running jobs** | Only "Update Now" button shown. No "Update After Jobs" option. Modal cannot be dismissed (no X button). User must update. |
| **Jobs running** | Both buttons shown. "Update After Jobs" registers a watcher that auto-triggers update when all jobs reach terminal state. |
| **User ignores for 72 hours** | App enters RESTRICTED MODE: all read operations work, but `create_case`, `start_*_acquisition`, and `start_report_generation_background` commands return an error with message "Update required". The top bar shows a persistent red banner: "Update required to continue working." |
| **App restarted before updating** | Forced update modal re-appears immediately after login. The modal appears before Dashboard loads. |
| **Offline / air-gapped** | Show additional text: "If this machine is offline, contact your administrator for a manual update package." (See Section 5.) |

### 4.4 Restricted Mode Implementation

Restricted mode is enforced in the Rust backend, not just the frontend (to prevent bypass):

```rust
// Conceptual -- in each command handler
fn check_update_restriction(state: &AppState) -> Result<(), String> {
    if let Some(deadline) = state.mandatory_update_deadline {
        if Utc::now() > deadline {
            return Err("A critical update is required. Please update the application.".into());
        }
    }
    Ok(())
}
```

The deadline timestamp comes from the server via a new field in the heartbeat or validation response:

```json
{
  "mandatory_update": {
    "version": "2.1.0",
    "deadline": "2026-03-30T00:00:00Z",
    "reason": "Critical security vulnerability"
  }
}
```

### 4.5 72-Hour Countdown Display

After the forced update modal is first shown, a countdown badge appears in the top bar:

```
[Shield Icon] Update required in 2d 14h  [Update Now]
```

This uses the same top-bar area as announcements but with higher visual priority (red accent).

---

## 5. Offline / Air-Gapped Update

### 5.1 Target Environment

Government and defense agencies (the "Government" license tier) often operate in air-gapped networks. These machines never contact the update server.

### 5.2 Offline Update Workflow

```
Admin Portal                     USB Transfer              Desktop App
  |                                  |                        |
  | 1. Admin downloads              |                        |
  |    installer (.exe/.AppImage)   |                        |
  |    + SHA256 hash                |                        |
  |    + signature file (.sig)      |                        |
  |                                  |                        |
  | 2. Copy to USB                  |                        |
  |------------------------->       |                        |
  |                                  |                        |
  |                    3. Plug USB   |                        |
  |                    into air-     |                        |
  |                    gapped machine|                        |
  |                                  |------->               |
  |                                  |                        |
  |                                  | 4. Run installer      |
  |                                  |    over existing       |
  |                                  |    installation        |
  |                                  |                        |
  |                                  | 5. App detects new     |
  |                                  |    version on next     |
  |                                  |    launch              |
  |                                  |                        |
```

### 5.3 Admin Portal: Download for Offline

On the Releases page in the admin portal, each release has a download section:

```
+------------------------------------------------------------------+
|  Release v2.1.0 -- Offline Distribution                          |
|                                                                  |
|  Platform          File                  Size    SHA256          |
|  ---------------------------------------------------------------  |
|  Windows x64       CMF-2.1.0-setup.exe   67 MB   a3f2c1... [Copy]|
|  Linux x64         CMF-2.1.0.AppImage    72 MB   b8e4d2... [Copy]|
|                                                                  |
|  Signature files:                                                |
|  CMF-2.1.0-setup.exe.sig    [Download]                           |
|  CMF-2.1.0.AppImage.sig     [Download]                           |
|                                                                  |
|  [Download All as ZIP]  (includes installer + sig + checksums)   |
+------------------------------------------------------------------+
```

### 5.4 Preserving Settings & Data During Offline Update

The NSIS installer (Windows) and AppImage (Linux) are designed to upgrade over existing installations:

| Data Type | Location | Preserved? | Mechanism |
|-----------|----------|------------|-----------|
| **SQLite database** (cases, audit log) | `%APPDATA%/com.cyberchakra.forensics/` | Yes | Installer does not touch app data directory |
| **User settings** | `%APPDATA%/com.cyberchakra.forensics/config.json` | Yes | Same |
| **License activation** | `%APPDATA%/com.cyberchakra.forensics/license.dat` | Yes | Same |
| **Extraction output** | User-chosen directories (e.g., `D:\Evidence\`) | Yes | Not in install path |
| **Application binary** | `%LOCALAPPDATA%/Programs/cyber-chakra-forensics/` | Replaced | This is the update |
| **Bundled tools** (adb, wkhtmltopdf) | Inside app install directory | Replaced | Updated to latest compatible version |

**Critical:** The NSIS installer MUST use `!define PRESERVE_APP_DATA` logic. The existing `tauri.conf.json` uses `"installMode": "currentUser"` which installs to `%LOCALAPPDATA%` while app data lives in `%APPDATA%` -- they are separate directories, so data is safe.

### 5.5 Offline Update Verification

After offline update, on first launch the app should:
1. Detect that its version changed (compare stored version in config vs. binary version).
2. Show a "What's New" dialog with the changelog for the new version (bundled in the binary).
3. Log the update to the local audit trail:
   ```
   [2026-03-28 14:30:00] SOFTWARE_UPDATE: 2.0.0 -> 2.1.0 (offline/manual)
   ```
4. On next online contact (if ever), report the version change in the heartbeat.

### 5.6 Offline Update: Settings Page Indicator

For air-gapped machines where auto-update is disabled:

```
+----------------------------------------------------------------------+
|  Software Updates                                                    |
|                                                                      |
|  Current Version: 2.0.0                                              |
|  Auto-updates: Disabled (offline mode)                               |
|                                                                      |
|  To update this machine:                                             |
|  1. Contact your administrator for the latest installer              |
|  2. Transfer the installer via approved media                        |
|  3. Run the installer -- your data will be preserved                 |
|                                                                      |
|  [Verify Installation]   (checks binary integrity)                   |
+----------------------------------------------------------------------+
```

"Verify Installation" computes a SHA256 of the running binary and displays it so the admin can compare against the known hash from the portal.

---

## 6. Update Settings (Desktop App Settings Page)

### 6.1 Location in Settings

The update settings live inside the existing "About" tab of the Settings page (where `UpdateChecker` is already rendered at line 1173 of `Settings.tsx`). The redesigned section replaces the current `<UpdateChecker />` with a richer component.

### 6.2 Settings Panel Layout

```
+----------------------------------------------------------------------+
|  [Download Icon]  Software Updates                                   |
|  Keep your application up to date with the latest features           |
|  and security patches                                                |
+----------------------------------------------------------------------+
|                                                                      |
|  Current Version                                                     |
|  v2.0.0 (Build 1)    Installed: Nov 30, 2024                        |
|                                                                      |
|  +---------------------------+  +-------------------------------+    |
|  | Auto-check for updates    |  | Update Channel                |    |
|  | [Toggle: ON]              |  | [Dropdown: Stable | Beta]     |    |
|  +---------------------------+  +-------------------------------+    |
|                                                                      |
|  +---------------------------+                                       |
|  | Check Frequency           |                                       |
|  | [Dropdown]                |                                       |
|  |  * Startup only           |                                       |
|  |  * Every 4 hours          |                                       |
|  |  * Every 12 hours         |                                       |
|  |  * Daily                  |                                       |
|  +---------------------------+                                       |
|                                                                      |
|  Proxy Settings (for corporate networks)                             |
|  +-------------------------------------------------------+          |
|  | HTTP Proxy  [                                        ] |          |
|  | Example: http://proxy.corp.gov.in:8080                |          |
|  +-------------------------------------------------------+          |
|  | [ ] Use system proxy settings                         |          |
|  +-------------------------------------------------------+          |
|                                                                      |
|  [Check for Updates Now]                                             |
|                                                                      |
|  Last checked: 2 hours ago -- You are up to date                     |
|                                                                      |
+----------------------------------------------------------------------+
```

### 6.3 Settings Data Model

```typescript
// src/stores/updateSettingsStore.ts

interface UpdateSettings {
  autoCheck: boolean;                                // default: true
  checkFrequency: 'startup_only' | 'every_4h' | 'every_12h' | 'daily';  // default: 'every_4h'
  channel: 'stable' | 'beta';                       // default: 'stable'
  proxyUrl: string | null;                           // default: null
  useSystemProxy: boolean;                           // default: true
  skippedVersions: string[];                         // default: []
  lastCheckTimestamp: number | null;                  // epoch ms
  lastCheckResult: 'up_to_date' | 'available' | 'error' | null;
}
```

Persisted via zustand `persist` middleware to `localStorage` (same pattern as `themeStore`, `notificationStore`).

### 6.4 Beta Channel Access

The Beta channel dropdown is only visible if the organization's license tier allows it. The admin portal sets this via the license's feature flags (JSONB field). Check via:

```typescript
const canAccessBeta = useLicenseStore(s =>
  s.status?.feature_flags?.beta_channel === true
);
```

If not available, the channel dropdown shows only "Stable" with a tooltip: "Beta channel is available for Team and Enterprise licenses."

### 6.5 Proxy Configuration

The proxy URL is passed to the Tauri updater via Rust. This requires a small backend enhancement:

```rust
// In lib.rs, configure the updater builder with proxy
let proxy_url = get_proxy_setting(); // read from app config
let mut updater_builder = tauri_plugin_updater::Builder::new();
if let Some(proxy) = proxy_url {
    updater_builder = updater_builder.proxy(proxy);
}
app.plugin(updater_builder.build());
```

Note: `tauri-plugin-updater` v2 supports proxy configuration via `reqwest::Proxy` under the hood. The proxy URL is a standard HTTP proxy string.

---

## 7. Update History

### 7.1 Update History Panel

Below the update settings, show a collapsible section:

```
+----------------------------------------------------------------------+
|  Update History                                          [Collapse]  |
+----------------------------------------------------------------------+
|                                                                      |
|  v2.0.0 (current)     Installed Nov 30, 2024                        |
|  |- Initial release                                                  |
|  |  [View full changelog]                                            |
|  |                                                                   |
|  v1.9.2               Updated Nov 15, 2024                          |
|  |- Bug fix: Fixed WhatsApp date parsing                             |
|  |  [View full changelog]                                            |
|  |                                                                   |
|  v1.9.0               Updated Oct 28, 2024                          |
|  |- Added Instagram parser                                           |
|  |- Performance improvements                                         |
|  |  [View full changelog]                                            |
|                                                                      |
+----------------------------------------------------------------------+
```

### 7.2 Data Source

Update history is tracked locally in the SQLite database:

```sql
-- New table in CMF desktop app database
CREATE TABLE IF NOT EXISTS update_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version TEXT NOT NULL,
    to_version   TEXT NOT NULL,
    update_type  TEXT NOT NULL DEFAULT 'auto',  -- 'auto', 'manual', 'offline', 'forced'
    release_notes TEXT,
    installed_at DATETIME NOT NULL DEFAULT (datetime('now')),
    status       TEXT NOT NULL DEFAULT 'success'  -- 'success', 'failed', 'rolled_back'
);
```

On each successful update (detected by version change on launch), the app inserts a record.

### 7.3 "What's New" Dialog

On first launch after an update, show a non-blocking dialog:

```
+----------------------------------------------------------+
|  What's New in v2.1.0                               [X]  |
|                                                          |
|  Security Patch -- March 27, 2026                        |
|                                                          |
|  Fixed                                                   |
|  * WhatsApp crypt15 parser vulnerability (CVE-2026-1234) |
|  * Crash on large device acquisitions (>256 GB)          |
|                                                          |
|  Improved                                                |
|  * Physical imaging speed increased by 40%               |
|  * Memory usage reduced during parsing                   |
|                                                          |
|  Updated Dependencies                                    |
|  * SQLCipher 4.5.7 -> 4.6.0                             |
|  * libimobiledevice 1.3.0 -> 1.3.1                      |
|                                                          |
|                                          [Got It]        |
+----------------------------------------------------------+
```

This dialog is generated from the `release_notes` stored in the Tauri updater JSON response (cached before relaunch) or bundled in the binary as a resource file.

---

## 8. Error Handling

### 8.1 Error Taxonomy

| Error | Detection | User Message | Recovery |
|-------|-----------|-------------|----------|
| **Network unreachable** | `check()` throws with network error | "Unable to check for updates. Check your internet connection." | Retry button. Auto-retry on next periodic check. |
| **Server 5xx** | HTTP status >= 500 | "Update server is temporarily unavailable. We'll try again later." | Exponential backoff: 5m, 15m, 30m, 1h. Max 3 retries per session. |
| **Server 4xx** | HTTP status 400-499 | Depends on code. 403: "Your license does not permit updates." 429: "Too many requests. Please wait." | For 429: respect `Retry-After` header. For 403: show license info. |
| **Download interrupted** | `downloadAndInstall()` progress callback stops / throws | "Download interrupted. [Retry Download]" | Single retry button. Must restart download from beginning (no resume). |
| **Signature verification fails** | `downloadAndInstall()` throws signature error | "Update signature verification failed. The download may be corrupted or tampered with. This has been logged for security review." | **Do NOT retry automatically.** Log to audit trail with full details. Show "Contact Support" button. This is a potential supply-chain attack. |
| **Disk space insufficient** | Check before download: `available < file_size * 1.5` | "Insufficient disk space. The update requires {size} MB but only {available} MB is free. Free up space and try again." | Show disk usage breakdown. Link to system storage settings. |
| **Installation failure** | Installer process exits with non-zero code | "Installation failed. Your current version is still intact. Error: {code}" | "Try Again" button. "Download Installer Manually" link to admin portal. |
| **Relaunch failure** | `relaunch()` throws | "Failed to restart. Please close and reopen the application manually." | The update is already installed -- manual restart will apply it. |

### 8.2 Pre-Download Disk Space Check

Before initiating download, check available disk space:

```typescript
async function checkDiskSpace(requiredBytes: number): Promise<boolean> {
  try {
    const freeSpace = await invoke<number>('get_free_disk_space');
    const requiredWithBuffer = requiredBytes * 1.5; // 50% buffer for extraction
    if (freeSpace < requiredWithBuffer) {
      useUpdateStore.getState().setError({
        type: 'disk_space',
        message: `Need ${formatBytes(requiredWithBuffer)}, only ${formatBytes(freeSpace)} available.`,
      });
      return false;
    }
    return true;
  } catch {
    // If we can't check, proceed and let the download fail naturally
    return true;
  }
}
```

### 8.3 Signature Failure Audit Log Entry

This is critical for a forensics tool. A failed signature means either corruption or tampering:

```rust
// In audit log
AuditEntry {
    event_type: "SECURITY_ALERT",
    action: "UPDATE_SIGNATURE_INVALID",
    details: json!({
        "attempted_version": "2.1.0",
        "download_url": "https://...",
        "expected_pubkey": "dW50cnVzdGVk...",
        "error": "Signature mismatch",
        "timestamp": "2026-03-28T14:30:00Z",
        "machine_id": "abc123"
    }),
    severity: "critical"
}
```

### 8.4 Network Error Retry Strategy

```typescript
const RETRY_DELAYS = [5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000]; // 5m, 15m, 30m, 1h

class UpdateRetryManager {
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  scheduleRetry(onRetry: () => Promise<void>): void {
    if (this.retryCount >= RETRY_DELAYS.length) {
      // Max retries reached -- wait for next periodic check
      console.warn('[Update] Max retries reached, will try on next periodic check');
      return;
    }

    const delay = RETRY_DELAYS[this.retryCount];
    this.retryCount++;

    this.retryTimer = setTimeout(async () => {
      try {
        await onRetry();
        this.retryCount = 0; // Reset on success
      } catch {
        this.scheduleRetry(onRetry); // Retry again
      }
    }, delay);
  }

  reset(): void {
    this.retryCount = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }
}
```

### 8.5 Error UI in Banner

When an error occurs during the download flow, the banner transforms:

```
+----------------------------------------------------------------------+
|  [AlertTriangle]  Update failed                                      |
|                                                                      |
|  Download was interrupted due to a network error.                    |
|  Your current version (2.0.0) is not affected.                      |
|                                                                      |
|  [Retry Download]   [Dismiss]                                        |
|                                                                      |
|  Will automatically retry in 5 minutes.                              |
+----------------------------------------------------------------------+
```

For signature failures (more severe):

```
+----------------------------------------------------------------------+
|  [Shield + X]  Security Warning                                      |
|                                                                      |
|  The downloaded update failed signature verification.                |
|  This could indicate file corruption or tampering.                   |
|                                                                      |
|  This incident has been logged for security review.                  |
|                                                                      |
|  [Contact Support]   [Dismiss]                                       |
|                                                                      |
|  Do NOT attempt to install updates from untrusted sources.           |
+----------------------------------------------------------------------+
```

---

## 9. Complete Component Architecture

### 9.1 New Files

```
src/
  services/
    updateCheckService.ts        -- Orchestrates check triggers
    updateRetryManager.ts        -- Exponential backoff logic
  stores/
    updateStore.ts               -- Update state (replaces updateInfo in licenseStore)
    updateSettingsStore.ts       -- Persisted settings (auto-check, frequency, etc.)
  components/
    UpdateBanner.tsx             -- Non-blocking top banner for available updates
    UpdateProgress.tsx           -- Download/install progress within banner
    ForcedUpdateModal.tsx        -- Modal for mandatory/blocked version updates
    UpdateSettings.tsx           -- Settings panel (replaces current UpdateChecker usage)
    UpdateHistory.tsx            -- Collapsible history list
    WhatsNewDialog.tsx           -- Post-update changelog dialog
    OfflineUpdateGuide.tsx       -- Instructions for air-gapped environments
```

### 9.2 Migration from Current UpdateChecker

The current `UpdateChecker.tsx` component combines checking, downloading, and settings into a single Card. The redesign splits this into:

| Current | New | Placement |
|---------|-----|-----------|
| `UpdateChecker` (checking + download + status) | `UpdateBanner` + `UpdateProgress` | Main layout (above page content), visible on ALL pages |
| `UpdateChecker` in Settings | `UpdateSettings` + `UpdateHistory` | Settings > About tab (same location) |
| -- (not implemented) | `ForcedUpdateModal` | Global overlay, triggered by store |
| -- (not implemented) | `WhatsNewDialog` | Global overlay, on first launch after update |

### 9.3 Store Design

```typescript
// src/stores/updateStore.ts

interface AvailableUpdate {
  version: string;
  notes: string;
  date: string;
  isMandatory: boolean;
  isSecurity: boolean;
  mandatoryDeadline?: string;   // ISO timestamp, null for non-mandatory
  fileSize?: number;            // bytes, from server
  rawUpdate: any;               // tauri-plugin-updater Update object
}

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'ready'         // downloaded + installed, waiting for restart
  | 'restarting'
  | 'up_to_date'
  | 'error';

interface UpdateError {
  type: 'network' | 'server' | 'download' | 'signature' | 'disk_space' | 'install' | 'relaunch';
  message: string;
  retryable: boolean;
  code?: string;
}

interface UpdateState {
  phase: UpdatePhase;
  availableUpdate: AvailableUpdate | null;
  downloadProgress: number;          // 0-100
  downloadedBytes: number;
  totalBytes: number;
  error: UpdateError | null;

  // Dismissal tracking
  bannerDismissed: boolean;          // per-session

  // Actions
  setAvailableUpdate: (update: AvailableUpdate) => void;
  startDownload: () => Promise<void>;
  cancelDownload: () => void;
  restart: () => Promise<void>;
  dismissBanner: () => void;
  skipVersion: (version: string) => void;
  reset: () => void;
}
```

---

## 10. Integration with Admin Portal

### 10.1 Tauri Updater JSON Format (Unchanged)

The admin portal's `/api/public/v1/update-check` endpoint (and the existing `update-check.php`) returns the standard Tauri updater format. This is non-negotiable -- `tauri-plugin-updater` parses it:

```json
{
  "version": "2.1.0",
  "notes": "* Fixed WhatsApp crypt15 parser\n* Improved physical imaging speed\n* Updated SQLCipher to 4.6.0",
  "pub_date": "2026-03-27T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://cyberchakra.online/2.1.0/CMF-2.1.0-setup.exe"
    },
    "linux-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://cyberchakra.online/2.1.0/CMF-2.1.0.AppImage"
    }
  }
}
```

### 10.2 Mandatory Signal Convention

Since the Tauri updater format does not have an `is_mandatory` field, the backend signals mandatory updates by prefixing the `notes` field:

```
notes: "[MANDATORY] Your current version has been blocked. This update fixes CVE-2026-1234."
```

The desktop app parses this prefix:

```typescript
const isMandatory = notes.startsWith('[MANDATORY]');
const cleanNotes = notes.replace(/^\[MANDATORY\]\s*/, '');
```

### 10.3 Extended Update Info (via Separate Endpoint)

For richer metadata (deadline, is_security, file_size), the desktop app can optionally call the full update-check API directly (bypassing the Tauri plugin) after the initial check detects an available update:

```typescript
// After tauri check() returns an update, fetch extended info
const extendedInfo = await fetch('/api/public/v1/update-check', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-License-Key': licenseKey,
    'X-Hardware-Fingerprint': fingerprint,
  },
  body: JSON.stringify({
    current_version: currentVersion,
    platform: `${target}_${arch}`,
    channel: updateSettings.channel,
  }),
}).then(r => r.json());

// extendedInfo has: is_mandatory, is_security, file_size, mandatory_deadline, etc.
```

This provides the full `PublicUpdateCheckResponse` schema without modifying the Tauri updater plugin's expectations.

### 10.4 Admin Portal Release Controls

For each release in the admin portal, the admin sets:

| Field | Desktop Impact |
|-------|---------------|
| `is_mandatory` | Triggers forced update modal |
| `is_security` | Shows "Security" badge on banner |
| Rollout policy (staged %) | Determines which clients see the update |
| `blocked_versions` (version block) | Forces update with `[MANDATORY]` prefix + `force_update_to` target |
| Channel (stable/beta) | Only shown to clients on matching channel |

---

## 11. Timeline & Priority

| Phase | Component | Priority | Depends On |
|-------|-----------|----------|------------|
| **Phase 1** | `UpdateBanner` (standard notification) | P0 | Already have `UpdateChecker` as base |
| **Phase 1** | `UpdateProgress` (download flow) | P0 | Existing `downloadAndInstall()` in `UpdateChecker` |
| **Phase 1** | `UpdateSettings` (settings panel) | P1 | `updateSettingsStore` |
| **Phase 2** | `ForcedUpdateModal` | P0 | Admin portal `is_mandatory` field + version blocking |
| **Phase 2** | Restricted mode (Rust-side enforcement) | P0 | Admin portal heartbeat response changes |
| **Phase 2** | `updateCheckService` (background orchestrator) | P1 | `updateSettingsStore` |
| **Phase 3** | `UpdateHistory` + `WhatsNewDialog` | P2 | `update_history` SQLite table |
| **Phase 3** | `OfflineUpdateGuide` | P2 | Admin portal release download page |
| **Phase 3** | Proxy support | P2 | Rust-side `tauri_plugin_updater::Builder::proxy()` |

---

## 12. Open Questions for Decision

1. **Tauri updater signature format:** The current `pubkey` in `tauri.conf.json` is a minisign public key. Should we support dual signing (minisign for Tauri updater + separate code-signing cert for Windows SmartScreen)?

2. **Delta updates:** Tauri v2 updater downloads the full installer each time. For a 67 MB binary, this is acceptable. Should we investigate delta/patch updates for future versions, or is full-file acceptable given the forensics lab environment (wired LAN, not mobile data)?

3. **Mandatory update grace period:** The spec proposes 72 hours. Should this be configurable per-release from the admin portal? (e.g., zero-day critical = 24 hours, routine security = 7 days?)

4. **Auto-restart behavior:** After download+install completes, should the app auto-restart after a countdown (e.g., "Restarting in 60 seconds...") or always wait for user action? Auto-restart risks interrupting evidence review.

5. **Rollback capability:** If an update introduces a regression, can the user downgrade to the previous version? This would require bundling the previous installer or having the admin mark the new version as blocked and force-update back. The Tauri updater technically supports "downgrade" if the server returns a lower version number.

---

## Appendix A: Comparison with Existing UpdateChecker

| Feature | Current `UpdateChecker.tsx` | Proposed Design |
|---------|---------------------------|-----------------|
| Placement | Settings page only (Card widget) | Global banner (all pages) + Settings |
| Check trigger | On component mount (Settings visit) | Post-login + periodic + manual |
| Background check | None | Every 4h with visibility check |
| Mandatory update | Not handled | Full flow with 72h deadline + restricted mode |
| Skip version | Not supported | Supported with persistence |
| Offline update | Not supported | Guide + verification flow |
| Proxy support | Not supported | Configurable |
| Update history | Not tracked | SQLite table + UI |
| Error handling | Generic toast | Typed errors with specific recovery actions |
| Signature failure | Generic error toast | Security alert + audit log entry |
| Active job guard | Not checked | Blocks install until jobs complete |
| Disk space check | Not checked | Pre-download validation |

## Appendix B: Tauri Plugin Updater v2 API Reference

Key functions used from `@tauri-apps/plugin-updater`:

```typescript
// Check for updates (calls the endpoint in tauri.conf.json)
import { check } from '@tauri-apps/plugin-updater';
const update = await check();
// update.version: string
// update.date: string | null
// update.body: string | null  (the "notes" field)
// update.downloadAndInstall(onProgress): Promise<void>

// Restart after install
import { relaunch } from '@tauri-apps/plugin-process';
await relaunch();
```

The `check()` function internally sends a GET request to the endpoint configured in `tauri.conf.json`:
```
GET https://cyberchakra.online/api/update-check.php?target=windows&arch=x86_64&current_version=2.0.0
```

Returns 200 + JSON if update available, 204 if up-to-date.

## Appendix C: Files That Need Modification

| File | Change |
|------|--------|
| `src/components/UpdateChecker.tsx` | Deprecate; replace with new component suite |
| `src/views/Settings.tsx` (line 1173) | Replace `<UpdateChecker />` with `<UpdateSettings />` |
| `src/stores/licenseStore.ts` | Remove `updateInfo` / `checkForUpdates` (moved to dedicated store) |
| `src-tauri/src/lib.rs` (line 60) | Add proxy configuration to updater builder |
| `src-tauri/src/db/mod.rs` | Add `update_history` table to schema |
| `src/layouts/MainLayout.tsx` (or equivalent) | Add `<UpdateBanner />` to global layout |
| `src-tauri/tauri.conf.json` (line 101) | Eventually update endpoint URL to new portal API |
| `config/version.json` (line 6) | Eventually update `update_endpoint` |
