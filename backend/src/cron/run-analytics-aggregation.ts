/**
 * Standalone cron runner for analytics aggregation.
 *
 * Designed to be invoked by Hostinger's cron scheduler:
 *   node dist/cron/run-analytics-aggregation.js
 *
 * Exits with code 0 on success, 1 on error.
 */
import "dotenv/config";
import { aggregateDailyAnalytics } from "./analytics-aggregation.js";

aggregateDailyAnalytics()
  .then((result) => {
    console.log(`[${new Date().toISOString()}] analytics-aggregation: completed`, result);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] analytics-aggregation: ERROR`, err);
    process.exit(1);
  });
