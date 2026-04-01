import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { advanceRollout } from "../services/rollout.js";
import type { PrismaClient } from "@prisma/client";

const router = Router();

router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createRolloutSchema = z.object({
  strategy: z.enum(["immediate", "staged", "targeted"]).default("staged"),
  stages: z
    .array(
      z.object({
        stageOrder: z.number().int().min(1),
        percentage: z.number().int().min(0).max(100),
        targetOrgIds: z.array(z.string()).optional().nullable(),
        targetTiers: z.array(z.string()).optional().nullable(),
        minSoakHours: z.number().int().min(0).default(24),
      }),
    )
    .min(1),
});

const createBlockedVersionSchema = z.object({
  versionPattern: z.string().min(1).max(50),
  reason: z.string().min(1),
  forceUpdateTo: z.string().max(30).optional().nullable(),
});

// ─── POST /releases/:id/rollout (create rollout policy) ────────────────────

router.post(
  "/releases/:id/rollout",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;
      const body = createRolloutSchema.parse(req.body);

      // Verify release exists
      const release = await prisma.release.findUnique({
        where: { id: releaseId },
      });
      if (!release) throw new AppError(404, "Release not found", "NOT_FOUND");

      // Check if rollout already exists
      const existing = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
      });
      if (existing) {
        throw new AppError(409, "Rollout policy already exists for this release", "ROLLOUT_EXISTS");
      }

      // Create rollout with stages in a transaction
      const rollout = await prisma.$transaction(async (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
        const policy = await tx.rolloutPolicy.create({
          data: {
            releaseId,
            strategy: body.strategy,
            status: "active",
          },
        });

        // Create all stages
        for (const stage of body.stages) {
          await tx.rolloutStage.create({
            data: {
              rolloutId: policy.id,
              stageOrder: stage.stageOrder,
              percentage: stage.percentage,
              targetOrgIds: stage.targetOrgIds ?? undefined,
              targetTiers: stage.targetTiers ?? undefined,
              minSoakHours: stage.minSoakHours,
            },
          });
        }

        // Activate the first stage automatically
        const firstStage = body.stages.sort((a, b) => a.stageOrder - b.stageOrder)[0]!;
        await tx.rolloutStage.updateMany({
          where: { rolloutId: policy.id, stageOrder: firstStage.stageOrder },
          data: { activatedAt: new Date() },
        });

        return tx.rolloutPolicy.findUnique({
          where: { id: policy.id },
          include: { stages: { orderBy: { stageOrder: "asc" } } },
        });
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_rollout",
        resourceType: "rollout_policy",
        resourceId: rollout!.id,
        newValues: { releaseId, strategy: body.strategy, stageCount: body.stages.length },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.status(201).json({
        success: true,
        data: rollout,
        error: null,
        message: "Rollout policy created",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /releases/:id/rollout (get rollout status) ────────────────────────

router.get(
  "/releases/:id/rollout",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;

      const rollout = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
        include: {
          stages: { orderBy: { stageOrder: "asc" } },
          release: {
            select: { id: true, version: true, channel: true, publishedAt: true },
          },
        },
      });

      if (!rollout) {
        throw new AppError(404, "No rollout policy found for this release", "NOT_FOUND");
      }

      res.json({
        success: true,
        data: rollout,
        error: null,
        message: "",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /releases/:id/rollout/advance (advance to next stage) ────────────

router.post(
  "/releases/:id/rollout/advance",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;

      const rollout = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
      });

      if (!rollout) {
        throw new AppError(404, "No rollout policy found for this release", "NOT_FOUND");
      }

      const result = await advanceRollout(rollout.id);

      await logAudit({
        adminUserId: req.admin!.id,
        action: "advance_rollout",
        resourceType: "rollout_policy",
        resourceId: rollout.id,
        newValues: result,
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      // Fetch updated rollout
      const updated = await prisma.rolloutPolicy.findUnique({
        where: { id: rollout.id },
        include: { stages: { orderBy: { stageOrder: "asc" } } },
      });

      res.json({
        success: true,
        data: { ...result, rollout: updated },
        error: null,
        message: result.rolloutCompleted
          ? "Rollout completed - all stages finished"
          : `Advanced to stage ${result.activatedStageOrder}`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Cannot advance")) {
        return next(new AppError(400, err.message, "INVALID_ROLLOUT_STATE"));
      }
      next(err);
    }
  },
);

// ─── POST /releases/:id/rollout/pause (pause rollout) ──────────────────────

router.post(
  "/releases/:id/rollout/pause",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;

      const rollout = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
      });

      if (!rollout) {
        throw new AppError(404, "No rollout policy found for this release", "NOT_FOUND");
      }

      if (rollout.status !== "active") {
        throw new AppError(400, `Cannot pause rollout in '${rollout.status}' status`, "INVALID_ROLLOUT_STATE");
      }

      const updated = await prisma.rolloutPolicy.update({
        where: { id: rollout.id },
        data: { status: "paused" },
        include: { stages: { orderBy: { stageOrder: "asc" } } },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "pause_rollout",
        resourceType: "rollout_policy",
        resourceId: rollout.id,
        oldValues: { status: "active" },
        newValues: { status: "paused" },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Rollout paused",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /releases/:id/rollout/resume (resume paused rollout) ─────────────

router.post(
  "/releases/:id/rollout/resume",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;

      const rollout = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
      });

      if (!rollout) {
        throw new AppError(404, "No rollout policy found for this release", "NOT_FOUND");
      }

      if (rollout.status !== "paused") {
        throw new AppError(400, `Cannot resume rollout in '${rollout.status}' status`, "INVALID_ROLLOUT_STATE");
      }

      const updated = await prisma.rolloutPolicy.update({
        where: { id: rollout.id },
        data: { status: "active" },
        include: { stages: { orderBy: { stageOrder: "asc" } } },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "resume_rollout",
        resourceType: "rollout_policy",
        resourceId: rollout.id,
        oldValues: { status: "paused" },
        newValues: { status: "active" },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Rollout resumed",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /releases/:id/rollout/cancel (cancel rollout) ────────────────────

router.post(
  "/releases/:id/rollout/cancel",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releaseId = req.params.id as string;

      const rollout = await prisma.rolloutPolicy.findUnique({
        where: { releaseId },
      });

      if (!rollout) {
        throw new AppError(404, "No rollout policy found for this release", "NOT_FOUND");
      }

      if (rollout.status === "cancelled") {
        throw new AppError(400, "Rollout is already cancelled", "ALREADY_CANCELLED");
      }

      if (rollout.status === "completed") {
        throw new AppError(400, "Cannot cancel a completed rollout", "ROLLOUT_COMPLETED");
      }

      const updated = await prisma.rolloutPolicy.update({
        where: { id: rollout.id },
        data: { status: "cancelled" },
        include: { stages: { orderBy: { stageOrder: "asc" } } },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "cancel_rollout",
        resourceType: "rollout_policy",
        resourceId: rollout.id,
        oldValues: { status: rollout.status },
        newValues: { status: "cancelled" },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Rollout cancelled",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /blocked-versions (block a version) ──────────────────────────────

router.post(
  "/blocked-versions",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createBlockedVersionSchema.parse(req.body);

      const blocked = await prisma.blockedVersion.create({
        data: {
          versionPattern: body.versionPattern,
          reason: body.reason,
          forceUpdateTo: body.forceUpdateTo ?? null,
          isActive: true,
          createdBy: req.admin!.id,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "block_version",
        resourceType: "blocked_version",
        resourceId: blocked.id,
        newValues: { versionPattern: body.versionPattern, reason: body.reason },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.status(201).json({
        success: true,
        data: blocked,
        error: null,
        message: `Version pattern '${body.versionPattern}' blocked`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /blocked-versions (list blocked versions) ─────────────────────────

router.get(
  "/blocked-versions",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === "true";

      const where: any = {};
      if (!includeInactive) {
        where.isActive = true;
      }

      const blockedVersions = await prisma.blockedVersion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      res.json({
        success: true,
        data: blockedVersions,
        error: null,
        message: "",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /blocked-versions/:id (unblock a version) ──────────────────────

router.delete(
  "/blocked-versions/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blockedId = req.params.id as string;
      const existing = await prisma.blockedVersion.findUnique({
        where: { id: blockedId },
      });

      if (!existing) {
        throw new AppError(404, "Blocked version entry not found", "NOT_FOUND");
      }

      // Soft-delete: mark as inactive rather than hard-deleting
      const updated = await prisma.blockedVersion.update({
        where: { id: blockedId },
        data: { isActive: false },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "unblock_version",
        resourceType: "blocked_version",
        resourceId: existing.id,
        oldValues: { isActive: true, versionPattern: existing.versionPattern },
        newValues: { isActive: false },
        ipAddress: (req.ip as string | undefined) ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: `Version pattern '${existing.versionPattern}' unblocked`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
