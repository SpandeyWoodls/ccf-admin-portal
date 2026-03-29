import { prisma } from "../lib/prisma.js";

/**
 * Aggregate heartbeat data into daily summaries.
 *
 * For each calendar date with heartbeat records, computes:
 *   - Count of unique license keys (daily active licenses)
 *   - Sum of cases_created, acquisitions, reports_generated
 *   - Count of unique hardware fingerprints (unique machines)
 *
 * Since there is no AnalyticsDaily model in the schema, this logs the
 * aggregated data for admin review. When the model is added later,
 * the upsert logic can replace the console output.
 *
 * Idempotent: aggregates are computed from source data each run.
 */
export async function aggregateDailyAnalytics(): Promise<number> {
  const jobName = "aggregateDailyAnalytics";
  console.log(`[Cron:${jobName}] Starting...`);

  try {
    // Aggregate the last 7 days of heartbeat data by date
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Use raw query for GROUP BY date aggregation since Prisma doesn't
    // natively support grouping by date portion of a datetime field.
    const dailySummaries = await prisma.$queryRaw<
      Array<{
        report_date: string;
        unique_licenses: number;
        unique_machines: number;
        total_cases_created: number;
        total_acquisitions: number;
        total_reports_generated: number;
        heartbeat_count: number;
      }>
    >`
      SELECT
        DATE(created_at) AS report_date,
        COUNT(DISTINCT license_key) AS unique_licenses,
        COUNT(DISTINCT hardware_fingerprint) AS unique_machines,
        SUM(cases_created) AS total_cases_created,
        SUM(acquisitions) AS total_acquisitions,
        SUM(reports_generated) AS total_reports_generated,
        COUNT(*) AS heartbeat_count
      FROM heartbeats
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY report_date DESC
    `;

    if (dailySummaries.length === 0) {
      console.log(
        `[Cron:${jobName}] No heartbeat data found for the last 7 days.`,
      );
      return 0;
    }

    // Log the aggregated data (replace with DB upsert when AnalyticsDaily model exists)
    for (const summary of dailySummaries) {
      console.log(
        `[Cron:${jobName}] Date: ${summary.report_date} | ` +
          `Active Licenses: ${summary.unique_licenses} | ` +
          `Unique Machines: ${summary.unique_machines} | ` +
          `Cases: ${summary.total_cases_created} | ` +
          `Acquisitions: ${summary.total_acquisitions} | ` +
          `Reports: ${summary.total_reports_generated} | ` +
          `Heartbeats: ${summary.heartbeat_count}`,
      );
    }

    console.log(
      `[Cron:${jobName}] Completed. Aggregated ${dailySummaries.length} day(s) of analytics.`,
    );
    return dailySummaries.length;
  } catch (error) {
    console.error(`[Cron:${jobName}] Error:`, error);
    return 0;
  }
}
