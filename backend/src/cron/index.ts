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

// ─── Concurrency guard ──────────────────────────────────────────────────────
const runningJobs = new Set<string>();

async function withLock(jobName: string, fn: () => Promise<unknown>): Promise<void> {
  if (runningJobs.has(jobName)) {
    console.log(`[Cron:${jobName}] Skipped - previous run still in progress`);
    return;
  }
  runningJobs.add(jobName);
  try {
    await fn();
  } finally {
    runningJobs.delete(jobName);
  }
}

// ─── Timeout protection ─────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  jobName: string,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[Cron:${jobName}] Timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/** Run a job with both concurrency guard and timeout protection. */
async function runJob(jobName: string, fn: () => Promise<unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  return withLock(jobName, () => withTimeout(fn, timeoutMs, jobName));
}

/**
 * Start all scheduled background tasks.
 *
 * Uses setInterval since node-cron may not be installed.
 * These run while the Express server process is alive.
 *
 * Each job is wrapped with:
 *   - **withLock**    – prevents overlapping execution of the same job
 *   - **withTimeout** – kills a run that exceeds the allowed duration
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

  // ─── Run startup check async (don't block server start) ───────────────────
  runJob("licenseExpiry", checkLicenseExpiry).catch((err) => {
    console.error("[Cron] Startup license check failed:", err);
  });

  // ─── Every hour: cleanup expired admin sessions ───────────────────────────
  setInterval(() => {
    runJob("sessionCleanup", cleanupExpiredSessions).catch((err) => {
      console.error("[Cron:sessionCleanup] Error:", err);
    });
  }, 60 * 60 * 1000);

  // ─── Every 24 hours: mark expired licenses ────────────────────────────────
  setInterval(() => {
    runJob("licenseExpiry", checkLicenseExpiry).catch((err) => {
      console.error("[Cron:licenseExpiry] Error:", err);
    });
  }, 24 * 60 * 60 * 1000);

  // ─── Every 6 hours: aggregate daily analytics ─────────────────────────────
  setInterval(() => {
    runJob("analyticsAggregation", aggregateDailyAnalytics).catch((err) => {
      console.error("[Cron:analyticsAggregation] Error:", err);
    });
  }, 6 * 60 * 60 * 1000);

  // ─── Every 24 hours: detect stale activations ─────────────────────────────
  setInterval(() => {
    runJob("staleActivations", detectStaleActivations).catch((err) => {
      console.error("[Cron:staleActivations] Error:", err);
    });
  }, 24 * 60 * 60 * 1000);

  // ─── Every hour: clean old heartbeat data (keep 90 days) ──────────────────
  setInterval(() => {
    runJob("heartbeatCleanup", cleanupOldHeartbeats).catch((err) => {
      console.error("[Cron:heartbeatCleanup] Error:", err);
    });
  }, 60 * 60 * 1000);

  console.log("[Cron] All scheduled tasks registered");
}
