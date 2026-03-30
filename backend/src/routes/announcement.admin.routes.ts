import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";

const router = Router();

router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  announcementType: z.enum(["info", "warning", "critical", "maintenance"]).default("info"),
  targetOrgIds: z.array(z.string().uuid()).optional().nullable(),
  targetTiers: z.array(z.string()).optional().nullable(),
  targetVersions: z.array(z.string()).optional().nullable(),
  actionUrl: z.string().url().optional().nullable(),
  actionLabel: z.string().max(100).optional().nullable(),
  dismissible: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

const updateAnnouncementSchema = createAnnouncementSchema.partial();

// ─── GET / (list announcements) ─────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (req.query.isActive !== undefined) where.isActive = req.query.isActive === "true";

    const validAnnouncementTypes = ["info", "warning", "critical", "maintenance"];
    if (req.query.announcementType && validAnnouncementTypes.includes(req.query.announcementType as string)) {
      where.announcementType = req.query.announcementType as string;
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.announcement.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(announcements, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id as string },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!announcement) throw new AppError(404, "Announcement not found", "NOT_FOUND");

    res.json({ success: true, data: announcement, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST / (create announcement) ──────────────────────────────────────────

router.post(
  "/",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createAnnouncementSchema.parse(req.body);

      const announcement = await prisma.announcement.create({
        data: {
          title: body.title,
          message: body.message,
          announcementType: body.announcementType,
          targetOrgIds: body.targetOrgIds ?? undefined,
          targetTiers: body.targetTiers ?? undefined,
          targetVersions: body.targetVersions ?? undefined,
          actionUrl: body.actionUrl ?? null,
          actionLabel: body.actionLabel ?? null,
          dismissible: body.dismissible,
          priority: body.priority,
          startsAt: new Date(body.startsAt),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: body.isActive,
          createdById: req.admin!.id,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_announcement",
        resourceType: "announcement",
        resourceId: announcement.id,
        newValues: { title: body.title, announcementType: body.announcementType },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({ success: true, data: announcement, error: null, message: "Announcement created" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id (update announcement) ──────────────────────────────────────

router.patch(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateAnnouncementSchema.parse(req.body);

      const existing = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "Announcement not found", "NOT_FOUND");

      const updateData: any = {};
      if (body.title !== undefined) updateData.title = body.title;
      if (body.message !== undefined) updateData.message = body.message;
      if (body.announcementType !== undefined) updateData.announcementType = body.announcementType;
      if (body.targetOrgIds !== undefined) updateData.targetOrgIds = body.targetOrgIds;
      if (body.targetTiers !== undefined) updateData.targetTiers = body.targetTiers;
      if (body.targetVersions !== undefined) updateData.targetVersions = body.targetVersions;
      if (body.actionUrl !== undefined) updateData.actionUrl = body.actionUrl;
      if (body.actionLabel !== undefined) updateData.actionLabel = body.actionLabel;
      if (body.dismissible !== undefined) updateData.dismissible = body.dismissible;
      if (body.priority !== undefined) updateData.priority = body.priority;
      if (body.startsAt !== undefined) updateData.startsAt = new Date(body.startsAt);
      if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;

      const updated = await prisma.announcement.update({
        where: { id: req.params.id as string },
        data: updateData,
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "update_announcement",
        resourceType: "announcement",
        resourceId: existing.id,
        oldValues: existing,
        newValues: updateData,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "Announcement updated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id ────────────────────────────────────────────────────────────

router.delete(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "Announcement not found", "NOT_FOUND");

      await prisma.announcement.delete({ where: { id: req.params.id as string } });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "delete_announcement",
        resourceType: "announcement",
        resourceId: existing.id,
        oldValues: { title: existing.title },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: null, error: null, message: "Announcement deleted" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
