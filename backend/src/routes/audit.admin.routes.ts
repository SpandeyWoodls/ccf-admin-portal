import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin", "super_admin"));

// ─── GET / (list audit logs) ────────────────────────────────────────────────

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (req.query.action && typeof req.query.action === "string") {
      where.action = req.query.action.slice(0, 100);
    }
    if (req.query.resourceType && typeof req.query.resourceType === "string") {
      where.resourceType = req.query.resourceType.slice(0, 100);
    }
    if (req.query.adminUserId) where.adminUserId = req.query.adminUserId;
    if (req.query.resourceId) where.resourceId = req.query.resourceId;

    // Date range filter with validation
    const fromDate = parseDate(req.query.from);
    const toDate = parseDate(req.query.to);
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
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
