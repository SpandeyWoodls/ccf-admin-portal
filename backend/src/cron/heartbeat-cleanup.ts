import { prisma } from "../lib/prisma.js";

/**
 * Delete heartbeat records older than 90 days to keep the table manageable.
 *
 * The analytics-aggregation job should have already summarized this data
 * before it gets purged. Raw heartbeats beyond 90 days are not needed.
 *
 * Idempotent: only deletes records older than the retention window.
 */
export async function cleanupOldHeartbeats(): Promise<number> {
  const jobName = "cleanupOldHeartbeats";
  console.log(`[Cron:${jobName}] Starting...`);

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await prisma.heartbeat.deleteMany({
      where: {
        createdAt: {
          lt: ninetyDaysAgo,
        },
      },
    });

    console.log(
      `[Cron:${jobName}] Completed. Deleted ${result.count} heartbeat record(s) older than 90 days.`,
    );
    return result.count;
  } catch (error) {
    console.error(`[Cron:${jobName}] Error:`, error);
    return 0;
  }
}
