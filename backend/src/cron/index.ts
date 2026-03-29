import { checkLicenseExpiry } from "./license-expiry.js";
import { cleanupExpiredSessions } from "./session-cleanup.js";
import { aggregateDailyAnalytics } from "./analytics-aggregation.js";
import { detectStaleActivations } from "./stale-activations.js";
import { cleanupOldHeartbeats } from "./heartbeat-cleanup.js";

// Re-export individual jobs for testing or manual invocation
export {
  checkLicenseExpiry,
  cleanupExpiredSessions,
  aggregateDailyAnalytics,
  detectStaleActivations,
  cleanupOldHeartbeats,
};

/**
 * Start all scheduled background tasks.
 *
 * Uses setInterval since node-cron may not be installed.
 * These run while the Express server process is alive.
 *
 * Schedule overview:
 *   - Every hour:  cleanup expired sessions
 *   - Every hour:  cleanup old heartbeat data (retain 90 days)
 *   - Every 6 hrs: aggregate daily analytics
 *   - Every 24 hrs: check for expired licenses
 *   - Every 24 hrs: detect stale activations (no heartbeat in 30+ days)
 */
export function startCronJobs(): void {
  console.log("[Cron] Starting scheduled tasks...");

  // ─── Every hour: cleanup expired admin sessions ───────────────────────────
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

  // ─── Every 24 hours: mark expired licenses ────────────────────────────────
  setInterval(checkLicenseExpiry, 24 * 60 * 60 * 1000);
  // Run once on startup so newly-expired licenses are caught immediately
  checkLicenseExpiry();

  // ─── Every 6 hours: aggregate daily analytics ─────────────────────────────
  setInterval(aggregateDailyAnalytics, 6 * 60 * 60 * 1000);

  // ─── Every 24 hours: detect stale activations ─────────────────────────────
  setInterval(detectStaleActivations, 24 * 60 * 60 * 1000);

  // ─── Every hour: clean old heartbeat data (keep 90 days) ──────────────────
  setInterval(cleanupOldHeartbeats, 60 * 60 * 1000);

  console.log("[Cron] All scheduled tasks registered");
}
