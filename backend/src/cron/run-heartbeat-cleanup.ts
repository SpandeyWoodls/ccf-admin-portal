/**
 * Standalone cron runner for heartbeat data cleanup.
 *
 * Designed to be invoked by Hostinger's cron scheduler:
 *   node dist/cron/run-heartbeat-cleanup.js
 *
 * Exits with code 0 on success, 1 on error.
 */
import "dotenv/config";
import { cleanupOldHeartbeats } from "./heartbeat-cleanup.js";

cleanupOldHeartbeats()
  .then((count) => {
    console.log(`[${new Date().toISOString()}] heartbeat-cleanup: removed ${count} record(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] heartbeat-cleanup: ERROR`, err);
    process.exit(1);
  });
