/**
 * Standalone cron runner for license expiry check.
 *
 * Designed to be invoked by Hostinger's cron scheduler:
 *   node dist/cron/run-license-expiry.js
 *
 * Exits with code 0 on success, 1 on error.
 */
import "dotenv/config";
import { checkLicenseExpiry } from "./license-expiry.js";

checkLicenseExpiry()
  .then((count) => {
    console.log(`[${new Date().toISOString()}] license-expiry: expired ${count} license(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] license-expiry: ERROR`, err);
    process.exit(1);
  });
