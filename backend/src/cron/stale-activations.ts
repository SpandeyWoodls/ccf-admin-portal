import { prisma } from "../lib/prisma.js";

/**
 * Detect stale activations: active LicenseActivation records where
 * lastHeartbeatAt is older than 30 days (or null, meaning never heartbeated).
 *
 * This does NOT deactivate them -- it only logs them for admin review.
 * A future enhancement could create admin notifications or flag them in the UI.
 *
 * Idempotent: read-only detection, no state changes.
 */
export async function detectStaleActivations(): Promise<number> {
  const jobName = "detectStaleActivations";
  console.log(`[Cron:${jobName}] Starting...`);

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find activations that are marked active but haven't sent a heartbeat
    // in over 30 days (or have never sent one at all)
    const staleActivations = await prisma.licenseActivation.findMany({
      where: {
        isActive: true,
        OR: [
          {
            lastHeartbeatAt: {
              lt: thirtyDaysAgo,
            },
          },
          {
            lastHeartbeatAt: null,
          },
        ],
      },
      select: {
        id: true,
        licenseId: true,
        hardwareFingerprint: true,
        machineName: true,
        lastHeartbeatAt: true,
        activatedAt: true,
        license: {
          select: {
            licenseKey: true,
            organizationId: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (staleActivations.length === 0) {
      console.log(`[Cron:${jobName}] No stale activations found.`);
      return 0;
    }

    console.log(
      `[Cron:${jobName}] Found ${staleActivations.length} stale activation(s):`,
    );

    for (const activation of staleActivations) {
      const orgName = activation.license.organization?.name ?? "N/A";
      const lastHb = activation.lastHeartbeatAt
        ? activation.lastHeartbeatAt.toISOString()
        : "never";

      console.log(
        `[Cron:${jobName}]   - License: ${activation.license.licenseKey} | ` +
          `Machine: ${activation.machineName ?? "unknown"} | ` +
          `Org: ${orgName} | ` +
          `Last Heartbeat: ${lastHb} | ` +
          `Activated: ${activation.activatedAt.toISOString()}`,
      );
    }

    // Log a summary LicenseEvent so admins can review in the audit trail
    if (staleActivations.length > 0) {
      await prisma.licenseEvent.create({
        data: {
          action: "activation.stale_detected",
          actorType: "system",
          metadata: {
            staleCount: staleActivations.length,
            thresholdDays: 30,
            detectedAt: new Date().toISOString(),
            activationIds: staleActivations.map((a) => a.id),
          },
        },
      });
    }

    console.log(
      `[Cron:${jobName}] Completed. Flagged ${staleActivations.length} stale activation(s).`,
    );
    return staleActivations.length;
  } catch (error) {
    console.error(`[Cron:${jobName}] Error:`, error);
    return 0;
  }
}
