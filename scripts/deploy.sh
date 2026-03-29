#!/bin/bash
# =============================================================================
# CCF Admin Portal - Deployment Script for Hostinger Cloud
# =============================================================================
# Creates a deployment package for uploading to Hostinger Start Cloud.
#
# Usage:
#   ./scripts/deploy.sh [production|staging]
#
# Prerequisites:
#   - Node.js 20+ installed locally
#   - Frontend and backend source code present
#   - .htaccess file present (scripts/hostinger.htaccess)
# =============================================================================

set -euo pipefail

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "============================================"
echo "  CCF Admin Portal - Deployment Builder"
echo "  Environment: $ENVIRONMENT"
echo "============================================"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "ERROR: Unknown environment '$ENVIRONMENT'. Use 'production' or 'staging'."
  exit 1
fi

# ─── 1. Build frontend ──────────────────────────────────────────────────────

echo "[1/4] Building frontend..."
cd "$PROJECT_DIR/frontend"
npm ci
npm run build
cd "$PROJECT_DIR"
echo "  Frontend build complete."

# ─── 2. Build backend ───────────────────────────────────────────────────────

echo "[2/4] Building backend..."
cd "$PROJECT_DIR/backend"
npm ci
npx prisma generate
npm run build
cd "$PROJECT_DIR"
echo "  Backend build complete."

# ─── 3. Create deployment package ───────────────────────────────────────────

DEPLOY_DIR="$PROJECT_DIR/deploy-$(date +%Y%m%d-%H%M%S)"
echo "[3/4] Creating deployment package: $DEPLOY_DIR/"

mkdir -p "$DEPLOY_DIR"

# Frontend static files -> public_html
cp -r "$PROJECT_DIR/frontend/dist" "$DEPLOY_DIR/public_html"
cp "$SCRIPT_DIR/hostinger.htaccess" "$DEPLOY_DIR/public_html/.htaccess"

# Backend
mkdir -p "$DEPLOY_DIR/backend"
cp -r "$PROJECT_DIR/backend/dist" "$DEPLOY_DIR/backend/"
cp -r "$PROJECT_DIR/backend/prisma" "$DEPLOY_DIR/backend/"
cp "$PROJECT_DIR/backend/package.json" "$DEPLOY_DIR/backend/"
cp "$PROJECT_DIR/backend/package-lock.json" "$DEPLOY_DIR/backend/"

# Scripts (for server-side use)
mkdir -p "$DEPLOY_DIR/scripts"
cp "$SCRIPT_DIR/hostinger-setup.sh" "$DEPLOY_DIR/scripts/"
cp "$SCRIPT_DIR/backup-db.sh" "$DEPLOY_DIR/scripts/"
chmod +x "$DEPLOY_DIR/scripts/"*.sh

# ─── 4. Create production .env template ─────────────────────────────────────

echo "[4/4] Creating .env template..."

cat > "$DEPLOY_DIR/backend/.env.template" << 'EOF'
DATABASE_URL="mysql://USERNAME:PASSWORD@localhost:3306/ccf_admin"
JWT_SECRET="CHANGE_ME_64_CHARS"
JWT_REFRESH_SECRET="CHANGE_ME_64_CHARS"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"
CCF_HMAC_SECRET="MUST_MATCH_DESKTOP_APP"
PORT=3001
CORS_ORIGIN="https://admin.cyberchakra.in"
NODE_ENV="production"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@cyberchakra.in"
PORTAL_URL="https://admin.cyberchakra.in"
GITHUB_WEBHOOK_SECRET=""
EOF

echo ""
echo "============================================"
echo "  Deployment package created!"
echo "  Location: $DEPLOY_DIR/"
echo "============================================"
echo ""
echo "Contents:"
echo "  public_html/   - Frontend static files + .htaccess"
echo "  backend/       - Compiled backend + Prisma schema"
echo "  scripts/       - Server setup and backup scripts"
echo ""
echo "To deploy to Hostinger ($ENVIRONMENT):"
echo "  1. scp -r $DEPLOY_DIR/* user@hostinger-ip:~/"
echo "  2. ssh user@hostinger-ip"
echo "  3. cd backend && npm ci --production"
echo "  4. cp .env.template .env && nano .env  # fill in secrets"
echo "  5. npx prisma db push"
echo "  6. bash ~/scripts/hostinger-setup.sh    # first time only"
echo "  7. Restart Node.js via hPanel"
echo ""
