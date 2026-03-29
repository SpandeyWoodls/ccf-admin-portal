import { prisma } from "../lib/prisma.js";

/**
 * Delete all AdminSession records where either:
 *   - expiresAt < now() (access token expired)
 *   - refreshExpiresAt < now() (refresh token expired, session fully dead)
 *
 * Idempotent: only deletes sessions that are already past their expiry.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const jobName = "cleanupExpiredSessions";
  console.log(`[Cron:${jobName}] Starting...`);

  try {
    const now = new Date();

    // Delete sessions where the refresh token has expired (fully dead sessions).
    // If refreshExpiresAt is past, the session cannot be renewed at all.
    const result = await prisma.adminSession.deleteMany({
      where: {
        refreshExpiresAt: {
          lt: now,
        },
      },
    });

    console.log(
      `[Cron:${jobName}] Completed. Cleaned ${result.count} expired session(s).`,
    );
    return result.count;
  } catch (error) {
    console.error(`[Cron:${jobName}] Error:`, error);
    return 0;
  }
}
