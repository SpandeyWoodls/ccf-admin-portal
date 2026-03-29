# Hostinger Deployment Guide -- CCF Admin Portal

Step-by-step instructions for deploying the CCF Admin Portal to Hostinger shared/VPS hosting at `admin.cyberchakra.in`.

---

## Prerequisites

- Hostinger Business or VPS plan with Node.js support
- SSH access enabled in hPanel
- Domain `cyberchakra.in` pointed to Hostinger nameservers

---

## Step 1: Set Up Subdomain

1. Log in to **hPanel** at https://hpanel.hostinger.com
2. Navigate to **Domains** > **Subdomains**
3. Create subdomain: `admin.cyberchakra.in`
4. Note the document root (typically `public_html/admin.cyberchakra.in/` or `domains/admin.cyberchakra.in/public_html/`)

---

## Step 2: Enable SSL

1. In hPanel, go to **Security** > **SSL**
2. Select the `admin.cyberchakra.in` subdomain
3. Install **Let's Encrypt** free SSL certificate
4. Enable **Force HTTPS** redirect
5. Wait for propagation (up to 10 minutes)

---

## Step 3: Create MySQL Database

1. In hPanel, go to **Databases** > **MySQL Databases**
2. Create a new database:
   - Database name: `ccf_admin` (Hostinger may prefix with your username, e.g., `u123456789_ccf_admin`)
   - Username: `ccf_admin_user` (will also be prefixed)
   - Password: generate a strong password and save it securely
3. Note the full database name, username, password, and host (usually `localhost` or `127.0.0.1`)

---

## Step 4: SSH into Server

```bash
# Connect via SSH (replace with your Hostinger SSH credentials)
ssh u123456789@your-server-ip -p 65002

# Verify Node.js is available
node --version    # Should be 20.x+
npm --version     # Should be 10.x+
```

> If Node.js is not the right version, use hPanel's **Advanced** > **Node.js** manager to set the version to 20 LTS.

---

## Step 5: Set Up Node.js via hPanel

1. Go to **Advanced** > **Node.js** in hPanel
2. Click **Create Application**
3. Configure:
   - Node.js version: **20.x** (LTS)
   - Application root: `admin-portal/backend`
   - Application startup file: `dist/index.js`
   - Port: `3001` (or assigned by Hostinger)
4. Save the application

---

## Step 6: Upload Project Files

```bash
# Option A: Clone from repository
cd ~
git clone https://your-repo-url.git admin-portal

# Option B: Upload via SFTP/SCP
# Use FileZilla or scp to upload the admin-portal directory

# Navigate to the project
cd ~/admin-portal
```

---

## Step 7: Configure Environment Variables

```bash
# Copy the example and edit with production values
cp .env.example backend/.env

# Edit the .env file
nano backend/.env
```

Set production values:

```env
# Database (use the credentials from Step 3)
DATABASE_URL="mysql://u123456789_ccf_admin_user:YOUR_STRONG_PASSWORD@localhost:3306/u123456789_ccf_admin"

# JWT - generate unique secrets for production
# Use: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="<generated-64-char-hex-string>"
JWT_REFRESH_SECRET="<another-generated-64-char-hex-string>"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# License Server - must match the desktop app's HMAC secret
CCF_HMAC_SECRET="<your-production-hmac-secret>"

# Server
PORT=3001
CORS_ORIGIN="https://admin.cyberchakra.in"
NODE_ENV="production"
```

---

## Step 8: Install Dependencies and Set Up Database

```bash
cd ~/admin-portal

# Install all dependencies
npm run install:all

# Push Prisma schema to create database tables
npm run db:push

# Seed the default admin user
npm run db:seed
```

---

## Step 9: Build the Frontend

```bash
cd ~/admin-portal/frontend

# Create frontend .env with production API URL
echo 'VITE_API_URL="https://admin.cyberchakra.in"' > .env

# Build for production
npm run build
```

---

## Step 10: Deploy Frontend to public_html

```bash
# Copy the built frontend files to the subdomain's document root
# Adjust the path based on your Hostinger setup
cp -r ~/admin-portal/frontend/dist/* ~/domains/admin.cyberchakra.in/public_html/

# Alternatively, if using the default structure:
# cp -r ~/admin-portal/frontend/dist/* ~/public_html/admin.cyberchakra.in/
```

