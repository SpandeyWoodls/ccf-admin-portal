#!/bin/bash
# =============================================================================
# CCF Admin Portal - Hostinger Server Setup (One-Time)
# =============================================================================
# Run this ONCE on the Hostinger server after the first upload.
# It installs dependencies, pushes the database schema, and seeds the
# default admin user.
#
# Usage (on server):
#   bash ~/scripts/hostinger-setup.sh
#
# Prerequisites:
#   - Deployment package uploaded to ~/
#   - ~/backend/.env configured with production values
#   - MySQL database created via hPanel
# =============================================================================

set -euo pipefail

BACKEND_DIR="$HOME/backend"

echo "============================================"
echo "  CCF Admin Portal - Server Setup"
echo "============================================"
echo ""

# ─── Preflight checks ───────────────────────────────────────────────────────

if [ ! -d "$BACKEND_DIR" ]; then
  echo "ERROR: Backend directory not found at $BACKEND_DIR"
  echo "Upload the deployment package first."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: .env file not found at $BACKEND_DIR/.env"
  echo "Copy .env.template to .env and fill in production values."
  exit 1
fi

# Verify DATABASE_URL is configured
DATABASE_URL=$(grep '^DATABASE_URL=' "$BACKEND_DIR/.env" | sed 's/^DATABASE_URL=//' | tr -d '"')
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" == *"USERNAME"* ]]; then
  echo "ERROR: DATABASE_URL is not configured in .env"
  echo "Update it with your Hostinger MySQL credentials."
  exit 1
fi

cd "$BACKEND_DIR"

# ─── 1. Install production dependencies ─────────────────────────────────────

echo "[1/4] Installing production dependencies..."
npm ci --production
echo "  Dependencies installed."

# ─── 2. Generate Prisma client ───────────────────────────────────────────────

echo "[2/4] Generating Prisma client..."
npx prisma generate
echo "  Prisma client generated."

# ─── 3. Push database schema ────────────────────────────────────────────────

echo "[3/4] Pushing database schema..."
npx prisma db push
echo "  Database schema applied."

# ─── 4. Seed default admin user ─────────────────────────────────────────────

echo "[4/4] Seeding default admin user..."
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function seed() {
  const hash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.adminUser.upsert({
    where: { email: 'admin@cyberchakra.in' },
    update: {},
    create: {
      email: 'admin@cyberchakra.in',
      name: 'Admin',
      passwordHash: hash,
      role: 'super_admin',
      isActive: true,
    }
  });
  console.log('  Default admin created: admin@cyberchakra.in / ChangeMe123!');
  await prisma.\$disconnect();
}
seed().catch(e => { console.error('Seed failed:', e); process.exit(1); });
"

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps - configure Node.js in hPanel:"
echo "  1. Go to hPanel > Advanced > Node.js"
echo "  2. Set entry file: backend/dist/index.js"
echo "  3. Set Node.js version: 20"
echo "  4. Click 'Restart'"
echo ""
echo "IMPORTANT: Change the default admin password immediately!"
echo "  Login at: https://admin.cyberchakra.in"
echo "  Email:    admin@cyberchakra.in"
echo "  Password: ChangeMe123!"
echo ""
