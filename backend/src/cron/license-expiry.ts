import { prisma } from "../lib/prisma.js";
import { sendEmail } from "../services/email.js";
import { licenseExpiryWarningEmail, licenseExpiredEmail } from "../services/email-templates.js";

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

    // Send warning emails for licenses expiring within 7 days
    const expiringLicenses = await prisma.license.findMany({
      where: {
        status: "active",
        validUntil: {
          gte: now,
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      include: { organization: true },
    });

    for (const license of expiringLicenses) {
      if (license.organization?.email) {
        const daysRemaining = Math.ceil((license.validUntil!.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const { subject, html } = licenseExpiryWarningEmail(
          license.organization.name,
          license.licenseKey,
          daysRemaining
        );
        sendEmail(license.organization.email, subject, html).catch(() => {});
      }
    }

    if (expiringLicenses.length > 0) {
      console.log(`[Cron:${jobName}] Sent expiry warnings for ${expiringLicenses.length} license(s).`);
    }

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
        organization: { select: { name: true, email: true } },
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

      // Send license expired email
      if (license.organization?.email) {
        const { subject, html } = licenseExpiredEmail(
          license.organization.name,
          license.licenseKey
        );
        sendEmail(license.organization.email, subject, html).catch(() => {});
      }
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