---

## Step 11: Configure .htaccess

```bash
# Copy the .htaccess to the document root
cp ~/admin-portal/.htaccess ~/domains/admin.cyberchakra.in/public_html/.htaccess
```

The `.htaccess` file handles:
- Legacy `.php` endpoint rewrites for backward compatibility with desktop app v1.x
- Proxying `/api/*` requests to the Node.js backend on port 3001
- SPA fallback routing for React Router

---

## Step 12: Start the Node.js Backend

```bash
cd ~/admin-portal/backend

# Build the TypeScript backend
npm run build

# Option A: Start via hPanel Node.js manager (recommended)
# Use the hPanel interface to start/restart the application

# Option B: Start manually with PM2 (if available)
npx pm2 start dist/index.js --name ccf-admin-backend
npx pm2 save
npx pm2 startup
```

Verify the backend is running:

```bash
curl http://127.0.0.1:3001/api/v1/health
# Should return: {"status":"ok", ...}
```

---

## Step 13: Set Up Cron Jobs

In hPanel, go to **Advanced** > **Cron Jobs** and add the following:

### License Expiry Check (runs daily at 2:00 AM)

```
0 2 * * * cd ~/admin-portal/backend && /usr/bin/node dist/cron/check-license-expiry.js
```

Marks expired licenses, sends notification emails to customers approaching expiry.

### Session Cleanup (runs every 6 hours)

```
0 */6 * * * cd ~/admin-portal/backend && /usr/bin/node dist/cron/cleanup-sessions.js
```

Removes expired refresh tokens and stale sessions from the database.

### Analytics Aggregation (runs daily at 3:00 AM)

```
0 3 * * * cd ~/admin-portal/backend && /usr/bin/node dist/cron/aggregate-analytics.js
```

Aggregates daily analytics data (active licenses, heartbeat counts, feature usage) into summary tables for the dashboard.

---

## Step 14: Verify Deployment

Run through this checklist to confirm everything is working:

```bash
# 1. Health check
curl https://admin.cyberchakra.in/api/v1/health

# 2. Frontend loads
# Open https://admin.cyberchakra.in in a browser -- should see the login page

# 3. Admin login works
# Log in with admin@cyberchakra.in / ChangeMe123!
# IMMEDIATELY change the default password

# 4. Legacy PHP endpoints redirect correctly
curl -I https://admin.cyberchakra.in/api/health.php
# Should return 200 (proxied to Node.js backend)

# 5. License activation (test with a valid license key)
curl -X POST https://admin.cyberchakra.in/api/v1/license/validate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"TEST-KEY","hardwareId":"test-hw-id"}'
```

---

## Troubleshooting

### Backend not starting

- Check logs: `npx pm2 logs ccf-admin-backend` or check hPanel error logs
- Verify `.env` file exists in `backend/` with correct `DATABASE_URL`
- Verify MySQL credentials are correct: `mysql -u USER -p -e "SHOW DATABASES;"`

### 502 Bad Gateway on /api/ routes

- The Node.js backend is not running on port 3001
- Check if the port is blocked: `netstat -tlnp | grep 3001`
- Restart the backend via hPanel or PM2

### Frontend shows blank page

- Check that `frontend/dist/` files were copied to the correct `public_html`
- Verify `.htaccess` is in the document root
- Check browser console for errors (wrong `VITE_API_URL`)

### Database connection refused

- Verify MySQL is running: `systemctl status mysql`
- Check that the database name and credentials in `.env` match what hPanel shows
- Hostinger prefixes database/user names -- ensure you use the full prefixed name

---

## Updating the Deployment

```bash
cd ~/admin-portal

# Pull latest changes
git pull origin main

# Install any new dependencies
npm run install:all

# Run database migrations if schema changed
npm run db:push

# Rebuild frontend
cd frontend && npm run build
cp -r dist/* ~/domains/admin.cyberchakra.in/public_html/

# Rebuild and restart backend
cd ../backend && npm run build
npx pm2 restart ccf-admin-backend
```
