/**
 * Standalone cron runner for session cleanup.
 *
 * Designed to be invoked by Hostinger's cron scheduler:
 *   node dist/cron/run-session-cleanup.js
 *
 * Exits with code 0 on success, 1 on error.
 */
import "dotenv/config";
import { cleanupExpiredSessions } from "./session-cleanup.js";

cleanupExpiredSessions()
  .then((count) => {
    console.log(`[${new Date().toISOString()}] session-cleanup: removed ${count} session(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] session-cleanup: ERROR`, err);
    process.exit(1);
  });
