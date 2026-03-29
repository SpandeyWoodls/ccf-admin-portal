import { prisma } from "../lib/prisma.js";
import { createHash } from "crypto";
import type { RolloutStage, BlockedVersion } from "@prisma/client";

/**
 * Determines if a specific installation should receive an update.
 * Uses deterministic hashing so the same machine always gets the same decision
 * for a given release, ensuring consistent rollout behaviour.
 */
export async function shouldReceiveUpdate(
  releaseId: string,
  licenseKey: string | null,
  hardwareFingerprint: string | null,
): Promise<boolean> {
  // 1. Check if release has a rollout policy
  const rollout = await prisma.rolloutPolicy.findUnique({
    where: { releaseId },
    include: { stages: { orderBy: { stageOrder: "asc" } } },
  });

  // No rollout policy = immediate release to all
  if (!rollout || rollout.strategy === "immediate") return true;
  if (rollout.status === "paused" || rollout.status === "cancelled") return false;
  if (rollout.status === "completed") return true;

  // 2. Find current active stage (activated but not yet completed)
  const currentStage = rollout.stages.find((s: RolloutStage) => s.activatedAt && !s.completedAt);
  if (!currentStage) return false;

  // 3. Check targeted rollout - specific orgs
  if (currentStage.targetOrgIds && licenseKey) {
    const orgIds = currentStage.targetOrgIds as string[];
    if (orgIds.length > 0) {
      const license = await prisma.license.findUnique({
        where: { licenseKey },
        select: { organizationId: true },
      });
      if (license?.organizationId && orgIds.includes(license.organizationId)) {
        return true;
      }
    }
  }

  // 4. Check targeted rollout - specific tiers
  if (currentStage.targetTiers && licenseKey) {
    const tiers = currentStage.targetTiers as string[];
    if (tiers.length > 0) {
      const license = await prisma.license.findUnique({
        where: { licenseKey },
        select: { tier: true },
      });
      if (license && tiers.includes(license.tier)) {
        return true;
      }
    }
  }

  // 5. Percentage-based rollout using deterministic hash
  //    The same seed+releaseId always maps to the same bucket,
  //    so a client either always gets or always misses a given stage.
  const seed = licenseKey || hardwareFingerprint || "";
  if (!seed) return false; // Cannot determine bucket without identity

  const hash = createHash("md5").update(seed + releaseId).digest();
  const bucket = hash.readUInt32BE(0) % 100; // 0-99

  return bucket < currentStage.percentage;
}

/**
 * Check if a specific version is blocked. Supports exact match and
 * wildcard patterns (e.g. "2.0.*").
 */
export async function getBlockedVersionInfo(
  currentVersion: string,
): Promise<{ blocked: boolean; forceUpdateTo?: string; reason?: string }> {
  // First try exact match
  let blocked = await prisma.blockedVersion.findFirst({
    where: { isActive: true, versionPattern: currentVersion },
  });

  // If no exact match, try wildcard patterns
  if (!blocked) {
    const allActive = await prisma.blockedVersion.findMany({
      where: { isActive: true },
    });

    blocked =
      allActive.find((b: BlockedVersion) => {
        if (!b.versionPattern.includes("*")) return false;
        const regex = new RegExp(
          "^" + b.versionPattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
        );
        return regex.test(currentVersion);
      }) ?? null;
  }

  if (blocked) {
    return {
      blocked: true,
      forceUpdateTo: blocked.forceUpdateTo || undefined,
      reason: blocked.reason,
    };
  }

  return { blocked: false };
}

/**
 * Advance rollout to the next stage.
 * Completes the current active stage and activates the next one.
 * If no more stages remain, marks the rollout as completed.
 */
export async function advanceRollout(rolloutId: string): Promise<{
  advanced: boolean;
  completedStageOrder?: number;
  activatedStageOrder?: number;
  rolloutCompleted: boolean;
}> {
  const rollout = await prisma.rolloutPolicy.findUnique({
    where: { id: rolloutId },
    include: { stages: { orderBy: { stageOrder: "asc" } } },
  });

  if (!rollout) {
    throw new Error("Rollout policy not found");
  }

  if (rollout.status !== "active") {
    throw new Error(`Cannot advance rollout in '${rollout.status}' status`);
  }

  const currentStage = rollout.stages.find((s: RolloutStage) => s.activatedAt && !s.completedAt);

  if (!currentStage) {
    // No active stage - activate the first unactivated stage
    const firstUnactivated = rollout.stages.find((s: RolloutStage) => !s.activatedAt);
    if (!firstUnactivated) {
      // All stages already completed
      await prisma.rolloutPolicy.update({
        where: { id: rolloutId },
        data: { status: "completed" },
      });
      return { advanced: false, rolloutCompleted: true };
    }

    await prisma.rolloutStage.update({
      where: { id: firstUnactivated.id },
      data: { activatedAt: new Date() },
    });

    return {
      advanced: true,
      activatedStageOrder: firstUnactivated.stageOrder,
      rolloutCompleted: false,
    };
  }

  // Complete current stage
  await prisma.rolloutStage.update({
    where: { id: currentStage.id },
    data: { completedAt: new Date() },
  });

  // Find next stage
  const nextStage = rollout.stages.find(
    (s: RolloutStage) => s.stageOrder > currentStage.stageOrder && !s.activatedAt,
  );

  if (!nextStage) {
    // No more stages - rollout is complete
    await prisma.rolloutPolicy.update({
      where: { id: rolloutId },
      data: { status: "completed" },
    });
    return {
      advanced: true,
      completedStageOrder: currentStage.stageOrder,
      rolloutCompleted: true,
    };
  }

  // Activate next stage
  await prisma.rolloutStage.update({
    where: { id: nextStage.id },
    data: { activatedAt: new Date() },
  });

  return {
    advanced: true,
    completedStageOrder: currentStage.stageOrder,
    activatedStageOrder: nextStage.stageOrder,
    rolloutCompleted: false,
  };
}
