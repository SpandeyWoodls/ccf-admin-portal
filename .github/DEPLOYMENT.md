# CCF Admin Portal - Deployment Guide

## Required GitHub Secrets

The following secrets must be configured in the GitHub repository under
**Settings > Secrets and variables > Actions**:

| Secret              | Description                                           | Example                  |
| ------------------- | ----------------------------------------------------- | ------------------------ |
| `HOSTINGER_HOST`    | Hostinger server IP address or hostname               | `123.45.67.89`           |
| `HOSTINGER_USER`    | SSH username for the Hostinger account                 | `u123456789`             |
| `HOSTINGER_SSH_KEY` | Private SSH key (PEM format) for passwordless auth     | `-----BEGIN OPENSSH...`  |

## Setting Up SSH Key on Hostinger

1. **Generate an SSH key pair** (if you do not already have one):

   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/hostinger_deploy
   ```

   Do not set a passphrase -- GitHub Actions cannot handle interactive prompts.

2. **Add the public key to Hostinger**:
   - Log in to the Hostinger control panel (hPanel).
   - Navigate to **Advanced > SSH Access**.
   - Enable SSH access if it is not already enabled.
   - Paste the contents of `~/.ssh/hostinger_deploy.pub` into the authorized keys field.
   - Alternatively, SSH into the server and append the public key to `~/.ssh/authorized_keys`:

     ```bash
     echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
     chmod 600 ~/.ssh/authorized_keys
     ```

3. **Add the private key to GitHub Secrets**:
   - Copy the full contents of `~/.ssh/hostinger_deploy` (the private key file).
   - In the GitHub repository, go to **Settings > Secrets and variables > Actions**.
   - Create a new secret named `HOSTINGER_SSH_KEY` and paste the private key.

4. **Test the connection** locally before relying on CI:

   ```bash
   ssh -i ~/.ssh/hostinger_deploy u123456789@YOUR_HOST_IP
   ```

## Pre-Deployment Checklist

Before triggering a deployment, verify the following:

- [ ] All CI checks pass on the target branch (TypeScript compilation, builds, security audit).
- [ ] Environment variables are correctly set on the Hostinger server (see section below).
- [ ] Database migrations are compatible with the current production schema (no destructive changes without a migration plan).
- [ ] The `.htaccess` file exists in the project root and is correctly configured for SPA routing and API proxying.
- [ ] Frontend `VITE_API_URL` is set to the correct production API endpoint.
- [ ] Any new Prisma schema changes have been reviewed for data safety.
- [ ] A manual backup of the production database has been taken if schema changes are involved.

## Triggering a Deployment

1. Go to the GitHub repository **Actions** tab.
2. Select the **Deploy to Hostinger** workflow in the left sidebar.
3. Click **Run workflow**.
4. Choose the target environment (`production` or `staging`).
5. Click **Run workflow** to start the deployment.

The workflow will:
1. Check out the code and install dependencies.
2. Generate the Prisma client and build both frontend and backend.
3. Package the deployment artifacts.
4. Upload files to Hostinger via SCP.
5. Run `prisma db push` on the server to apply any schema changes.

## Environment Variable Management on Hostinger

Environment variables on the Hostinger server are managed via a `.env` file in the backend directory.

### Setting Up Environment Variables

1. SSH into the Hostinger server:

   ```bash
   ssh -i ~/.ssh/hostinger_deploy u123456789@YOUR_HOST_IP
   ```

2. Create or edit the `.env` file in the backend directory:

   ```bash
   nano ~/backend/.env
   ```

3. Required environment variables:

   ```env
   # Database
   DATABASE_URL="mysql://user:password@localhost:3306/ccf_admin"

   # Authentication
   JWT_SECRET="<generate-a-strong-random-string>"
   JWT_EXPIRY="24h"

   # Application
   NODE_ENV="production"
   PORT=3001
   CORS_ORIGIN="https://yourdomain.com"

   # Email (if applicable)
   SMTP_HOST="smtp.hostinger.com"
   SMTP_PORT=465
   SMTP_USER="noreply@yourdomain.com"
   SMTP_PASS="<email-password>"
   ```

4. Ensure the `.env` file is not overwritten during deployments. The deploy workflow does **not** copy `.env` files -- they are managed manually on the server.

### Updating Environment Variables

When adding new environment variables:

1. Update the `.env.example` file in the repository so team members know what is required.
2. SSH into the server and add the new variable to `~/backend/.env`.
3. Restart the application for changes to take effect.

## Rollback Procedure

If a deployment introduces issues, follow these steps to roll back:

### Quick Rollback (Redeploy Previous Version)

1. Identify the last known good commit hash from the git log:

   ```bash
   git log --oneline -10
   ```

2. Go to the GitHub **Actions** tab.
3. Find the successful deployment run for that commit.
4. Click **Re-run all jobs** to redeploy the previous version.

### Manual Rollback via SSH

If the GitHub Actions workflow is unavailable:

1. SSH into the Hostinger server:

   ```bash
   ssh -i ~/.ssh/hostinger_deploy u123456789@YOUR_HOST_IP
   ```

2. If you kept previous deployment artifacts, restore them:

   ```bash
   # Restore frontend
   cp -r ~/public_html.backup/* ~/public_html/

   # Restore backend
   cp -r ~/backend.backup/* ~/backend/
   ```

3. Restart the application.

### Creating Pre-Deployment Backups

It is recommended to create backups before each deployment. Add this to your deployment routine or automate it:

```bash
# Run on the server before deploying
cp -r ~/public_html ~/public_html.backup
cp -r ~/backend ~/backend.backup
```

### Database Rollback

If a Prisma schema change caused data issues:

1. Restore the database from the backup taken during the pre-deployment checklist.
2. Redeploy the previous application version that matches the restored schema.
3. Prisma does not natively support down-migrations. For critical rollbacks, use a manual SQL script to reverse schema changes.

## Troubleshooting

| Issue                          | Resolution                                                                 |
| ------------------------------ | -------------------------------------------------------------------------- |
| SSH connection refused         | Verify SSH is enabled in hPanel and the IP is not blocked by a firewall.   |
| Permission denied (public key) | Confirm the public key is in `~/.ssh/authorized_keys` on the server.       |
| Build fails in CI              | Check TypeScript errors locally with `npx tsc --noEmit` in each package.   |
| Prisma db push fails           | SSH into the server and run `npx prisma db push` manually to see errors.   |
| Frontend shows blank page      | Verify `.htaccess` rewrites are correct and `dist/index.html` exists.      |
| API returns 502/503            | Check if the Node.js process is running; review logs in `~/backend/`.      |
