# CCF Admin Portal - Deployment Checklist

## Pre-Deployment
- [ ] All TypeScript compiles (frontend + backend)
- [ ] Frontend builds successfully (npm run build)
- [ ] Backend builds successfully (npm run build)
- [ ] THIRD_PARTY_LICENSES.txt present
- [ ] EULA.txt present
- [ ] .env.template has all required variables

## Hostinger Setup (One-Time)
- [ ] Subdomain created: admin.cyberchakra.in
- [ ] SSL certificate activated (Let's Encrypt)
- [ ] MySQL database created in hPanel
- [ ] Node.js configured in hPanel (version 20, entry: backend/dist/index.js)
- [ ] SSH key uploaded to Hostinger

## Deployment Steps
1. [ ] Run scripts/deploy.sh
2. [ ] Upload deploy package to Hostinger
3. [ ] SSH in, run scripts/hostinger-setup.sh (first time only)
4. [ ] Configure .env with production values
5. [ ] Restart Node.js via hPanel
6. [ ] Verify health endpoint: curl https://admin.cyberchakra.in/api/v1/health
7. [ ] Verify admin login works
8. [ ] Verify desktop app can reach endpoints (test activate/validate)

## Post-Deployment
- [ ] Change default admin password
- [ ] Set up SMTP credentials for email notifications
- [ ] Configure GitHub webhook secret
- [ ] Test all 12 desktop app endpoints
- [ ] Monitor logs for first 24 hours

## DNS Configuration
- admin.cyberchakra.in → Hostinger IP (A record)
- license.cyberchakra.in → Same Hostinger IP (for backward compat)
