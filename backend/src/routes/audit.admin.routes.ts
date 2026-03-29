import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { paginated } from "../lib/response.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin", "super_admin"));

// ─── GET / (list audit logs) ────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (req.query.action) where.action = req.query.action;
    if (req.query.resourceType) where.resourceType = req.query.resourceType;
    if (req.query.adminUserId) where.adminUserId = req.query.adminUserId;
    if (req.query.resourceId) where.resourceId = req.query.resourceId;

    // Date range filter
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(req.query.from as string);
      if (req.query.to) where.createdAt.lte = new Date(req.query.to as string);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Serialize BigInt ids for JSON
    const serialized = logs.map((log: any) => ({
      ...log,
      id: log.id.toString(),
    }));

    res.json({
      success: true,
      data: paginated(serialized, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
