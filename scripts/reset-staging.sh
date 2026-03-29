#!/bin/bash
# =============================================================================
# CCF Admin Portal - Reset Staging Database
# =============================================================================
# Wipes the staging database and re-seeds it with test data.
# Run on the Hostinger server when staging data needs a fresh start.
#
# Usage (on server):
#   ~/admin-portal-staging/scripts/reset-staging.sh
#
# WARNING: This destroys all data in the staging database!
# =============================================================================

set -euo pipefail

BACKEND_DIR="$HOME/admin-portal-staging/backend"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "ERROR: Backend directory not found at $BACKEND_DIR"
  echo "Are you running this on the correct server?"
  exit 1
fi

cd "$BACKEND_DIR"

# Safety check: refuse to run if NODE_ENV is production
NODE_ENV=$(grep '^NODE_ENV=' .env 2>/dev/null | sed 's/^NODE_ENV=//' | tr -d '"' || echo "unknown")
if [ "$NODE_ENV" = "production" ]; then
  echo "ABORT: This script detected NODE_ENV=production in the .env file."
  echo "This script must ONLY be run against the staging environment."
  exit 1
fi

echo "================================"
echo "  Resetting STAGING Database"
echo "  Environment: $NODE_ENV"
echo "================================"
echo ""

read -p "This will DESTROY all staging data. Continue? (y/N) " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "[1/3] Resetting database schema..."
npx prisma db push --force-reset

echo ""
echo "[2/3] Seeding staging data..."
npx tsx src/seed-staging.ts

echo ""
echo "[3/3] Restarting staging server..."
npx pm2 restart ccf-admin-staging 2>/dev/null || echo "PM2 process not found; start manually."

echo ""
echo "================================"
echo "  Staging reset complete!"
echo "================================"
