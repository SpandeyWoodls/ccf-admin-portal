# Agent 8: Installer Customization & Branding Research Report

**Date:** 2026-03-28
**Scope:** NSIS installer branding, first-run experience, enterprise deployment, update strategy, Linux distribution, and size optimization for Cyber Chakra Forensics (Tauri v2)

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [NSIS Installer Customization in Tauri v2](#2-nsis-installer-customization-in-tauri-v2)
3. [Recommended Installer Flow for Forensics Software](#3-recommended-installer-flow-for-forensics-software)
4. [First-Run Experience](#4-first-run-experience)
5. [Enterprise and Government Deployment](#5-enterprise-and-government-deployment)
6. [Update Installer vs Fresh Installer](#6-update-installer-vs-fresh-installer)
7. [Linux Distribution Strategy](#7-linux-distribution-strategy)
8. [Installer Size Optimization](#8-installer-size-optimization)
9. [Code Signing for Government Trust](#9-code-signing-for-government-trust)
10. [Complete Configuration Reference](#10-complete-configuration-reference)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. Current State Analysis

### What Already Exists

The project has a well-structured foundation for installer customization:

**`src-tauri/tauri.conf.json` (current NSIS section):**
```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "displayLanguageSelector": true,
        "languages": ["English"],
        "installerIcon": "icons/icon.ico",
        "headerImage": "installer/header.bmp",
        "sidebarImage": "installer/welcomefinish.bmp"
      }
    }
  }
}
```

**Existing assets in `src-tauri/installer/`:**
| File | Size | Purpose |
|------|------|---------|
| `header.bmp` | 25,818 bytes | 150x57px header on installer dialog pages |
| `welcomefinish.bmp` | 154,542 bytes | 164x314px sidebar on Welcome/Finish pages |
| `installer_icon.png` | 3,169 bytes | Source PNG for installer icon |
| `generate_images.py` | Python script to regenerate branding images |

**Existing icons in `src-tauri/icons/`:**
- `icon.ico` (149 KB) - Multi-resolution Windows icon
- `icon.icns` (772 KB) - macOS icon
- `icon.png` (265 KB) - Master PNG
- Multiple `SquareNNNxNNNLogo.png` variants for Windows Store

**License file:** `LICENSE.txt` at project root - comprehensive EULA with forensic usage terms, data privacy clauses, and Indian law jurisdiction.

**Legal directory:** `legal/` contains EULA.md, TERMS_OF_SERVICE.md, PRIVACY_POLICY.md, DATA_PROCESSING_AGREEMENT.md, EXPORT_CONTROL.md, and compliance templates.

**Updater already configured** with signed endpoints at `cyberchakra.online`.

**Onboarding already implemented** in the frontend (`src/stores/onboardingStore.ts`) with steps: welcome, compatibility_check, storage_setup, license_choice, trial_request, trial_pending, license_activation, admin_setup, complete.

### Gaps Identified

1. **No NSIS installer hooks file** (.nsh) for custom installation logic
2. **Hindi language** not yet added to installer languages
3. **`installMode` set to `currentUser`** -- forensics software for law enforcement should use `perMachine` or `both`
4. **No custom NSIS template** for advanced installer flow customization
5. **WebView2 mode is `downloadBootstrapper`** -- air-gapped environments need `offlineInstaller` or `embedBootstrapper`
6. **No start menu folder** configured
7. **No compression setting** explicitly set (defaults to LZMA which is fine)
8. **Certificate thumbprint is null** -- code signing not yet configured
9. **Linux targets not in bundle targets array** -- only `["nsis"]` listed

---

## 2. NSIS Installer Customization in Tauri v2

### 2.1 Complete NSIS Configuration Options

All options live under `bundle.windows.nsis` in `tauri.conf.json`:

| Property | Type | Description |
|----------|------|-------------|
| `installerIcon` | string | Path to .ico file for the installer executable |
| `headerImage` | string | Path to .bmp (150x57px) shown on installer dialog pages |
| `sidebarImage` | string | Path to .bmp (164x314px) shown on Welcome and Finish pages |
| `installMode` | string | `"currentUser"`, `"perMachine"`, or `"both"` |
| `displayLanguageSelector` | boolean | Show language selection on first page |
| `languages` | string[] | Array of language identifiers to include |
| `customLanguageFiles` | object | Key-value: language name to path of custom .nsh translation file |
| `installerHooks` | string | Path to .nsh file containing installation hook macros |
| `template` | string | Path to custom .nsi template (replaces default entirely) |
| `compression` | string | `"lzma"` (default), `"zlib"`, `"bzip2"`, or `"none"` |
| `startMenuFolder` | string | Custom Start Menu folder name |
| `minimumWebview2Version` | string | Minimum WebView2 runtime version required |

### 2.2 Image Specifications

**Header Image (`header.bmp`):**
- Dimensions: 150 x 57 pixels
- Format: Windows BMP (24-bit RGB, no alpha)
- Displayed on: All installer dialog pages (top-right area)
- Current: Navy gradient with wolf silhouette and "CYBER CHAKRA FORENSICS" text

**Sidebar Image (`sidebarImage` / `welcomefinish.bmp`):**
- Dimensions: 164 x 314 pixels
- Format: Windows BMP (24-bit RGB, no alpha)
- Displayed on: Welcome page and Finish page (left panel)
- Current: Vertical navy gradient with wolf silhouette, brand text, and version

**Installer Icon (`installerIcon`):**
- Format: .ico (multi-resolution recommended: 16, 32, 48, 64, 128, 256px)
- Displayed on: The .exe file in File Explorer and the installer title bar
- Currently using: `icons/icon.ico`

### 2.3 Language Configuration

Tauri v2 NSIS supports these built-in languages: English, Japanese, Korean, German, French, Spanish, Portuguese, PortugueseBR, Turkish, Arabic, SimpChinese, TradChinese, Italian, Russian, and more.

**For Hindi support**, a custom language file is needed since Hindi is not in the built-in NSIS language list:

```json
{
  "nsis": {
    "displayLanguageSelector": true,
    "languages": ["English"],
    "customLanguageFiles": {
      "Hindi": "installer/lang/hindi.nsh"
    }
  }
}
```

**Custom Hindi language file (`src-tauri/installer/lang/hindi.nsh`):**
```nsis
; Cyber Chakra Forensics - Hindi Language File
; Encoding: UTF-8

LangString addOrReinstall ${LANG_HINDI} "कंपोनेंट जोड़ें/पुनः स्थापित करें"
LangString alreadyInstalled ${LANG_HINDI} "पहले से स्थापित"
LangString closeBefore ${LANG_HINDI} "कृपया स्थापना से पहले $PRODUCTNAME बंद करें"
LangString chooseInstDir ${LANG_HINDI} "स्थापना निर्देशिका चुनें"
LangString overrideInstDir ${LANG_HINDI} "मौजूदा स्थापना निर्देशिका ओवरराइड करें"
LangString dontUninstall ${LANG_HINDI} "अनइंस्टॉल न करें"
LangString deleteFolder ${LANG_HINDI} "फ़ोल्डर हटाएं: $INSTDIR?"
LangString perMachine ${LANG_HINDI} "सभी उपयोगकर्ताओं के लिए (प्रशासक अधिकार आवश्यक)"
LangString perUser ${LANG_HINDI} "केवल वर्तमान उपयोगकर्ता के लिए"
LangString startMenu ${LANG_HINDI} "स्टार्ट मेनू फ़ोल्डर"
LangString desktopShortcut ${LANG_HINDI} "डेस्कटॉप शॉर्टकट"
```

> **Note:** Hindi NSIS support requires the NSIS Unicode build (which Tauri v2 uses by default) and the Hindi NSIS language definition. If Hindi is not natively supported by your NSIS version, you may need to register it as a custom language with the appropriate codepage. Alternatively, consider providing Hindi as an in-app language while keeping the installer in English for maximum compatibility.

### 2.4 Installer Hooks

Create `src-tauri/installer/hooks.nsh`:

```nsis
; =============================================================================
; Cyber Chakra Forensics - NSIS Installer Hooks
; =============================================================================

; ---- PRE-INSTALL HOOK ----
; Runs BEFORE copying files, setting registry keys, creating shortcuts
!macro NSIS_HOOK_PREINSTALL

  ; --- Check if application is currently running ---
  FindProcDLL::FindProc "Cyber Chakra Forensics.exe"
  ${If} $R0 == 1
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
      "Cyber Chakra Forensics is currently running.$\n$\n\
       Please close it before continuing." \
      IDOK tryAgain IDCANCEL abortInstall
    tryAgain:
      FindProcDLL::FindProc "Cyber Chakra Forensics.exe"
      ${If} $R0 == 1
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
          "Application is still running." \
          IDRETRY tryAgain IDCANCEL abortInstall
      ${EndIf}
      Goto continueInstall
    abortInstall:
      Abort
    continueInstall:
  ${EndIf}

  ; --- Create forensic data directories ---
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\data\cases"
  CreateDirectory "$INSTDIR\data\exports"
  CreateDirectory "$INSTDIR\logs"

  ; --- Write pre-install marker for first-run detection ---
  FileOpen $0 "$INSTDIR\.install_marker" w
  FileWrite $0 "install_time=$HWNDPARENT"
  FileClose $0

!macroend

; ---- POST-INSTALL HOOK ----
; Runs AFTER all files copied, registry keys set, shortcuts created
!macro NSIS_HOOK_POSTINSTALL

  ; --- Register file associations for .ccf (Cyber Chakra Forensics case files) ---
  WriteRegStr SHCTX "Software\Classes\.ccf" "" "CyberChakraForensics.CaseFile"
  WriteRegStr SHCTX "Software\Classes\CyberChakraForensics.CaseFile" "" "Cyber Chakra Forensics Case File"
  WriteRegStr SHCTX "Software\Classes\CyberChakraForensics.CaseFile\DefaultIcon" "" "$INSTDIR\Cyber Chakra Forensics.exe,0"
  WriteRegStr SHCTX "Software\Classes\CyberChakraForensics.CaseFile\shell\open\command" "" '"$INSTDIR\Cyber Chakra Forensics.exe" "%1"'

  ; --- Write version info to registry for enterprise detection ---
  WriteRegStr SHCTX "Software\CyberChakra\Forensics" "Version" "${VERSION}"
  WriteRegStr SHCTX "Software\CyberChakra\Forensics" "InstallDir" "$INSTDIR"
  WriteRegStr SHCTX "Software\CyberChakra\Forensics" "Publisher" "Cyber Chakra Technologies"

  ; --- Refresh shell icon cache ---
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

!macroend

; ---- PRE-UNINSTALL HOOK ----
; Runs BEFORE removing files, registry keys, and shortcuts
!macro NSIS_HOOK_PREUNINSTALL

  ; --- Prompt to preserve case data ---
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to preserve forensic case data and exports?$\n$\n\
     Selecting 'Yes' will keep the data directory intact.$\n\
     Selecting 'No' will permanently delete ALL case data." \
    IDYES preserveData IDNO removeData

  preserveData:
    ; Mark data for preservation
    WriteINIStr "$INSTDIR\uninstall.ini" "Options" "PreserveData" "true"
    Goto endPreUninstall

  removeData:
    WriteINIStr "$INSTDIR\uninstall.ini" "Options" "PreserveData" "false"

  endPreUninstall:

!macroend

; ---- POST-UNINSTALL HOOK ----
; Runs AFTER files, registry keys, and shortcuts removed
!macro NSIS_HOOK_POSTUNINSTALL

  ; --- Remove file associations ---
  DeleteRegKey SHCTX "Software\Classes\.ccf"
  DeleteRegKey SHCTX "Software\Classes\CyberChakraForensics.CaseFile"
  DeleteRegKey SHCTX "Software\CyberChakra\Forensics"

  ; --- Check if data should be preserved ---
  ReadINIStr $0 "$INSTDIR\uninstall.ini" "Options" "PreserveData"
  ${If} $0 == "false"
    RMDir /r "$INSTDIR\data"
    RMDir /r "$INSTDIR\logs"
  ${EndIf}

  ; --- Clean up INI file ---
  Delete "$INSTDIR\uninstall.ini"
  Delete "$INSTDIR\.install_marker"

  ; --- Refresh shell ---
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

!macroend
```

---

## 3. Recommended Installer Flow for Forensics Software

### 3.1 Ideal Installation Steps

```
Step 1: Language Selection (English / Hindi)
    ├── Provided by Tauri NSIS displayLanguageSelector: true
    └── Custom languages via customLanguageFiles

Step 2: Welcome Page
    ├── Sidebar shows wolf logo + brand (welcomefinish.bmp)
    ├── Product name: "Cyber Chakra Forensics v2.0.0"
    └── "Professional Mobile Forensics Suite for Law Enforcement"

Step 3: License Agreement (EULA)
    ├── Displays LICENSE.txt content
    ├── Includes forensic usage terms from Section 4
    ├── Must accept to continue
    └── Provided automatically by bundle.licenseFile

Step 4: Install Mode Selection (if installMode: "both")
    ├── "Install for all users (requires Administrator)" [Recommended]
    └── "Install for current user only"

Step 5: Install Directory
    ├── Default: C:\Program Files\Cyber Chakra Forensics\ (perMachine)
    ├── Or: %LOCALAPPDATA%\Cyber Chakra Forensics\ (currentUser)
    └── Browse button for custom path

Step 6: Install Progress with Branding
    ├── Header image visible (header.bmp)
    ├── Progress bar with status messages
    ├── NSIS_HOOK_PREINSTALL creates data directories
    └── NSIS_HOOK_POSTINSTALL sets up file associations + registry

Step 7: Complete - Launch Application?
    ├── Sidebar shows wolf logo (welcomefinish.bmp)
    ├── "Launch Cyber Chakra Forensics" checkbox (default: checked)
    └── First launch triggers onboarding wizard
```

### 3.2 Why `installMode: "both"` for Forensics

For law enforcement deployment:
- **Government/Enterprise IT**: needs `perMachine` for all officers on a shared workstation
- **Field investigators**: may need `currentUser` for personal laptops without admin access
- **`both`** lets the user choose, but note it always requires Administrator even for current-user install

**Recommendation:** Use `"perMachine"` as default for government clients. Switch to `"both"` only if you need to support investigators installing without IT department involvement.

---

## 4. First-Run Experience

### 4.1 Current Onboarding Implementation

The frontend already has a comprehensive onboarding flow in `src/stores/onboardingStore.ts`:

```
welcome -> compatibility_check -> storage_setup -> license_choice
                                                        |
                                    +-------------------+-------------------+
                                    |                                       |
                              trial_request                         license_activation
                                    |                                       |
                              trial_pending                                 |
                                    |                                       |
                                    +-------------------+-------------------+
                                                        |
                                                   admin_setup
                                                        |
                                                     complete
```

### 4.2 Recommended First-Run Enhancements

**After install, app opens to onboarding wizard (already implemented). Additional checks to add:**

**A. Tool Availability Check (in `compatibility_check` step):**
```
ADB:
  Windows: Check src-tauri/tools/adb.exe exists
  Linux: Check `which adb`
  Action: Bundled with installer; warn if missing

wkhtmltopdf:
  Windows: Check src-tauri/tools/wkhtmltopdf/ directory
  Linux: Check `which wkhtmltopdf`
  Action: Bundled with installer; warn if missing (PDF reports will not work)

libimobiledevice (iOS):
  Windows: Check src-tauri/tools/libimobiledevice/ directory
  Linux: Check `which idevice_id`
  Action: Optional; warn that iOS support requires iTunes drivers on Windows
```

**B. System Requirements Validation:**
```
- Minimum 4 GB RAM (recommended 8 GB)
- Minimum 2 GB free disk space for installation
- Minimum 10 GB free disk space recommended for case data
- WebView2 Runtime installed (should be handled by installer)
- Screen resolution >= 1280x800
```

**C. Post-Install Marker Detection:**
The NSIS hook writes `.install_marker` to the install directory. On first launch, the app reads this marker to determine it's a fresh install vs. an update, and routes accordingly:
- Fresh install: full onboarding
- Update: skip onboarding, show "What's New" changelog

---

## 5. Enterprise and Government Deployment

### 5.1 Silent Installation

Tauri NSIS installers support standard NSIS command-line arguments:

```powershell
# Silent install (no UI)
.\Cyber-Chakra-Forensics_2.0.0_x64-setup.exe /S

# Silent install with custom directory (MUST be last parameter)
.\Cyber-Chakra-Forensics_2.0.0_x64-setup.exe /S /D=C:\ForensicsTools\CCF

# Silent uninstall
.\Cyber-Chakra-Forensics_2.0.0_x64-setup.exe /S --uninstall
```

**Important:** `/S` is case-sensitive (lowercase `/s` will NOT work).

### 5.2 Pre-Configured Settings via Registry

Use the NSIS post-install hook to write deployment configuration:

```nsis
; In NSIS_HOOK_POSTINSTALL, for enterprise deployment:
; Write license server override (for on-premise license servers)
WriteRegStr SHCTX "Software\CyberChakra\Forensics\Config" \
  "LicenseServer" "https://internal-license.agency.gov.in/api"

; Pre-set organization name
WriteRegStr SHCTX "Software\CyberChakra\Forensics\Config" \
  "Organization" "Central Bureau of Investigation"

; Disable auto-update for air-gapped environments
WriteRegDWORD SHCTX "Software\CyberChakra\Forensics\Config" \
  "DisableAutoUpdate" 1

; Set default case storage path
WriteRegStr SHCTX "Software\CyberChakra\Forensics\Config" \
  "CaseStoragePath" "D:\ForensicCases"
```

### 5.3 Enterprise Configuration File

Alternatively, a JSON config file can be placed alongside the installer or in the install directory:

**`enterprise-config.json` (placed in install directory before first launch):**
```json
{
  "license_server": "https://internal-license.agency.gov.in/api",
  "organization": "Central Bureau of Investigation",
  "auto_update": false,
  "case_storage_path": "D:\\ForensicCases",
  "default_examiner_prefix": "CBI-",
  "enforce_chain_of_custody": true,
  "require_section_65b": true,
  "audit_log_retention_days": 3650,
  "allowed_export_formats": ["pdf", "xlsx", "html"],
  "proxy_server": "http://proxy.internal:8080",
  "offline_license_mode": true
}
```

### 5.4 Group Policy / SCCM / Intune Deployment

**NSIS vs MSI for Enterprise:**

| Feature | NSIS (.exe) | MSI (.msi) |
|---------|-------------|------------|
| Group Policy deployment | Limited | Full support |
| SCCM/Intune | Supported via script | Native support |
| Silent install | `/S` flag | `msiexec /qn` |
| Rollback on failure | No | Automatic |
| Transforms (.mst) | No | Yes |
| Active Directory | Script-based | GPO native |

**Recommendation:** Tauri v2 supports both NSIS and MSI targets. For government deployment, generate BOTH:

```json
{
  "bundle": {
    "targets": ["nsis", "msi"]
  }
}
```

The MSI target enables:
- Group Policy deployment via Active Directory
- SCCM/Intune native package deployment
- Standard Windows Installer logging: `msiexec /i CCF.msi /L*v install.log`

### 5.5 Air-Gapped Environment Support

For networks with no internet access:

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller"
      },
      "nsis": {
        "installerHooks": "installer/hooks.nsh"
      }
    }
  },
  "plugins": {
    "updater": {
      "endpoints": []
    }
  }
}
```

**WebView2 Install Modes for Air-Gap Decision:**

| Mode | Installer Size Impact | Internet Required | Use Case |
|------|----------------------|-------------------|----------|
| `skip` | No impact | No (but WebView2 must be pre-installed) | Managed enterprise images |
| `downloadBootstrapper` | +~200 KB | Yes | Standard deployment (current) |
| `embedBootstrapper` | +~1.8 MB | Yes (for actual download) | Slightly better offline start |
| `offlineInstaller` | +~127 MB | No | Air-gapped government networks |
| `fixedRuntime` | +~180 MB | No | Maximum compatibility, fixed version |

**Recommendation for CMF:** Produce two installer variants:
1. **Standard:** `downloadBootstrapper` (~45 MB) for connected environments
2. **Offline:** `offlineInstaller` (~170 MB) for air-gapped government labs

### 5.6 Offline License Activation

The app should support offline activation for air-gapped environments:

```
1. User runs app -> "Activate License" screen
2. App generates Machine Request Code (hardware fingerprint + nonce)
3. User copies code to USB -> takes to connected machine
4. Visits https://cyberchakra.online/offline-activate
5. Enters request code + license key -> gets Activation Response Code
6. User copies response code back to air-gapped machine via USB
7. App validates response code (signed by license server's private key)
8. License activated without ever connecting to internet
```

---

## 6. Update Installer vs Fresh Installer

### 6.1 How Tauri NSIS Handles Updates

When a user runs a newer installer over an existing installation:

1. **NSIS detects existing installation** via registry keys (`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{identifier}`)
2. **Offers options:** Add/Reinstall, Uninstall, or Cancel
3. If reinstall: **overwrites application files** in the existing directory
4. **User data is preserved** because NSIS only replaces files it owns
5. The `data/`, `cases/`, `logs/`, and `exports/` directories created by hooks are NOT touched during update

### 6.2 Tauri Updater Plugin (In-App Updates)

The project already has the updater configured:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://cyberchakra.online/api/update-check.php?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNv..."
    }
  }
}
```

**How the Tauri updater works:**
1. App checks endpoint with current version, target OS, and architecture
2. Server responds with JSON: new version URL, signature, release notes
3. App downloads the update package (.nsis.zip for Windows)
4. Verifies Ed25519 signature against the `pubkey`
5. Runs the NSIS installer silently in the background
6. Prompts user to restart the app

**Update response format from server:**
```json
{
  "version": "2.1.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2026-03-28T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "base64-encoded-signature",
      "url": "https://releases.cyberchakra.online/v2.1.0/CCF_2.1.0_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "base64-encoded-signature",
      "url": "https://releases.cyberchakra.online/v2.1.0/CCF_2.1.0_amd64.AppImage.tar.gz"
    }
  }
}
```

### 6.3 Major Version Upgrades

The Tauri updater **can** handle major version upgrades (e.g., v2.x to v3.x) because it downloads a full installer, not a differential patch. Considerations:

- **Schema migrations:** The app's Rust backend (`db/mod.rs`) should handle SQLite schema upgrades on startup
- **Config migration:** If `tauri.conf.json` structure changes, migration code in the Rust startup
- **Breaking changes:** The update endpoint can return `"mandatory": true` to force the update
- **Data backup prompt:** Before major upgrades, prompt user to export/backup case data

### 6.4 What Gets Preserved During Updates

| Item | Preserved? | Location |
|------|-----------|----------|
| Case database (SQLite) | Yes | `%APPDATA%\com.cyberchakra.forensics\` |
| Extracted evidence | Yes | User-specified case directories |
| App settings | Yes | `%APPDATA%\com.cyberchakra.forensics\` |
| Audit logs | Yes | `%APPDATA%\com.cyberchakra.forensics\logs\` |
| License activation | Yes | Registry + hardware fingerprint |
| Bundled tools (ADB, etc.) | Overwritten | `$INSTDIR\tools\` |
| Application binary | Overwritten | `$INSTDIR\` |
| WebView2 files | Unchanged | System-managed |

---

## 7. Linux Distribution Strategy

### 7.1 Available Formats

The current `tauri.conf.json` only targets `["nsis"]`. Linux configuration already exists in the bundle config:

```json
{
  "bundle": {
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      },
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libssl3", "adb", "wkhtmltopdf"],
        "recommends": ["libimobiledevice-utils"],
        "section": "utils",
        "priority": "optional"
      },
      "rpm": {
        "depends": ["webkit2gtk4.1", "openssl-libs", "android-tools", "wkhtmltopdf"],
        "recommends": ["libimobiledevice-utils"]
      }
    }
  }
}
```

### 7.2 Format Comparison and Recommendation

| Format | Target Distros | Install Method | Auto-Update | Gov't Use | Priority |
|--------|---------------|----------------|-------------|-----------|----------|
| **AppImage** | All | Download + chmod +x | Via Tauri updater | Medium | **1 (Primary)** |
| **DEB** | Ubuntu, Debian, Kali | `apt install ./file.deb` | Via apt repo | High | **2** |
| **RPM** | Fedora, RHEL, BOSS | `dnf install ./file.rpm` | Via dnf repo | **Critical** | **3** |
| Flatpak | All (Flathub) | `flatpak install` | Flathub | Low | 5 (Skip for now) |
| Snap | Ubuntu | `snap install` | Snap Store | Low | 5 (Skip for now) |

### 7.3 Why RPM is Critical for Government

**BOSS Linux (Bharat Operating System Solutions)** is the official OS for Indian government agencies. BOSS is based on Debian, but **many state police departments also use Fedora/RHEL-based distros**. The RPM configuration is already in the project and should be actively tested.

### 7.4 Recommended Bundle Targets

```json
{
  "bundle": {
    "targets": ["nsis", "appimage", "deb", "rpm"]
  }
}
```

Or build selectively per platform:
```bash
# Windows
npm run tauri build -- --bundles nsis,msi

# Linux
npm run tauri build -- --bundles appimage,deb,rpm
```

### 7.5 Linux-Specific Considerations

**AppImage:**
- Portable, runs on any modern Linux distribution
- Self-contained; no installation needed
- User downloads, makes executable, and runs
- Best for field investigators who may not have root access
- Tauri updater works natively with AppImage

**DEB:**
- Proper system integration (desktop files, icons, MIME types)
- Dependency management via apt
- Can set up an apt repository for centralized updates
- The existing `.desktop` file in `resources/` is automatically included

**RPM:**
- Required for Fedora/RHEL/CentOS government deployments
- Can be signed with GPG key during build
- Supports dnf repository for managed updates

### 7.6 Linux Desktop File

Already exists at `src-tauri/resources/cyber-chakra-forensics.desktop` with correct categories (`Utility;System;Security;`), MIME type registration, and a "Create New Case" quick action.

---

## 8. Installer Size Optimization

### 8.1 Current Size Breakdown (Estimated)

| Component | Approximate Size | Notes |
|-----------|-----------------|-------|
| Rust binary (release, stripped) | ~15-25 MB | With `lto=true`, `strip="symbols"`, `opt-level=3` |
| WebView2 bootstrapper | ~200 KB | `downloadBootstrapper` mode |
| WebView2 offline installer | ~127 MB | `offlineInstaller` mode |
| WebView2 fixed runtime | ~180 MB | `fixedRuntime` mode |
| Frontend assets (JS/CSS/HTML) | ~3-5 MB | Vite-bundled, tree-shaken |
| Bundled ADB + Fastboot | ~6 MB | Platform tools |
| Bundled wkhtmltopdf | ~40 MB | Largest contributor (with DLLs) |
| Bundled libimobiledevice | ~15 MB | iOS tools |
| Resources (templates, licenses) | ~1 MB | Report templates, legal docs |
| NSIS installer overhead | ~200 KB | Installer UI code |
| **Total (downloadBootstrapper)** | **~45-70 MB** | Standard build |
| **Total (offlineInstaller)** | **~170-200 MB** | Air-gapped build |

### 8.2 NSIS Compression Options

```json
{
  "nsis": {
    "compression": "lzma"
  }
}
```

| Algorithm | Compression Ratio | Speed | Memory | Recommendation |
|-----------|------------------|-------|--------|----------------|
| **LZMA** | Best (~40-60% reduction) | Slow compress, fast decompress | 8 MB decompress | **Default, use this** |
| ZLIB | Good (~30-40%) | Fast both ways | 300 KB | Only if build time matters |
| BZIP2 | Better than ZLIB | Medium | 4 MB | No advantage over LZMA |
| None | 0% | Instant | None | Debug builds only |

Tauri uses `/SOLID` compression by default with LZMA, which means all files are compressed as a single solid archive for maximum compression.

### 8.3 Size Reduction Strategies

**A. Skip WebView2 if already installed (for managed environments):**
```json
{
  "webviewInstallMode": { "type": "skip" }
}
```
Saves ~127 MB for offline mode. Only safe when deploying to machines with known WebView2 installation (Windows 11 includes it by default).

**B. Separate wkhtmltopdf from main installer:**
wkhtmltopdf is ~40 MB and is the single largest bundled tool. Consider:
- Making it an optional download post-install
- Checking for system-installed wkhtmltopdf first
- Bundling only the .exe without the full DLL set (may not work)

**C. Optimize Rust binary further:**
Already well-optimized in `Cargo.toml`:
```toml
[profile.release]
lto = true
codegen-units = 1
opt-level = 3      # Could try "s" or "z" for size vs speed tradeoff
strip = "symbols"
panic = "abort"
```

Switching `opt-level = "z"` (optimize for size) could save ~2-5 MB at minimal performance cost.

**D. Exclude unused Cargo features:**
Review if all dependencies need all their features. The Cargo.toml has 60+ dependencies, some may be carrying unused code.

**E. UPX compression on the binary (not recommended for signed builds):**
UPX can compress the EXE by 50%, but it breaks code signing and may trigger antivirus false positives. Not suitable for forensics software.

### 8.4 Differential Updates

The Tauri updater downloads the **full NSIS installer** for each update. There is no built-in differential/delta update mechanism. Options:

1. **Accept full downloads:** At ~45 MB per update, this is acceptable for most connections
2. **Custom delta server:** Compute binary diffs (bsdiff/zstd) between versions server-side, deliver patches. Requires custom update endpoint implementation.
3. **Version-specific update URLs:** The endpoint already receives `current_version`, so it could route to smaller patch installers when possible.

---

## 9. Code Signing for Government Trust

### 9.1 Why Code Signing is Critical

For forensics software used in legal proceedings:
- **Windows SmartScreen** will warn users about unsigned installers
- **Chain of custody**: signed installer proves software integrity
- **Government procurement** often requires signed binaries
- **Antivirus false positives** are common with unsigned NSIS installers

### 9.2 Certificate Types

| Certificate | Cost | SmartScreen | Trust Level |
|-------------|------|-------------|-------------|
| Self-signed | Free | No trust | Internal testing only |
| Standard Code Signing (OV) | ~$200-400/yr | Builds reputation gradually | Good for most uses |
| **EV Code Signing** | ~$400-700/yr | **Immediate trust** | **Required for gov't** |

**Recommendation:** EV (Extended Validation) Code Signing Certificate. Provides immediate SmartScreen reputation (no gradual buildup) and maximum trust for government deployments.

### 9.3 Configuration for Code Signing

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "A1B2C3D4E5F6...",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

For CI/CD, use environment variables:
```bash
# In GitHub Actions
TAURI_SIGNING_PRIVATE_KEY=<base64-private-key>
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password>
```

### 9.4 Dual Signing (SHA-1 + SHA-256)

For maximum compatibility (Windows 7+):
```powershell
# Sign with SHA-256 (primary)
signtool sign /sha1 $THUMBPRINT /tr http://timestamp.digicert.com /td sha256 /fd sha256 "installer.exe"

# Append SHA-1 signature (legacy compatibility)
signtool sign /sha1 $THUMBPRINT /tr http://timestamp.digicert.com /td sha1 /fd sha1 /as "installer.exe"
```

---

## 10. Complete Configuration Reference

### 10.1 Recommended `tauri.conf.json` (Full Bundle Section)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Cyber Chakra Forensics",
  "version": "2.0.0",
  "identifier": "com.cyberchakra.forensics",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Cyber Chakra Forensics",
        "width": 1440,
        "height": 900,
        "minWidth": 1280,
        "minHeight": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": false,
        "transparent": false,
        "center": true,
        "skipTaskbar": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https: http://asset.localhost asset:; font-src 'self' https:; connect-src 'self' https://cyberchakra.online https://api.cyberchakra.online https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://login.microsoftonline.com https://graph.microsoft.com https://api.dropbox.com https://api.twitter.com https://localhost:*; frame-src https://accounts.google.com https://login.microsoftonline.com https://www.dropbox.com https://api.twitter.com; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com https://login.microsoftonline.com"
    },
    "withGlobalTauri": true
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "licenseFile": "../LICENSE.txt",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "resources": [
      "resources/*",
      "tools/*"
    ],
    "category": "Utility",
    "shortDescription": "Professional Mobile Forensics Suite for Law Enforcement",
    "longDescription": "Cyber Chakra Forensics is a professional mobile forensics application designed for law enforcement agencies, forensic investigators, and legal professionals. Features include forensic data acquisition, WhatsApp analysis, chain of custody management, and Section 63(4)(c) BSA 2023 compliant report generation.",
    "copyright": "Copyright 2024-2026 Cyber Chakra Technologies. All rights reserved.",
    "publisher": "Cyber Chakra Technologies",
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      },
      "deb": {
        "depends": [
          "libwebkit2gtk-4.1-0",
          "libssl3",
          "adb",
          "wkhtmltopdf"
        ],
        "recommends": [
          "libimobiledevice-utils"
        ],
        "section": "utils",
        "priority": "optional"
      },
      "rpm": {
        "depends": [
          "webkit2gtk4.1",
          "openssl-libs",
          "android-tools",
          "wkhtmltopdf"
        ],
        "recommends": [
          "libimobiledevice-utils"
        ]
      }
    },
    "windows": {
      "certificateThumbprint": null,
      "timestampUrl": "https://timestamp.digicert.com",
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      },
      "nsis": {
        "installMode": "both",
        "displayLanguageSelector": true,
        "languages": ["English"],
        "installerIcon": "icons/icon.ico",
        "headerImage": "installer/header.bmp",
        "sidebarImage": "installer/welcomefinish.bmp",
        "installerHooks": "installer/hooks.nsh",
        "compression": "lzma",
        "startMenuFolder": "Cyber Chakra Technologies"
      }
    }
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://cyberchakra.online/api/update-check.php?target={{target}}&arch={{arch}}&current_version={{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY4NjM1RDY2QTM2OERDMUYKUldRZjNHaWpabDFqYUFaRkZPYndDQ3dwZ3lvMXBSbUdVWlVLalZEN0gxVTF3Wnljcks4aHZvSmkK"
    }
  }
}
```

### 10.2 Air-Gapped Variant Override (`tauri.conf.airgap.json`)

This file can be merged at build time using `--config` flag:

```json
{
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller"
      },
      "nsis": {
        "installMode": "perMachine"
      }
    }
  },
  "plugins": {
    "updater": {
      "endpoints": []
    }
  }
}
```

Build command:
```bash
npm run tauri build -- --config src-tauri/tauri.conf.airgap.json
```

### 10.3 File Structure for Installer Assets

```
src-tauri/
  installer/
    header.bmp              (150x57, current)
    welcomefinish.bmp       (164x314, current)
    installer_icon.png      (256x256 source, current)
    generate_images.py      (regeneration script, current)
    hooks.nsh               (NSIS hooks, NEW)
    lang/
      hindi.nsh             (Hindi translations, NEW)
  icons/
    icon.ico                (multi-res, current)
    icon.png                (master, current)
    32x32.png               (current)
    128x128.png             (current)
    128x128@2x.png          (current)
    icon.icns               (macOS, current)
    Square*.png             (Windows Store, current)
  resources/
    cyber-chakra-forensics.desktop  (Linux desktop file, current)
    THIRD_PARTY_LICENSES.txt        (current)
  tools/
    README.txt              (current)
    wkhtmltopdf/            (current)
```

---

## 11. Implementation Checklist

### Priority 1: Critical (Before Next Release)

- [ ] **Change `installMode` from `"currentUser"` to `"both"`** -- government/enterprise needs per-machine installs
- [ ] **Add `installerHooks`** -- create `src-tauri/installer/hooks.nsh` with the hooks defined above
- [ ] **Add `startMenuFolder`** -- set to `"Cyber Chakra Technologies"`
- [ ] **Add `"msi"` to bundle targets** -- for Group Policy/SCCM deployment
- [ ] **Obtain EV Code Signing Certificate** -- configure `certificateThumbprint` and `timestampUrl`
- [ ] **Test silent install** -- verify `setup.exe /S` works end-to-end

### Priority 2: High (Next Sprint)

- [ ] **Create Hindi NSIS language file** (`installer/lang/hindi.nsh`)
- [ ] **Create air-gapped config variant** (`tauri.conf.airgap.json`) with `offlineInstaller`
- [ ] **Add enterprise config file support** -- read `enterprise-config.json` at startup
- [ ] **Test update flow** -- verify Tauri updater preserves user data and settings
- [ ] **Add Linux targets** -- update `targets` to include `["nsis", "msi", "appimage", "deb", "rpm"]` or build per-platform

### Priority 3: Enhancement (Backlog)

- [ ] **Regenerate branding images** -- run `generate_images.py` with actual wolf.png logo instead of simplified silhouette
- [ ] **Offline license activation flow** -- implement machine request code / response code system
- [ ] **Differential update server** -- implement delta patching for smaller update downloads
- [ ] **Investigate `opt-level = "z"`** -- test if size savings justify any performance difference
- [ ] **RPM signing** -- set up GPG key and configure RPM package signing
- [ ] **Flatpak/Snap** -- evaluate if needed for Ubuntu Software Center presence

---

## References

- [Tauri v2 Windows Installer Documentation](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri v2 Configuration Reference](https://v2.tauri.app/reference/config/)
- [Tauri v2 Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri v2 AppImage Distribution](https://v2.tauri.app/distribute/appimage/)
- [Tauri v2 Debian Distribution](https://v2.tauri.app/distribute/debian/)
- [Tauri v2 RPM Distribution](https://v2.tauri.app/distribute/rpm/)
- [NSIS Installer Hooks Feature Request (Issue #9668)](https://github.com/tauri-apps/tauri/issues/9668)
- [NSIS Compression Configuration (Issue #7685)](https://github.com/tauri-apps/tauri/issues/7685)
- [Tauri NSIS installer.nsi Template (Source)](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)
- [NSIS Best Practices](https://nsis.sourceforge.io/Best_practices)
