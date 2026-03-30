import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { sendEmail } from "../services/email.js";
import { newReleaseEmail } from "../services/email-templates.js";

const router = Router();

router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createReleaseSchema = z.object({
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc"]).default("stable"),
  severity: z.enum(["critical", "recommended", "optional"]).default("optional"),
  title: z.string().min(1).max(255),
  releaseNotes: z.string().optional().nullable(),
  gitCommitSha: z.string().optional().nullable(),
  minVersion: z.string().optional().nullable(),
  forceUpdate: z.boolean().default(false),
  assets: z
    .array(
      z.object({
        platform: z.enum(["windows", "linux", "android"]),
        arch: z.string().default("x86_64"),
        packageType: z.string().min(1),
        filename: z.string().min(1),
        fileSize: z.number().int().min(0),
        sha256Hash: z.string().length(64),
        downloadUrl: z.string().url(),
        signature: z.string().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

const updateReleaseSchema = z.object({
  channel: z.enum(["stable", "beta", "rc"]).optional(),
  severity: z.enum(["critical", "recommended", "optional"]).optional(),
  title: z.string().min(1).max(255).optional(),
  releaseNotes: z.string().optional().nullable(),
  gitCommitSha: z.string().optional().nullable(),
  minVersion: z.string().optional().nullable(),
  forceUpdate: z.boolean().optional(),
});

// ─── GET / (list releases) ──────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validChannels = ["stable", "beta", "rc"];
    if (req.query.channel && validChannels.includes(req.query.channel as string)) {
      where.channel = req.query.channel as string;
    }

    if (req.query.isBlocked !== undefined) where.isBlocked = req.query.isBlocked === "true";

    const [releases, total] = await Promise.all([
      prisma.release.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          assets: true,
          _count: { select: { assets: true } },
        },
      }),
      prisma.release.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(releases, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id (release detail) ──────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const release = await prisma.release.findUnique({
      where: { id: req.params.id as string },
      include: {
        assets: {
          include: {
            _count: { select: { downloads: true } },
          },
        },
      },
    });

    if (!release) throw new AppError(404, "Release not found", "NOT_FOUND");

    res.json({ success: true, data: release, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST / (create draft release) ─────────────────────────────────────────

router.post(
  "/",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createReleaseSchema.parse(req.body);

      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity: body.severity,
          title: body.title,
          releaseNotes: body.releaseNotes ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
          minVersion: body.minVersion ?? null,
          forceUpdate: body.forceUpdate,
          assets: {
            create: body.assets.map((a) => ({
              platform: a.platform,
              arch: a.arch,
              packageType: a.packageType,
              filename: a.filename,
              fileSize: Number(a.fileSize),
              sha256Hash: a.sha256Hash,
              downloadUrl: a.downloadUrl,
              signature: a.signature ?? null,
            })),
          },
        },
        include: { assets: true },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_release",
        resourceType: "release",
        resourceId: release.id,
        newValues: { version: body.version, channel: body.channel },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({ success: true, data: release, error: null, message: "Release draft created" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id (update release) ────────────────────────────────────────────

router.patch(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateReleaseSchema.parse(req.body);

      const existing = await prisma.release.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "Release not found", "NOT_FOUND");

      if (existing.publishedAt) {
        throw new AppError(400, "Cannot edit a published release. Block it and create a new one.", "RELEASE_PUBLISHED");
      }

      const updated = await prisma.release.update({
        where: { id: req.params.id as string },
        data: body as any,
        include: { assets: true },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "update_release",
        resourceType: "release",
        resourceId: existing.id,
        oldValues: existing,
        newValues: body,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "Release updated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/publish ─────────────────────────────────────────────────────

router.post(
  "/:id/publish",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.release.findUnique({
        where: { id: req.params.id as string },
        include: { assets: true },
      });

      if (!existing) throw new AppError(404, "Release not found", "NOT_FOUND");
      if (existing.publishedAt) throw new AppError(400, "Release is already published", "ALREADY_PUBLISHED");
      if (existing.isBlocked) throw new AppError(400, "Cannot publish a blocked release", "RELEASE_BLOCKED");

      // Allow super_admin to force-publish without assets (for testing)
      const forcePublish = req.query.force === "true";
      if (existing.assets.length === 0 && !forcePublish) {
        throw new AppError(
          400,
          "No assets uploaded. Use 'Import from GitHub' to pull binaries, or use the Release Wizard to trigger a new build.",
          "NO_ASSETS",
        );
      }
      if (forcePublish && req.admin!.role !== "super_admin") {
        throw new AppError(403, "Only super_admin can force-publish without assets", "FORBIDDEN");
      }

      const updated = await prisma.release.update({
        where: { id: req.params.id as string },
        data: { publishedAt: new Date() },
        include: { assets: true },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "publish_release",
        resourceType: "release",
        resourceId: existing.id,
        newValues: { publishedAt: updated.publishedAt },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      // Notify all active organizations about the new release
      const orgs = await prisma.organization.findMany({
        where: { isActive: true, email: { not: null } },
        select: { email: true, name: true },
      });
      for (const org of orgs) {
        if (org.email) {
          const { subject, html } = newReleaseEmail(
            updated.version,
            updated.title,
            updated.releaseNotes || "",
            `https://cyberchakra.online/downloads`
          );
          sendEmail(org.email, subject, html).catch(err => {
            console.error(`[Email] Failed to send to ${org.email}:`, err.message);
          });
        }
      }

      res.json({ success: true, data: updated, error: null, message: "Release published" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/block ───────────────────────────────────────────────────────

router.post(
  "/:id/block",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

      const existing = await prisma.release.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "Release not found", "NOT_FOUND");
      if (existing.isBlocked) throw new AppError(400, "Release is already blocked", "ALREADY_BLOCKED");

      const updated = await prisma.release.update({
        where: { id: req.params.id as string },
        data: { isBlocked: true, blockReason: reason },
        include: { assets: true },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "block_release",
        resourceType: "release",
        resourceId: existing.id,
        newValues: { isBlocked: true, blockReason: reason },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "Release blocked" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id (delete draft release) ────────────────────────────────────

router.delete(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;

      const release = await prisma.release.findUnique({
        where: { id },
        include: { assets: true, rolloutPolicy: true },
      });

      if (!release) {
        throw new AppError(404, "Release not found", "NOT_FOUND");
      }

      if (release.publishedAt) {
        throw new AppError(400, "Cannot delete a published release. Block it instead.", "CANNOT_DELETE_PUBLISHED");
      }

      // Delete in order: stages -> policy -> assets -> release
      if (release.rolloutPolicy) {
        await prisma.rolloutStage.deleteMany({ where: { rolloutId: release.rolloutPolicy.id } });
        await prisma.rolloutPolicy.delete({ where: { id: release.rolloutPolicy.id } });
      }
      await prisma.releaseAsset.deleteMany({ where: { releaseId: id } });
      await prisma.release.delete({ where: { id } });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "release_deleted",
        resourceType: "Release",
        resourceId: id,
        oldValues: { version: release.version, channel: release.channel },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: null, error: null, message: "Release deleted" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
