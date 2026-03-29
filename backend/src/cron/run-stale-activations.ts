/**
 * Standalone cron runner for stale activation detection.
 *
 * Designed to be invoked by Hostinger's cron scheduler:
 *   node dist/cron/run-stale-activations.js
 *
 * Exits with code 0 on success, 1 on error.
 */
import "dotenv/config";
import { detectStaleActivations } from "./stale-activations.js";

detectStaleActivations()
  .then((count) => {
    console.log(`[${new Date().toISOString()}] stale-activations: flagged ${count} activation(s)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] stale-activations: ERROR`, err);
    process.exit(1);
  });
