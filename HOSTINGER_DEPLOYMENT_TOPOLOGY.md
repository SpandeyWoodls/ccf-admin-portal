# Hostinger Deployment Topology -- CCF Admin Portal

**Author:** Agent 7 (Hostinger Deployment Topology Researcher)
**Date:** 2026-03-28
**Status:** Proposed
**Plan:** Hostinger Start Cloud Hosting (single site)

---

## Table of Contents

1. [Domain & DNS Architecture](#1-domain--dns-architecture)
2. [File System Layout](#2-file-system-layout)
3. [LiteSpeed Configuration](#3-litespeed-configuration)
4. [Node.js on Hostinger](#4-nodejs-on-hostinger)
5. [MySQL on Hostinger](#5-mysql-on-hostinger)
6. [Cron Jobs](#6-cron-jobs)
7. [Zero-Downtime Deployment Process](#7-zero-downtime-deployment-process)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Security Hardening](#9-security-hardening)
10. [Cost & Limits](#10-cost--limits)

---

## 1. Domain & DNS Architecture

### 1.1 Domain Layout

```
cyberchakra.online          --> Main website (hosted elsewhere / same Hostinger or any provider)
cyberchakra.online        --> Admin Portal (React SPA + Node.js API) -- Hostinger
cyberchakra.online      --> Backward-compat CNAME for desktop app v1.x -- Hostinger
```

### 1.2 Decision: Same Hostinger Site vs. Separate

**Recommendation: Single Hostinger site, two subdomains pointing to the same account.**

Rationale:
- Hostinger Start Cloud Hosting includes **1 website** with **unlimited subdomains** on the same account.
- Both `cyberchakra.online` and `cyberchakra.online` must reach the same Node.js backend (port 3001). Running two separate Node.js processes on Start Cloud would require two separate hosting plans.
- `cyberchakra.online` is a pure backward-compatibility alias -- its `.htaccess` rewrites all traffic to the same `/api/v1/` endpoints. It does NOT need its own codebase.
- Hostinger Start Cloud does not allow multiple independent sites. Subdomains share the same `public_html` or get their own directory under `~/domains/`.

Architecture decision:
- `cyberchakra.online` = primary subdomain, serves the React SPA and proxies API requests to Node.js.
- `cyberchakra.online` = secondary subdomain, has a minimal `.htaccess` that rewrites all PHP paths to the Node.js API via `cyberchakra.online`. No SPA files needed.

### 1.3 DNS Configuration (at Domain Registrar)

The domain `cyberchakra.online` must have its nameservers pointed to Hostinger, OR you manage DNS externally and add these records:

```dns
; --- Option A: If using Hostinger DNS (nameservers pointed to Hostinger) ---
; Managed in hPanel > Domains > DNS Zone Editor

cyberchakra.online.     CNAME   cloud-xfer.hostinger.com.     ; or the A record IP from hPanel
cyberchakra.online.   CNAME   cloud-xfer.hostinger.com.

; --- Option B: If using external DNS (Cloudflare, Route53, etc.) ---
; Point to the Hostinger server IP directly

cyberchakra.online.     A       <HOSTINGER_SERVER_IP>
cyberchakra.online.   A       <HOSTINGER_SERVER_IP>
```

**To find the Hostinger server IP:**
1. Log into hPanel at https://hpanel.hostinger.com
2. Go to **Hosting** > select your plan
3. The IP address is shown in the sidebar under **Plan Details** > **Server IP**

### 1.4 Subdomain Setup in hPanel

**Step-by-step for `cyberchakra.online`:**

1. Log into hPanel > select your Cloud Hosting plan
2. Go to **Domains** > **Subdomains** (left sidebar)
3. Enter `admin` in the subdomain field
4. The document root auto-fills to `domains/cyberchakra.online/public_html`
5. Click **Create**
6. Wait 2-5 minutes for DNS propagation within Hostinger

**Step-by-step for `cyberchakra.online`:**

1. Same process: enter `license` in the subdomain field
2. Document root auto-fills to `domains/cyberchakra.online/public_html`
3. Click **Create**

### 1.5 SSL Certificates

Hostinger provides free Let's Encrypt SSL for all subdomains on Cloud Hosting plans.

**Enable SSL for each subdomain:**

1. In hPanel, go to **Security** > **SSL**
2. You should see all your subdomains listed
3. For each (`cyberchakra.online` and `cyberchakra.online`):
   - Click **Install** or **Set up** next to the subdomain
   - Select **Let's Encrypt (free)**
   - Wait up to 10 minutes for certificate issuance
4. Enable **Force HTTPS** toggle for both subdomains

**SSL Notes:**
- Let's Encrypt certificates auto-renew every 90 days; Hostinger handles this automatically.
- If DNS propagation has not completed, SSL install will fail. Wait and retry.
- Wildcard SSL (`*.cyberchakra.online`) is available on Business Cloud and above plans. On Start Cloud, each subdomain gets its own certificate.

---

## 2. File System Layout

### 2.1 Complete Directory Tree

```
/home/<username>/                       # ~ (home directory)
│
├── domains/
│   ├── cyberchakra.online/
│   │   └── public_html/                # Document root for admin subdomain
│   │       ├── index.html              # React SPA entry point
│   │       ├── favicon.svg
│   │       ├── assets/                 # Vite-built JS/CSS chunks (hashed filenames)
│   │       │   ├── index-[hash].js
│   │       │   ├── index-[hash].css
│   │       │   └── vendor-[hash].js
│   │       └── .htaccess               # SPA routing + API proxy + security
│   │
│   └── cyberchakra.online/
│       └── public_html/                # Document root for legacy subdomain
│           └── .htaccess               # ONLY rewrites -- no SPA files
│
├── admin-portal/                       # Project source (cloned from git)
│   ├── frontend/
│   │   ├── src/
│   │   ├── dist/                       # Build output (copied to public_html)
│   │   └── package.json
│   ├── backend/
│   │   ├── src/
│   │   ├── dist/                       # Compiled TypeScript output
│   │   ├── node_modules/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── .env                        # PRODUCTION secrets (NOT in git)
│   │   └── package.json
│   ├── .htaccess                       # Template (copied to public_html)
│   ├── package.json
│   └── hostinger-deploy.md
│
├── backups/                            # Manual and scripted backups
│   ├── db/                             # mysqldump outputs
│   │   ├── ccf_admin_2026-03-28.sql.gz
│   │   └── ...
│   └── app/                            # Pre-deployment app backups
│       ├── public_html_2026-03-28.tar.gz
│       └── backend_2026-03-28.tar.gz
│
├── logs/                               # Application logs
│   ├── node-app.log                    # stdout from Node.js
│   ├── node-error.log                  # stderr from Node.js
│   └── cron/                           # Cron job outputs
│       ├── license-expiry.log
│       ├── session-cleanup.log
│       ├── analytics-aggregation.log
│       └── db-backup.log
│
├── scripts/                            # Operational scripts
│   ├── deploy.sh                       # Deployment script
│   ├── backup-db.sh                    # Database backup script
│   ├── restart-node.sh                 # Node.js restart helper
│   └── healthcheck.sh                  # External health check
│
└── public_html/                        # Root domain document root (if using root domain)
    └── index.html                      # Redirect to main website or placeholder
```

### 2.2 Key Paths Reference Table

| Purpose                        | Absolute Path                                                     |
|-------------------------------|-------------------------------------------------------------------|
| Admin SPA document root       | `/home/<username>/domains/cyberchakra.online/public_html/`      |
| Legacy subdomain doc root     | `/home/<username>/domains/cyberchakra.online/public_html/`    |
| Node.js app entry point       | `/home/<username>/admin-portal/backend/dist/index.js`             |
| Production `.env`             | `/home/<username>/admin-portal/backend/.env`                      |
| Prisma schema                 | `/home/<username>/admin-portal/backend/prisma/schema.prisma`      |
| Frontend build output         | `/home/<username>/admin-portal/frontend/dist/`                    |
| Database backups              | `/home/<username>/backups/db/`                                    |
| App logs                      | `/home/<username>/logs/`                                          |
| Cron log output               | `/home/<username>/logs/cron/`                                     |

---

## 3. LiteSpeed Configuration

Hostinger Cloud Hosting uses **LiteSpeed Web Server** (not Apache/Nginx), but LiteSpeed is fully compatible with `.htaccess` directives. All configuration is done via `.htaccess` files in the document root.

### 3.1 Primary `.htaccess` -- `cyberchakra.online`

This file goes in `/home/<username>/domains/cyberchakra.online/public_html/.htaccess`:

```apache
# =============================================================================
# CCF Admin Portal - LiteSpeed Configuration
# Deployed to: cyberchakra.online
# =============================================================================
# Handles five responsibilities:
#   1. HTTPS enforcement
#   2. Security headers
#   3. Legacy PHP endpoint rewrites (desktop app v1.x backward compat)
#   4. API proxy to Node.js backend on port 3001
#   5. React SPA fallback routing
#   6. Compression (gzip/brotli)
#   7. Static asset caching
# =============================================================================

# Enable rewrite engine
RewriteEngine On

# ---------------------------------------------------------------------------
# 1. HTTPS Enforcement (HTTP -> HTTPS redirect)
# ---------------------------------------------------------------------------
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# ---------------------------------------------------------------------------
# 2. Security Headers
# ---------------------------------------------------------------------------
<IfModule mod_headers.c>
    # Prevent MIME type sniffing
    Header always set X-Content-Type-Options "nosniff"

    # Prevent clickjacking
    Header always set X-Frame-Options "DENY"

    # XSS protection (legacy browsers)
    Header always set X-XSS-Protection "1; mode=block"

    # Referrer policy
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # Permissions policy (disable unnecessary browser APIs)
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"

    # HSTS -- force HTTPS for 1 year, include subdomains
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

    # Content Security Policy
    # Adjust 'connect-src' if the API is on a different origin
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://cyberchakra.online; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
</IfModule>

# ---------------------------------------------------------------------------
# 3. Legacy PHP Endpoint Rewrites (desktop app v1.x backward compatibility)
# ---------------------------------------------------------------------------
# The desktop app calls .php endpoints. These rewrites transparently
# redirect to the Node.js API so existing installations keep working.

# License management
RewriteRule ^api/activate\.php$                    /api/v1/license/activate [L,QSA]
RewriteRule ^api/validate\.php$                    /api/v1/license/validate [L,QSA]
RewriteRule ^api/deactivate\.php$                  /api/v1/license/deactivate [L,QSA]

# System
RewriteRule ^api/heartbeat\.php$                   /api/v1/heartbeat [L,QSA]
RewriteRule ^api/health\.php$                      /api/v1/health [L,QSA]
RewriteRule ^api/announcements\.php$               /api/v1/announcements [L,QSA]
RewriteRule ^api/update-check\.php$                /api/v1/update-check [L,QSA]

# Trial requests
RewriteRule ^api/trial-request\.php$               /api/v1/trial-request [L,QSA]
RewriteRule ^api/trial-request-status\.php$        /api/v1/trial-request-status [L,QSA]

# Support tickets
RewriteRule ^api/support/create-ticket\.php$       /api/v1/support/create-ticket [L,QSA]
RewriteRule ^api/support/ticket-status\.php$       /api/v1/support/ticket-status [L,QSA]
RewriteRule ^api/support/ticket-details\.php$      /api/v1/support/ticket-details [L,QSA]
RewriteRule ^api/support/reply-ticket\.php$        /api/v1/support/reply-ticket [L,QSA]

# ---------------------------------------------------------------------------
# 4. Proxy all /api/* requests to the Node.js backend (port 3001)
# ---------------------------------------------------------------------------
# LiteSpeed supports [P] flag for reverse proxy, same as Apache mod_proxy
RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

# ---------------------------------------------------------------------------
# 5. React SPA Fallback Routing
# ---------------------------------------------------------------------------
# If the requested file or directory does not exist on disk, serve index.html
# so React Router can handle the route on the client side.
# This MUST come after the API proxy rules.
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# ---------------------------------------------------------------------------
# 6. Compression (Gzip / Brotli)
# ---------------------------------------------------------------------------
# LiteSpeed handles Brotli natively when the client supports it.
# These directives enable gzip as a fallback.

<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE text/javascript
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/json
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE image/svg+xml
    AddOutputFilterByType DEFLATE application/font-woff
    AddOutputFilterByType DEFLATE application/font-woff2
</IfModule>

# ---------------------------------------------------------------------------
# 7. Static Asset Caching
# ---------------------------------------------------------------------------
# Vite hashes filenames, so we can cache forever (1 year).
# index.html must NOT be cached (or only briefly) so users get new deploys.

<IfModule mod_expires.c>
    ExpiresActive On

    # Default: no cache
    ExpiresDefault "access plus 0 seconds"

    # HTML -- short cache (revalidate on each visit)
    ExpiresByType text/html "access plus 0 seconds"

    # JS, CSS (Vite-hashed filenames) -- cache for 1 year
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType text/javascript "access plus 1 year"

    # Images -- cache for 1 month
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType image/gif "access plus 1 month"
    ExpiresByType image/svg+xml "access plus 1 month"
    ExpiresByType image/x-icon "access plus 1 year"

    # Fonts -- cache for 1 year
    ExpiresByType font/woff "access plus 1 year"
    ExpiresByType font/woff2 "access plus 1 year"
    ExpiresByType application/font-woff "access plus 1 year"
    ExpiresByType application/font-woff2 "access plus 1 year"
</IfModule>

# Cache-Control headers for hashed assets
<IfModule mod_headers.c>
    <FilesMatch "\.(js|css|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>

    # Do NOT cache HTML (ensures users get the latest SPA shell)
    <FilesMatch "\.html$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
        Header set Pragma "no-cache"
        Header set Expires "0"
    </FilesMatch>
</IfModule>

# ---------------------------------------------------------------------------
# 8. Deny Access to Sensitive Files
# ---------------------------------------------------------------------------
<FilesMatch "(\.env|\.git|\.htpasswd|composer\.json|package\.json|tsconfig\.json)$">
    Order Allow,Deny
    Deny from all
</FilesMatch>
```

### 3.2 Legacy Subdomain `.htaccess` -- `cyberchakra.online`

This file goes in `/home/<username>/domains/cyberchakra.online/public_html/.htaccess`:

```apache
# =============================================================================
# License Server Backward Compatibility
# Deployed to: cyberchakra.online
# =============================================================================
# Desktop app v1.x calls cyberchakra.online/api/*.php
# This .htaccess redirects ALL requests to cyberchakra.online
# which hosts the actual Node.js API.
# =============================================================================

RewriteEngine On

# Force HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# ---- Redirect all /api/* paths to cyberchakra.online ----
# The desktop app sends requests to cyberchakra.online/api/activate.php etc.
# We redirect them (301 permanent) to the new admin portal, which handles
# the .php -> /api/v1/ rewrite internally.

# License endpoints
RewriteRule ^api/activate\.php$           https://cyberchakra.online/api/v1/license/activate [R=307,L,QSA]
RewriteRule ^api/validate\.php$           https://cyberchakra.online/api/v1/license/validate [R=307,L,QSA]
RewriteRule ^api/deactivate\.php$         https://cyberchakra.online/api/v1/license/deactivate [R=307,L,QSA]

# System
RewriteRule ^api/heartbeat\.php$          https://cyberchakra.online/api/v1/heartbeat [R=307,L,QSA]
RewriteRule ^api/health\.php$             https://cyberchakra.online/api/v1/health [R=307,L,QSA]
RewriteRule ^api/announcements\.php$      https://cyberchakra.online/api/v1/announcements [R=307,L,QSA]
RewriteRule ^api/update-check\.php$       https://cyberchakra.online/api/v1/update-check [R=307,L,QSA]

# Trial
RewriteRule ^api/trial-request\.php$      https://cyberchakra.online/api/v1/trial-request [R=307,L,QSA]
RewriteRule ^api/trial-request-status\.php$ https://cyberchakra.online/api/v1/trial-request-status [R=307,L,QSA]

# Support
RewriteRule ^api/support/(.*)\.php$       https://cyberchakra.online/api/v1/support/$1 [R=307,L,QSA]

# Catch-all: redirect any other API request to admin portal
RewriteRule ^api/(.*)$                    https://cyberchakra.online/api/$1 [R=307,L,QSA]

# Non-API requests: redirect to the admin portal homepage
RewriteRule ^(.*)$                        https://cyberchakra.online/$1 [R=301,L]
```

**Why 307 for POST endpoints (not 301/302):**
HTTP 307 preserves the original HTTP method. A 301/302 redirect causes browsers and HTTP clients (including Rust's `reqwest`) to change POST to GET, which would break the license activation and validation endpoints. The desktop app sends POST requests, so 307 is mandatory.

### 3.3 How LiteSpeed Serves Static Files

LiteSpeed serves static files directly from the document root without involving Node.js:

```
Request: GET https://cyberchakra.online/assets/index-abc123.js
   |
   v
LiteSpeed checks: /home/<username>/domains/cyberchakra.online/public_html/assets/index-abc123.js
   |
   +--> File exists? YES --> Serve directly (fast, no proxy overhead)
   |
   +--> File exists? NO  --> .htaccess SPA fallback kicks in, serves index.html
```

For API requests:
```
Request: POST https://cyberchakra.online/api/v1/license/activate
   |
   v
LiteSpeed matches: RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]
   |
   v
Proxy to: http://127.0.0.1:3001/api/v1/license/activate
   |
   v
Node.js Express handles the request
```

### 3.4 LiteSpeed Proxy Configuration Notes

The `[P]` flag in the RewriteRule activates LiteSpeed's built-in reverse proxy. Key details:

- **No separate proxy module needed.** LiteSpeed's built-in proxy handles this natively, unlike Apache which requires `mod_proxy` and `mod_proxy_http`.
- **ProxyPassReverse is automatic.** LiteSpeed handles response header rewriting (Location headers, etc.) automatically when using `[P]`.
- **Connection pooling.** LiteSpeed maintains persistent connections to the backend Node.js process, reducing overhead.
- **Timeout.** Default proxy timeout is 60 seconds. For long-running API requests (e.g., bulk license generation), this may need adjustment via the Hostinger support ticket (not configurable in `.htaccess`).

---

## 4. Node.js on Hostinger

### 4.1 hPanel Node.js Application Manager vs. Manual PM2

Hostinger Cloud Hosting provides a built-in **Node.js Application Manager** in hPanel. This is the recommended approach.

**hPanel Node.js Manager (RECOMMENDED):**
- Managed via hPanel GUI -- no SSH needed for basic operations
- Auto-restart on crash
- Port assignment handled automatically
- Log viewing in hPanel
- One-click restart/stop

**Manual PM2 (FALLBACK):**
- More control over process management
- Better log rotation
- Cluster mode for multi-core (not needed on Start Cloud -- single vCPU)
- Requires SSH access and manual setup
- PM2 must be installed globally or via npx

**Decision: Use hPanel Node.js Manager as the primary approach, with PM2 as documented fallback.**

### 4.2 Setting Up Node.js via hPanel

**Step-by-step:**

1. Log into hPanel > select your Cloud Hosting plan
2. Go to **Advanced** > **Node.js** in the left sidebar
3. Click **Create Application**
4. Configure these settings:

| Setting               | Value                                         |
|-----------------------|-----------------------------------------------|
| Node.js version       | **20.x** (LTS) -- match your dev environment |
| Application root      | `admin-portal/backend`                        |
| Application startup file | `dist/index.js`                            |
| Port                  | `3001` (or auto-assigned by Hostinger)        |

5. Click **Save** / **Create**
6. In the application settings, add a startup command if needed:
   ```
   node dist/index.js
   ```
7. Click **Start Application**

**Important:** After creating the application, Hostinger shows you a virtual environment activation command. If you SSH in, you may need to run this before executing Node.js commands:

```bash
# The exact command is shown in hPanel after creating the app
source /home/<username>/nodevenv/admin-portal/backend/20/bin/activate
```

### 4.3 Alternative: PM2 Setup via SSH

If the hPanel manager does not meet your needs:

```bash
# SSH into the server
ssh -i ~/.ssh/hostinger_deploy <username>@<HOSTINGER_IP> -p 65002

# Navigate to the backend directory
cd ~/admin-portal/backend

# Install PM2 locally (global install may not be permitted on shared hosting)
npm install pm2

# Create PM2 ecosystem config
cat > ecosystem.config.cjs << 'PMEOF'
module.exports = {
  apps: [{
    name: 'ccf-admin-backend',
    script: './dist/index.js',
    cwd: '/home/<username>/admin-portal/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    // Log configuration
    error_file: '/home/<username>/logs/node-error.log',
    out_file: '/home/<username>/logs/node-app.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 5000,
  }]
};
PMEOF

# Start the application
npx pm2 start ecosystem.config.cjs

# Save the PM2 process list (so it survives PM2 restarts)
npx pm2 save

# Set up PM2 to start on system boot
npx pm2 startup
# Run the command it outputs (may require sudo -- check with Hostinger support)
```

### 4.4 Auto-Restart on Crash

**With hPanel Manager:**
- Auto-restart is built in. The process manager detects crashes and restarts automatically.
- No configuration needed.

**With PM2:**
- `autorestart: true` in `ecosystem.config.cjs` handles this.
- `exp_backoff_restart_delay: 100` adds exponential backoff to prevent rapid restart loops.
- `max_restarts: 10` limits restart attempts to prevent infinite crash loops.

### 4.5 Environment Variable Management

Environment variables are stored in `/home/<username>/admin-portal/backend/.env` and loaded by `dotenv/config` at the top of `src/index.ts`.

**Production `.env` file:**

```bash
# Create the production .env file
cat > ~/admin-portal/backend/.env << 'ENVEOF'
# =============================================================================
# CCF Admin Portal - PRODUCTION Environment
# =============================================================================
# WARNING: This file contains secrets. Never commit to git.
# =============================================================================

# --- Database ---
# Hostinger prefixes database name and user with your account username
DATABASE_URL="mysql://u123456789_ccf_admin:YOUR_STRONG_DB_PASSWORD@localhost:3306/u123456789_ccf_admin"

# --- JWT Authentication ---
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="<64-char-hex-string>"
JWT_REFRESH_SECRET="<another-64-char-hex-string>"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# --- License Server ---
# CRITICAL: Must match the desktop app's CCF_HMAC_SECRET exactly
CCF_HMAC_SECRET="<your-production-hmac-secret>"

# --- Server ---
PORT=3001
CORS_ORIGIN="https://cyberchakra.online"
NODE_ENV="production"

# --- Email (SMTP via Hostinger) ---
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT=465
SMTP_USER="noreply@cyberchakra.in"
SMTP_PASS="<email-account-password>"
SMTP_FROM="CCF Admin <noreply@cyberchakra.in>"
ENVEOF

# Secure the file permissions
chmod 600 ~/admin-portal/backend/.env
```

**Important notes on .env management:**
- The deploy workflow (GitHub Actions) does NOT overwrite `.env`. It is managed manually on the server.
- When adding new environment variables, update both `.env.example` (in git) and the server's `.env` (via SSH).
- Generate JWT secrets on the server itself for maximum security:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```

### 4.6 Log Files

**With hPanel Node.js Manager:**
- Logs are viewable in hPanel under the Node.js application settings
- Location: varies by Hostinger version, typically `/home/<username>/logs/` or viewable via hPanel only

**With PM2:**
| Log File              | Path                                         | Content                |
|-----------------------|----------------------------------------------|------------------------|
| Application stdout    | `/home/<username>/logs/node-app.log`         | Console.log output     |
| Application stderr    | `/home/<username>/logs/node-error.log`       | Error stack traces     |
| PM2 daemon log        | `~/.pm2/logs/`                               | PM2 internal logs      |

**Log rotation with PM2:**

```bash
# Install pm2-logrotate module
npx pm2 install pm2-logrotate

# Configure rotation
npx pm2 set pm2-logrotate:max_size 10M    # Rotate when file reaches 10MB
npx pm2 set pm2-logrotate:retain 7         # Keep 7 rotated files
npx pm2 set pm2-logrotate:compress true    # Compress rotated files
npx pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

---

## 5. MySQL on Hostinger

### 5.1 Creating the Database via hPanel

1. Log into hPanel > select your Cloud Hosting plan
2. Go to **Databases** > **MySQL Databases**
3. Fill in the creation form:

| Field         | Value                   | Notes                                           |
|---------------|-------------------------|------------------------------------------------|
| Database name | `ccf_admin`             | Hostinger will prefix it: `u123456789_ccf_admin`|
| Username      | `ccf_admin_user`        | Becomes: `u123456789_ccf_admin_user`            |
| Password      | (generate a strong one) | Use the hPanel password generator               |

4. Click **Create**
5. **Record the full prefixed names** -- you need them for `DATABASE_URL`

### 5.2 Connection String Format

The Prisma `DATABASE_URL` follows this format:

```
mysql://USERNAME:PASSWORD@HOST:PORT/DATABASE
```

For Hostinger:

```
mysql://u123456789_ccf_admin_user:YourStr0ngP@ss!@localhost:3306/u123456789_ccf_admin
```

**Key details:**
- Host is always `localhost` or `127.0.0.1` (MySQL runs on the same server)
- Port is always `3306` (MySQL default)
- The username and database name are always prefixed with your Hostinger account username (e.g., `u123456789_`)
- Special characters in the password must be URL-encoded (e.g., `@` becomes `%40`, `#` becomes `%23`)

### 5.3 Accessing phpMyAdmin

1. In hPanel, go to **Databases** > **phpMyAdmin**
2. Click **Enter phpMyAdmin** next to your database
3. This opens phpMyAdmin in a new tab, pre-authenticated

**Direct URL (if needed):** `https://pma.hostinger.com` -- log in with your database credentials.

### 5.4 Initial Database Setup (Prisma)

After creating the MySQL database and configuring `DATABASE_URL`:

```bash
# SSH into the server
ssh -i ~/.ssh/hostinger_deploy <username>@<HOSTINGER_IP> -p 65002

# Activate the Node.js environment (if using hPanel Node.js manager)
source /home/<username>/nodevenv/admin-portal/backend/20/bin/activate

# Navigate to the backend
cd ~/admin-portal/backend

# Generate Prisma Client
npx prisma generate

# Push schema to create all tables (safe -- only adds, never drops)
npx prisma db push

# Seed the default admin user
npx tsx src/seed.ts
```

**Verify tables were created:**

```bash
mysql -u u123456789_ccf_admin_user -p u123456789_ccf_admin -e "SHOW TABLES;"
```

Expected output (21 tables):
```
admin_sessions
admin_users
announcements
audit_logs
blocked_versions
contacts
downloads
heartbeats
license_activations
license_events
licenses
organizations
release_assets
releases
rollout_policies
rollout_stages
settings
support_tickets
ticket_messages
trial_requests
_prisma_migrations (if using migrate, or no _prisma_migrations if using db push)
```

### 5.5 Backup Strategy

**Hostinger Auto-Backups:**
- Hostinger Cloud plans include **weekly automatic backups** (retained for 30 days)
- Restore via hPanel > **Files** > **Backups** > **Databases**
- These are full-server backups, not database-specific

**Manual Backup Script (RECOMMENDED for critical data):**

Create `/home/<username>/scripts/backup-db.sh`:

```bash
#!/bin/bash
# =============================================================================
# CCF Admin Portal - Database Backup Script
# Run via cron: 0 1 * * * /home/<username>/scripts/backup-db.sh
# =============================================================================

set -euo pipefail

# Configuration
DB_USER="u123456789_ccf_admin_user"
DB_PASS="YOUR_DB_PASSWORD"
DB_NAME="u123456789_ccf_admin"
BACKUP_DIR="/home/<username>/backups/db"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H%M)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform the dump (compressed)
mysqldump \
    --user="$DB_USER" \
    --password="$DB_PASS" \
    --single-transaction \
    --routines \
    --triggers \
    --add-drop-table \
    --complete-insert \
    "$DB_NAME" | gzip > "$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

# Verify the backup file is not empty
FILESIZE=$(stat -c%s "$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz" 2>/dev/null || echo "0")
if [ "$FILESIZE" -lt 1000 ]; then
    echo "[ERROR] Backup file is suspiciously small (${FILESIZE} bytes). Check mysqldump output."
    exit 1
fi

echo "[OK] Backup created: ${DB_NAME}_${DATE}.sql.gz (${FILESIZE} bytes)"

# Delete backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
echo "[OK] Cleaned up backups older than ${RETENTION_DAYS} days"
```

```bash
# Make executable
chmod +x ~/scripts/backup-db.sh

# Test it
~/scripts/backup-db.sh
```

### 5.6 Database Restore

```bash
# Restore from a gzipped backup
gunzip < ~/backups/db/u123456789_ccf_admin_2026-03-28_0100.sql.gz | \
    mysql -u u123456789_ccf_admin_user -p u123456789_ccf_admin
```

### 5.7 Performance Tuning

Hostinger Cloud Hosting uses shared MySQL. You cannot modify `my.cnf` directly. Available optimizations:

**Connection limits:**
- Hostinger Start Cloud: typically 30 concurrent MySQL connections
- Prisma's default connection pool size is `num_cpus * 2 + 1`. For Start Cloud (1 vCPU), this is ~3 connections.
- You can override via the `DATABASE_URL` connection string:
  ```
  mysql://user:pass@localhost:3306/db?connection_limit=10
  ```
- Recommended: `connection_limit=10` (leave headroom for phpMyAdmin and cron jobs)

**Query optimization:**
- Prisma schema already includes indexes on all foreign keys and frequently queried columns
- Use `prisma.$queryRaw` for complex analytics queries that benefit from raw SQL
- The `analytics_daily` aggregation (via cron) pre-computes dashboard metrics to avoid expensive real-time queries

**Monitoring database size:**
```bash
# Check database size
mysql -u u123456789_ccf_admin_user -p -e "
    SELECT
        table_schema AS 'Database',
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
    FROM information_schema.tables
    WHERE table_schema = 'u123456789_ccf_admin'
    GROUP BY table_schema;
"

# Check individual table sizes
mysql -u u123456789_ccf_admin_user -p -e "
    SELECT
        table_name AS 'Table',
        ROUND(data_length / 1024 / 1024, 2) AS 'Data (MB)',
        ROUND(index_length / 1024 / 1024, 2) AS 'Index (MB)',
        table_rows AS 'Approx Rows'
    FROM information_schema.tables
    WHERE table_schema = 'u123456789_ccf_admin'
    ORDER BY (data_length + index_length) DESC;
"
```

---

## 6. Cron Jobs

### 6.1 How Cron Works on Hostinger

Hostinger provides cron job management via hPanel:

1. Go to hPanel > **Advanced** > **Cron Jobs**
2. Select the cron timing (or enter a custom expression)
3. Enter the command
4. Click **Add**

**Important cron considerations:**
- Hostinger cron runs commands as your hosting user (not root)
- The working directory is `/home/<username>/` by default
- You must specify the full path to `node` OR activate the Node.js virtual environment first
- Output is emailed to your hosting email unless redirected to a file

### 6.2 Node.js Path for Cron

The Node.js binary on Hostinger is typically at:
```
/home/<username>/nodevenv/admin-portal/backend/20/bin/node
```

Or you can use the system node:
```
/usr/bin/node
```

**To find the exact path:** SSH in and run `which node` after activating the Node.js environment.

### 6.3 Cron Job Schedule

**Note:** The backend already runs `setInterval`-based cron jobs via `startCronJobs()` in `src/cron/index.ts`. These run as long as the Node.js process is alive. The hPanel cron jobs below are an **additional safety layer** -- they run the same logic via standalone invocation in case the Node.js process was restarted and missed a cycle. They also serve as the mechanism for tasks that should run even if the Node.js process is temporarily down.

#### Job 1: Database Backup (Daily at 1:00 AM IST)

```
Cron Expression: 30 19 * * *
```
*(1:00 AM IST = 7:30 PM UTC the previous day)*

```bash
/bin/bash /home/<username>/scripts/backup-db.sh >> /home/<username>/logs/cron/db-backup.log 2>&1
```

#### Job 2: License Expiry Check (Daily at 2:00 AM IST)

```
Cron Expression: 30 20 * * *
```
*(2:00 AM IST = 8:30 PM UTC the previous day)*

```bash
cd /home/<username>/admin-portal/backend && /home/<username>/nodevenv/admin-portal/backend/20/bin/node dist/cron/license-expiry.js >> /home/<username>/logs/cron/license-expiry.log 2>&1
```

**Note:** This requires creating a standalone entry point. Since the cron functions are exported from the backend source, create a minimal runner:

Create `/home/<username>/admin-portal/backend/src/cron/run-license-expiry.ts`:
```typescript
import "dotenv/config";
import { checkLicenseExpiry } from "./license-expiry.js";

checkLicenseExpiry()
  .then((count) => {
    console.log(`[${new Date().toISOString()}] Expired ${count} license(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] Error:`, err);
    process.exit(1);
  });
```

After building (`npm run build`), the compiled file will be at `dist/cron/run-license-expiry.js`.

The cron command becomes:
```bash
cd /home/<username>/admin-portal/backend && /home/<username>/nodevenv/admin-portal/backend/20/bin/node dist/cron/run-license-expiry.js >> /home/<username>/logs/cron/license-expiry.log 2>&1
```

#### Job 3: Session Cleanup (Every 6 hours)

```
Cron Expression: 0 */6 * * *
```

```bash
cd /home/<username>/admin-portal/backend && /home/<username>/nodevenv/admin-portal/backend/20/bin/node dist/cron/run-session-cleanup.js >> /home/<username>/logs/cron/session-cleanup.log 2>&1
```

#### Job 4: Analytics Aggregation (Daily at 3:00 AM IST)

```
Cron Expression: 30 21 * * *
```
*(3:00 AM IST = 9:30 PM UTC the previous day)*

```bash
cd /home/<username>/admin-portal/backend && /home/<username>/nodevenv/admin-portal/backend/20/bin/node dist/cron/run-analytics-aggregation.js >> /home/<username>/logs/cron/analytics-aggregation.log 2>&1
```

#### Job 5: Health Check Probe (Every 5 minutes)

```
Cron Expression: */5 * * * *
```

```bash
curl -sf https://cyberchakra.online/api/v1/health -o /dev/null || echo "[$(date -Iseconds)] HEALTH CHECK FAILED" >> /home/<username>/logs/cron/healthcheck.log
```

#### Job 6: Stale Activation Cleanup (Weekly, Sunday 4:00 AM IST)

```
Cron Expression: 30 22 * * 0
```

```bash
cd /home/<username>/admin-portal/backend && /home/<username>/nodevenv/admin-portal/backend/20/bin/node dist/cron/run-stale-activations.js >> /home/<username>/logs/cron/stale-activations.log 2>&1
```

#### Job 7: Log Rotation (Daily at midnight IST)

```
Cron Expression: 30 18 * * *
```

```bash
/bin/bash -c 'for f in /home/<username>/logs/cron/*.log; do if [ -f "$f" ] && [ $(stat -c%s "$f" 2>/dev/null || echo 0) -gt 10485760 ]; then mv "$f" "${f}.$(date +\%Y\%m\%d)"; gzip "${f}.$(date +\%Y\%m\%d)"; fi; done; find /home/<username>/logs/cron/ -name "*.gz" -mtime +30 -delete'
```

### 6.4 Complete Cron Summary Table

| Job                     | Expression       | IST Time              | Purpose                              |
|-------------------------|------------------|-----------------------|--------------------------------------|
| Database backup         | `30 19 * * *`    | Daily 1:00 AM         | mysqldump to ~/backups/db/           |
| License expiry          | `30 20 * * *`    | Daily 2:00 AM         | Mark expired licenses                |
| Analytics aggregation   | `30 21 * * *`    | Daily 3:00 AM         | Pre-compute dashboard metrics        |
| Session cleanup         | `0 */6 * * *`    | Every 6 hours         | Remove expired JWT sessions          |
| Health check            | `*/5 * * * *`    | Every 5 minutes       | Verify API is responding             |
| Stale activations       | `30 22 * * 0`    | Weekly Sun 4:00 AM    | Flag machines with no heartbeat 30d+ |
| Log rotation            | `30 18 * * *`    | Daily midnight IST    | Compress logs >10MB, delete >30d     |

### 6.5 Creating Standalone Cron Runners

To make the cron functions callable from the command line, create entry-point files:

```bash
# Create all cron runner files
for JOB in license-expiry session-cleanup analytics-aggregation stale-activations heartbeat-cleanup; do
    FUNC_NAME=$(echo "$JOB" | sed 's/-\([a-z]\)/\U\1/g')
    cat > ~/admin-portal/backend/src/cron/run-${JOB}.ts << RUNEOF
import "dotenv/config";
import { ${FUNC_NAME} } from "./${JOB}.js";

${FUNC_NAME}()
  .then((result) => {
    console.log(\`[\${new Date().toISOString()}] ${JOB}: completed\`, result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(\`[\${new Date().toISOString()}] ${JOB}: ERROR\`, err);
    process.exit(1);
  });
RUNEOF
done
```

Then rebuild:
```bash
cd ~/admin-portal/backend && npm run build
```

---

## 7. Zero-Downtime Deployment Process

### 7.1 Automated Deployment (GitHub Actions)

The existing `.github/workflows/deploy.yml` provides a CI/CD pipeline. Here is the enhanced version with zero-downtime steps:

**Workflow summary:**

```
1. Developer pushes to main branch (or manually triggers workflow)
2. GitHub Actions: checkout, install deps, build frontend + backend
3. GitHub Actions: scp built artifacts to Hostinger
4. GitHub Actions: SSH into Hostinger, run prisma db push, restart Node.js
5. GitHub Actions: verify health endpoint
```

### 7.2 Manual Deployment Script

Create `/home/<username>/scripts/deploy.sh`:

```bash
#!/bin/bash
# =============================================================================
# CCF Admin Portal - Manual Deployment Script
# Usage: ~/scripts/deploy.sh
# =============================================================================

set -euo pipefail

# Configuration
APP_DIR="/home/<username>/admin-portal"
ADMIN_PUBLIC="/home/<username>/domains/cyberchakra.online/public_html"
LICENSE_PUBLIC="/home/<username>/domains/cyberchakra.online/public_html"
BACKUP_DIR="/home/<username>/backups/app"
NODE_BIN="/home/<username>/nodevenv/admin-portal/backend/20/bin/node"
NPM_BIN="/home/<username>/nodevenv/admin-portal/backend/20/bin/npm"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "============================================"
echo "  CCF Admin Portal - Deployment"
echo "  Started: $(date -Iseconds)"
echo "============================================"

# ── Step 1: Pre-deployment backup ──────────────────────────────────────────
echo ""
echo "[1/8] Creating pre-deployment backups..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/public_html_${TIMESTAMP}.tar.gz" -C "$ADMIN_PUBLIC" . 2>/dev/null || echo "  (no existing public_html to backup)"
tar -czf "$BACKUP_DIR/backend_dist_${TIMESTAMP}.tar.gz" -C "$APP_DIR/backend/dist" . 2>/dev/null || echo "  (no existing backend dist to backup)"
echo "  Backups saved to $BACKUP_DIR"

# Clean up old backups (keep last 5)
ls -1t "$BACKUP_DIR"/public_html_*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
ls -1t "$BACKUP_DIR"/backend_dist_*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

# ── Step 2: Pull latest code ──────────────────────────────────────────────
echo ""
echo "[2/8] Pulling latest code..."
cd "$APP_DIR"
git pull origin main

# ── Step 3: Install dependencies ──────────────────────────────────────────
echo ""
echo "[3/8] Installing dependencies..."
cd "$APP_DIR/frontend" && $NPM_BIN ci --production=false
cd "$APP_DIR/backend" && $NPM_BIN ci

# ── Step 4: Generate Prisma Client ────────────────────────────────────────
echo ""
echo "[4/8] Generating Prisma client..."
cd "$APP_DIR/backend"
npx prisma generate

# ── Step 5: Build frontend and backend ────────────────────────────────────
echo ""
echo "[5/8] Building frontend..."
cd "$APP_DIR/frontend"
echo 'VITE_API_URL="https://cyberchakra.online"' > .env
$NPM_BIN run build

echo "[5/8] Building backend..."
cd "$APP_DIR/backend"
$NPM_BIN run build

# ── Step 6: Deploy frontend (atomic swap via temp directory) ──────────────
echo ""
echo "[6/8] Deploying frontend to $ADMIN_PUBLIC..."
# Use rsync for atomic-ish deployment (avoids brief period with no files)
rsync -a --delete "$APP_DIR/frontend/dist/" "$ADMIN_PUBLIC/"
# Ensure .htaccess is in place
cp "$APP_DIR/.htaccess" "$ADMIN_PUBLIC/.htaccess"
echo "  Frontend deployed."

# Ensure license subdomain .htaccess exists
mkdir -p "$LICENSE_PUBLIC"
if [ ! -f "$LICENSE_PUBLIC/.htaccess" ]; then
    echo "  Creating cyberchakra.online .htaccess..."
    # This will be created separately -- see Section 3.2
fi

# ── Step 7: Database migration (safe -- only adds, never drops) ──────────
echo ""
echo "[7/8] Running Prisma db push..."
cd "$APP_DIR/backend"
npx prisma db push --accept-data-loss=false
echo "  Database schema updated."

# ── Step 8: Restart Node.js ──────────────────────────────────────────────
echo ""
echo "[8/8] Restarting Node.js backend..."

# Option A: hPanel Node.js manager (restart via touch)
# Hostinger's Node.js manager watches the startup file for changes.
# Touching it triggers a restart.
touch "$APP_DIR/backend/dist/index.js"

# Option B: PM2 (uncomment if using PM2 instead of hPanel manager)
# npx pm2 restart ccf-admin-backend --update-env

echo "  Waiting 5 seconds for startup..."
sleep 5

# ── Verification ─────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Post-Deployment Verification"
echo "============================================"

# Health check
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://cyberchakra.online/api/v1/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "  [PASS] Health endpoint: HTTP 200"
else
    echo "  [FAIL] Health endpoint: HTTP $HTTP_CODE"
    echo "  WARNING: Backend may not have started correctly."
    echo "  Check logs: npx pm2 logs ccf-admin-backend"
fi

# Frontend check
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" https://cyberchakra.online/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "  [PASS] Frontend: HTTP 200"
else
    echo "  [FAIL] Frontend: HTTP $HTTP_CODE"
fi

echo ""
echo "Deployment completed at $(date -Iseconds)"
echo "============================================"
```

```bash
chmod +x ~/scripts/deploy.sh
```

### 7.3 Step-by-Step Manual Deployment

If not using the script above, follow these steps in order:

```bash
# 1. SSH into Hostinger
ssh -i ~/.ssh/hostinger_deploy <username>@<HOSTINGER_IP> -p 65002

# 2. Create pre-deployment database backup
~/scripts/backup-db.sh

# 3. Pull latest code
cd ~/admin-portal
git pull origin main

# 4. Install dependencies
cd frontend && npm ci --production=false
cd ../backend && npm ci

# 5. Generate Prisma client
cd ~/admin-portal/backend
npx prisma generate

# 6. Build frontend
cd ~/admin-portal/frontend
echo 'VITE_API_URL="https://cyberchakra.online"' > .env
npm run build

# 7. Build backend
cd ~/admin-portal/backend
npm run build

# 8. Deploy frontend files
rsync -a --delete ~/admin-portal/frontend/dist/ ~/domains/cyberchakra.online/public_html/
cp ~/admin-portal/.htaccess ~/domains/cyberchakra.online/public_html/.htaccess

# 9. Safe database migration (Prisma db push -- only adds columns/tables)
cd ~/admin-portal/backend
npx prisma db push --accept-data-loss=false

# 10. Restart Node.js
touch ~/admin-portal/backend/dist/index.js   # hPanel manager restart
# OR: npx pm2 restart ccf-admin-backend      # PM2 restart

# 11. Wait and verify
sleep 5
curl -s https://cyberchakra.online/api/v1/health
# Expected: {"success":true,"data":{"status":"ok",...},"error":null}
```

### 7.4 Rollback Procedure

```bash
# 1. Restore frontend from backup
cd ~/backups/app
tar -xzf public_html_<TIMESTAMP>.tar.gz -C ~/domains/cyberchakra.online/public_html/

# 2. Restore backend from backup
tar -xzf backend_dist_<TIMESTAMP>.tar.gz -C ~/admin-portal/backend/dist/

# 3. Restart Node.js
touch ~/admin-portal/backend/dist/index.js

# 4. If database schema was changed, restore from MySQL backup
gunzip < ~/backups/db/u123456789_ccf_admin_<DATE>.sql.gz | mysql -u u123456789_ccf_admin_user -p u123456789_ccf_admin
```

---

## 8. Monitoring & Alerting

### 8.1 Health Check Endpoint

The backend exposes `GET /api/v1/health` which checks:
- API process is alive
- Database connection is working (via Prisma `SELECT 1`)

Response format:
```json
{
    "success": true,
    "data": {
        "status": "ok",
        "version": "1.0.0",
        "uptime": 86400,
        "database": "connected"
    },
    "error": null
}
```

### 8.2 External Monitoring with UptimeRobot (Free Tier)

**Setup UptimeRobot (https://uptimerobot.com):**

1. Create a free account at https://uptimerobot.com
2. Add these monitors:

| Monitor Name          | Type      | URL                                              | Interval | Alert |
|-----------------------|-----------|--------------------------------------------------|----------|-------|
| CCF Admin - API       | HTTP(s)   | `https://cyberchakra.online/api/v1/health`    | 5 min    | Email + Telegram |
| CCF Admin - Frontend  | HTTP(s)   | `https://cyberchakra.online/`                  | 5 min    | Email + Telegram |
| CCF License - Compat  | HTTP(s)   | `https://cyberchakra.online/api/health.php`  | 5 min    | Email + Telegram |
| CCF Admin - SSL       | Keyword   | `https://cyberchakra.online/`                  | 24 hr    | Email (SSL expiry) |

3. Set up alert contacts:
   - Email: admin@cyberchakra.in
   - Telegram: create a bot via @BotFather, add the chat ID
   - Optional: Slack webhook

4. For the API health check, configure a **keyword monitor** that expects `"status":"ok"` in the response body (catches cases where the endpoint returns 200 but the database is down).

### 8.3 Health Check Script (Server-Side)

Create `/home/<username>/scripts/healthcheck.sh`:

```bash
#!/bin/bash
# =============================================================================
# CCF Admin Portal - Health Check Script
# Runs as cron every 5 minutes; attempts auto-recovery on failure.
# =============================================================================

HEALTH_URL="https://cyberchakra.online/api/v1/health"
LOG_FILE="/home/<username>/logs/cron/healthcheck.log"
TIMESTAMP=$(date -Iseconds)

# Check the health endpoint
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    # Healthy -- log only once per hour to avoid filling the log
    MINUTE=$(date +%M)
    if [ "$MINUTE" = "00" ]; then
        echo "[$TIMESTAMP] OK (HTTP 200)" >> "$LOG_FILE"
    fi
else
    echo "[$TIMESTAMP] FAIL (HTTP $HTTP_CODE) - attempting restart" >> "$LOG_FILE"

    # Attempt auto-recovery: restart Node.js
    touch /home/<username>/admin-portal/backend/dist/index.js

    # Wait and recheck
    sleep 10
    HTTP_CODE_2=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE_2" = "200" ]; then
        echo "[$TIMESTAMP] RECOVERED after restart (HTTP 200)" >> "$LOG_FILE"
    else
        echo "[$TIMESTAMP] STILL DOWN after restart (HTTP $HTTP_CODE_2) - manual intervention needed" >> "$LOG_FILE"
        # Optionally send an alert via curl to a webhook
        # curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
        #     -d "chat_id=<CHAT_ID>&text=CCF Admin Portal is DOWN! HTTP $HTTP_CODE_2"
    fi
fi
```

```bash
chmod +x ~/scripts/healthcheck.sh
```

### 8.4 Database Size Monitoring

Create `/home/<username>/scripts/monitor-db-size.sh`:

```bash
#!/bin/bash
# =============================================================================
# Monitor database size and warn if approaching limits
# Hostinger Start Cloud: typically 1GB MySQL storage
# =============================================================================

DB_USER="u123456789_ccf_admin_user"
DB_PASS="YOUR_DB_PASSWORD"
DB_NAME="u123456789_ccf_admin"
WARN_MB=800  # Warn at 800MB (80% of 1GB limit)
LOG_FILE="/home/<username>/logs/cron/db-size.log"
TIMESTAMP=$(date -Iseconds)

SIZE_MB=$(mysql -u "$DB_USER" -p"$DB_PASS" -N -e "
    SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2)
    FROM information_schema.tables
    WHERE table_schema = '$DB_NAME';
" 2>/dev/null)

echo "[$TIMESTAMP] Database size: ${SIZE_MB}MB" >> "$LOG_FILE"

if (( $(echo "$SIZE_MB > $WARN_MB" | bc -l) )); then
    echo "[$TIMESTAMP] WARNING: Database size ${SIZE_MB}MB exceeds ${WARN_MB}MB threshold!" >> "$LOG_FILE"
    # Send alert
fi
```

### 8.5 Disk Space Monitoring

Add this cron job (daily):

```bash
# Check disk usage
DISK_USAGE=$(df -h /home/<username> | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo "[$(date -Iseconds)] WARNING: Disk usage at ${DISK_USAGE}%" >> /home/<username>/logs/cron/disk-space.log
fi
```

### 8.6 Monitoring Summary

| What                    | How                              | Frequency     | Alert Channel     |
|-------------------------|----------------------------------|---------------|-------------------|
| API availability        | UptimeRobot + cron healthcheck  | Every 5 min   | Email + Telegram  |
| Frontend availability   | UptimeRobot                     | Every 5 min   | Email + Telegram  |
| SSL certificate         | UptimeRobot SSL monitor         | Daily         | Email             |
| Database connectivity   | Health endpoint (includes DB)   | Every 5 min   | Via API monitor   |
| Database size           | `monitor-db-size.sh` cron       | Daily         | Log + optional    |
| Disk space              | Cron job                        | Daily         | Log + optional    |
| Node.js crashes         | PM2 auto-restart + log alerts   | Real-time     | Log file          |
| Backup success          | `backup-db.sh` exit code + size | Daily         | Cron email        |

---

## 9. Security Hardening

### 9.1 SSH Hardening

```bash
# On the Hostinger server, ensure only key-based auth is used
# (Hostinger may restrict this via hPanel -- check SSH settings)

# Generate a dedicated deployment key
ssh-keygen -t ed25519 -C "ccf-deploy-key" -f ~/.ssh/ccf_hostinger_deploy -N ""

# Add the public key to Hostinger via hPanel > Advanced > SSH Access
```

### 9.2 File Permissions

```bash
# Restrict .env file
chmod 600 ~/admin-portal/backend/.env

# Restrict backup scripts (contain DB passwords)
chmod 700 ~/scripts/backup-db.sh

# Restrict backup directory
chmod 700 ~/backups/

# Ensure public_html is readable by the web server
chmod 755 ~/domains/cyberchakra.online/public_html/
chmod 644 ~/domains/cyberchakra.online/public_html/.htaccess
chmod 644 ~/domains/cyberchakra.online/public_html/index.html
```

### 9.3 Firewall & IP Restrictions

Hostinger Cloud Hosting includes a web application firewall (WAF) via LiteSpeed. Additional restrictions:

**Restrict phpMyAdmin access (optional):**
- Use hPanel's IP restriction feature under Security settings
- Or restrict phpMyAdmin to specific IPs via the hPanel firewall

**Rate limiting:**
- Already implemented in the Node.js backend via `express-rate-limit`
- See `backend/src/middleware/rateLimiter.ts` for the limits:
  - Login: strict brute-force protection
  - Activation: tight limit per license key
  - Public API: moderate limit per IP
  - Admin API: standard limit per authenticated user

### 9.4 CORS Configuration

The backend CORS is configured in `src/index.ts`:
```typescript
cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()),
    // ...
})
```

For production, set:
```
CORS_ORIGIN="https://cyberchakra.online"
```

**If the desktop app needs to make requests from a browser context (unlikely but possible):**
```
CORS_ORIGIN="https://cyberchakra.online,https://cyberchakra.online"
```

---

## 10. Cost & Limits

### 10.1 Hostinger Start Cloud Hosting Limits

| Resource          | Limit (Start Cloud)    | Our Expected Usage       |
|-------------------|------------------------|--------------------------|
| Websites          | 1                      | 1 (with 2 subdomains)   |
| Storage (SSD)     | 50 GB                  | ~2-5 GB (code + DB)     |
| Bandwidth         | ~100 GB/mo             | ~10-20 GB/mo            |
| RAM               | 2 GB                   | ~512MB (Node.js + MySQL)|
| vCPU              | 2 cores                | Sufficient               |
| MySQL databases   | Unlimited              | 1                        |
| Subdomains        | Unlimited              | 2                        |
| Email accounts    | 1                      | 1 (noreply@cyberchakra.in)|
| SSH access        | Yes                    | Required                 |
| Node.js support   | Yes (via hPanel)       | Required                 |
| Cron jobs         | Yes (via hPanel)       | 7 jobs                   |
| Free SSL          | Yes (Let's Encrypt)    | 2 certificates           |
| Auto-backup       | Weekly (30-day retain) | Supplemented by manual   |

### 10.2 Cost Estimate

| Item                           | Monthly Cost    |
|--------------------------------|-----------------|
| Hostinger Start Cloud (annual) | ~$9.99/mo ($120/yr) |
| Domain (cyberchakra.online)    | Already owned   |
| UptimeRobot (free tier)        | $0              |
| GitHub Actions (free for repo) | $0              |
| **Total**                      | **~$10/mo (~830 INR/mo)** |

### 10.3 Scaling Path

If the portal outgrows Start Cloud:

| Trigger                           | Action                                           |
|-----------------------------------|--------------------------------------------------|
| >50 concurrent API requests       | Upgrade to Business Cloud (4 vCPU, 4GB RAM)      |
| >1GB database size                | Upgrade to Business Cloud (larger MySQL limits)   |
| Need staging environment          | Add a second Hostinger plan for staging           |
| Need Redis/caching                | Migrate to VPS or Hostinger VPS plan              |
| >100 GB bandwidth/month           | Upgrade to Business Cloud or add CDN (Cloudflare) |
| Need geographic redundancy        | Migrate to AWS/Vercel (as per MASTER_PLAN.md)    |

---

## Appendix A: Complete Setup Checklist

```
PRE-DEPLOYMENT
  [ ] Hostinger Start Cloud Hosting plan purchased
  [ ] SSH access enabled in hPanel
  [ ] cyberchakra.online DNS pointed to Hostinger (or A records added)

DNS & SUBDOMAINS
  [ ] cyberchakra.online subdomain created in hPanel
  [ ] cyberchakra.online subdomain created in hPanel
  [ ] DNS propagation verified (nslookup cyberchakra.online)

SSL
  [ ] Let's Encrypt SSL installed for cyberchakra.online
  [ ] Let's Encrypt SSL installed for cyberchakra.online
  [ ] Force HTTPS enabled for both subdomains

DATABASE
  [ ] MySQL database created in hPanel (note the prefixed name)
  [ ] Database user created with password
  [ ] Connection tested: mysql -u USER -p -e "SELECT 1;"

NODE.JS
  [ ] Node.js 20.x application created in hPanel
  [ ] Application root: admin-portal/backend
  [ ] Startup file: dist/index.js
  [ ] Port: 3001

PROJECT FILES
  [ ] Git repository cloned to ~/admin-portal/
  [ ] Backend .env file created with production values
  [ ] JWT secrets generated (2 x 64-char hex strings)
  [ ] CCF_HMAC_SECRET matches the desktop app
  [ ] Dependencies installed (npm run install:all)
  [ ] Prisma client generated (npx prisma generate)
  [ ] Database tables created (npx prisma db push)
  [ ] Default admin user seeded (npx tsx src/seed.ts)

FRONTEND
  [ ] Frontend .env set: VITE_API_URL="https://cyberchakra.online"
  [ ] Frontend built (npm run build)
  [ ] Built files copied to ~/domains/cyberchakra.online/public_html/
  [ ] .htaccess copied to public_html/

BACKEND
  [ ] Backend built (npm run build in backend/)
  [ ] Node.js application started via hPanel
  [ ] Health check passing: curl https://cyberchakra.online/api/v1/health

LEGACY COMPAT
  [ ] cyberchakra.online .htaccess deployed
  [ ] Legacy .php endpoints tested and redirecting correctly

CRON JOBS
  [ ] Database backup cron configured
  [ ] License expiry check cron configured
  [ ] Session cleanup cron configured
  [ ] Analytics aggregation cron configured
  [ ] Health check cron configured
  [ ] Stale activation cleanup cron configured
  [ ] Log rotation cron configured

SCRIPTS
  [ ] ~/scripts/deploy.sh created and executable
  [ ] ~/scripts/backup-db.sh created and executable
  [ ] ~/scripts/healthcheck.sh created and executable

DIRECTORIES
  [ ] ~/backups/db/ created
  [ ] ~/backups/app/ created
  [ ] ~/logs/ created
  [ ] ~/logs/cron/ created

MONITORING
  [ ] UptimeRobot monitors configured
  [ ] Alert contacts set up (email + Telegram)
  [ ] First database backup completed successfully

SECURITY
  [ ] .env file permissions set to 600
  [ ] Default admin password changed from ChangeMe123!
  [ ] GitHub secrets configured (HOSTINGER_HOST, HOSTINGER_USER, HOSTINGER_SSH_KEY)

VERIFICATION
  [ ] Admin portal loads at https://cyberchakra.online/
  [ ] Admin login works
  [ ] API health check returns 200
  [ ] Legacy PHP path (activate.php) redirects correctly
  [ ] License activation flow tested end-to-end
  [ ] cyberchakra.online redirects to admin portal
```

---

## Appendix B: Troubleshooting Quick Reference

| Symptom                                | Likely Cause                          | Fix                                                    |
|----------------------------------------|---------------------------------------|--------------------------------------------------------|
| 502 Bad Gateway on `/api/*`            | Node.js not running on port 3001     | Restart via hPanel or `touch dist/index.js`            |
| Blank page at admin portal URL         | Frontend files not in public_html     | `rsync -a frontend/dist/ ~/domains/.../public_html/`   |
| `.htaccess` not working                | LiteSpeed override not enabled        | Contact Hostinger support to enable AllowOverride All   |
| `prisma db push` fails                 | Wrong DATABASE_URL or DB not created  | Verify full prefixed DB name and credentials           |
| SSL certificate not installing         | DNS not yet propagated                | Wait 24h, verify with `nslookup cyberchakra.online`  |
| Node.js version wrong                  | hPanel Node.js not configured         | Set version 20.x in hPanel > Advanced > Node.js        |
| Cron jobs not running                  | Wrong node path in cron command       | SSH in, `which node`, update cron command path          |
| `CORS error` in browser console        | CORS_ORIGIN mismatch                 | Set `CORS_ORIGIN=https://cyberchakra.online` in .env |
| `Connection refused` from DB           | MySQL credentials wrong               | Check hPanel for the full prefixed username/dbname      |
| Legacy .php redirect loses POST body   | Using 301/302 instead of 307         | Use `[R=307,L]` flag in RewriteRule                    |
| Disk space full                        | Log files or backups accumulating     | Run log rotation, clean old backups                     |
| PM2 process not starting on reboot     | `pm2 startup` not configured          | Run `npx pm2 startup` and execute the output command   |

---

## Appendix C: Command Cheat Sheet

```bash
# ── SSH Connect ──────────────────────────────────────────────────
ssh -i ~/.ssh/hostinger_deploy <username>@<IP> -p 65002

# ── Node.js Environment ─────────────────────────────────────────
source /home/<username>/nodevenv/admin-portal/backend/20/bin/activate

# ── Service Management ───────────────────────────────────────────
# Restart Node.js (hPanel manager)
touch ~/admin-portal/backend/dist/index.js

# Restart Node.js (PM2)
npx pm2 restart ccf-admin-backend
npx pm2 logs ccf-admin-backend --lines 50

# ── Database ─────────────────────────────────────────────────────
# Quick query
mysql -u u123456789_ccf_admin_user -p u123456789_ccf_admin

# Backup
~/scripts/backup-db.sh

# Check size
mysql -u u123456789_ccf_admin_user -p -e "SELECT ROUND(SUM(data_length + index_length)/1024/1024, 2) AS 'MB' FROM information_schema.tables WHERE table_schema='u123456789_ccf_admin';"

# ── Prisma ───────────────────────────────────────────────────────
cd ~/admin-portal/backend
npx prisma db push              # Apply schema changes
npx prisma studio               # Visual DB browser (port 5555)
npx prisma generate             # Regenerate client after schema change

# ── Deployment ───────────────────────────────────────────────────
~/scripts/deploy.sh             # Full deployment
rsync -a ~/admin-portal/frontend/dist/ ~/domains/cyberchakra.online/public_html/  # Frontend only

# ── Monitoring ───────────────────────────────────────────────────
curl -s https://cyberchakra.online/api/v1/health | python3 -m json.tool
tail -f ~/logs/node-app.log
tail -f ~/logs/cron/healthcheck.log

# ── Log Viewing ──────────────────────────────────────────────────
# Recent Node.js errors
tail -100 ~/logs/node-error.log

# Cron job outputs
ls -la ~/logs/cron/
tail -50 ~/logs/cron/license-expiry.log
```
