import { prisma } from "../lib/prisma.js";

/**
 * Find all licenses where validUntil < now() AND status = 'active',
 * update their status to 'expired', and log a LicenseEvent for each.
 *
 * Idempotent: only targets licenses that are still 'active' with a past validUntil.
 */
export async function checkLicenseExpiry(): Promise<number> {
  const jobName = "checkLicenseExpiry";
  console.log(`[Cron:${jobName}] Starting...`);

  try {
    const now = new Date();

    // Find all active licenses that have expired
    const expiredLicenses = await prisma.license.findMany({
      where: {
        status: "active",
        validUntil: {
          not: null,
          lt: now,
        },
      },
      select: {
        id: true,
        licenseKey: true,
        organizationId: true,
        validUntil: true,
      },
    });

    if (expiredLicenses.length === 0) {
      console.log(`[Cron:${jobName}] No expired licenses found.`);
      return 0;
    }

    console.log(
      `[Cron:${jobName}] Found ${expiredLicenses.length} license(s) to expire.`,
    );

    // Process each expired license in a transaction
    for (const license of expiredLicenses) {
      await prisma.$transaction([
        // Update status to expired
        prisma.license.update({
          where: { id: license.id },
          data: { status: "expired" },
        }),

        // Log a LicenseEvent for audit trail
        prisma.licenseEvent.create({
          data: {
            licenseId: license.id,
            organizationId: license.organizationId,
            action: "license.auto_expired",
            actorType: "system",
            oldValues: { status: "active" },
            newValues: { status: "expired" },
            metadata: {
              reason: "License validUntil date has passed",
              validUntil: license.validUntil?.toISOString(),
              expiredAt: now.toISOString(),
            },
          },
        }),
      ]);
    }

    console.log(
      `[Cron:${jobName}] Completed. Expired ${expiredLicenses.length} license(s).`,
    );
    return expiredLicenses.length;
  } catch (error) {
    console.error(`[Cron:${jobName}] Error:`, error);
    return 0;
  }
}
