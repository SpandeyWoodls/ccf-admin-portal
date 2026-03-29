import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { addDays } from "date-fns";

const router = Router();

router.use(requireAuth);

// ─── GET /dashboard ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get dashboard statistics
 *     description: Returns aggregate statistics for the admin dashboard including active licenses, expiring licenses, organization counts, trial conversion rates, and recent activity.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalActiveLicenses:
 *                       type: integer
 *                     expiringWithin30Days:
 *                       type: integer
 *                     totalOrganizations:
 *                       type: integer
 *                     activeTrials:
 *                       type: integer
 *                     trialConversionRate:
 *                       type: number
 *                       description: Percentage (0-100)
 *                     recentActivity:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           actorType:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     licensesByTier:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                     licensesByStatus:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *       401:
 *         description: Not authenticated
 */
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);

    // Run all queries in parallel for performance
    const [
      totalActiveLicenses,
      expiringWithin30Days,
      totalOrganizations,
      activeTrials,
      totalTrials,
      convertedTrials,
      recentActivity,
      licensesByTier,
      licensesByStatus,
    ] = await Promise.all([
      // Total active licenses
      prisma.license.count({ where: { status: "active" } }),

      // Licenses expiring within 30 days
      prisma.license.count({
        where: {
          status: { in: ["active", "issued"] },
          validUntil: { not: null, lte: thirtyDaysFromNow, gt: now },
        },
      }),

      // Total organizations
      prisma.organization.count({ where: { isActive: true } }),

      // Active trial licenses
      prisma.license.count({
        where: { licenseType: "trial", status: { in: ["active", "issued"] } },
      }),

      // Total trial licenses ever issued (for conversion rate)
      prisma.license.count({ where: { licenseType: "trial" } }),

      // Trials that were followed by a non-trial license for the same org
      // Simplified: count trials where org also has a non-trial license
      prisma.license.count({
        where: {
          licenseType: "trial",
          status: { in: ["expired", "revoked"] },
          organization: {
            licenses: {
              some: {
                licenseType: { not: "trial" },
              },
            },
          },
        },
      }),

      // Recent activity (last 20 license events)
      prisma.licenseEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          action: true,
          actorType: true,
          actorEmail: true,
          createdAt: true,
          license: { select: { licenseKey: true, tier: true } },
          organization: { select: { name: true } },
        },
      }),

      // Licenses grouped by tier
      prisma.license.groupBy({
        by: ["tier"],
        _count: { tier: true },
        where: { status: { in: ["active", "issued"] } },
      }),

      // Licenses grouped by status
      prisma.license.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    // Calculate trial conversion rate
    const trialConversionRate = totalTrials > 0
      ? Math.round((convertedTrials / totalTrials) * 100 * 10) / 10
      : 0;

    // Transform groupBy results into objects
    const tierCounts: Record<string, number> = {};
    for (const row of licensesByTier) {
      tierCounts[row.tier] = row._count.tier;
    }

    const statusCounts: Record<string, number> = {};
    for (const row of licensesByStatus) {
      statusCounts[row.status] = row._count.status;
    }

    // Serialize BigInt fields for JSON
    const serializedActivity = recentActivity.map((evt: any) => ({
      ...evt,
      id: evt.id.toString(),
    }));

    res.json({
      success: true,
      data: {
        totalActiveLicenses,
        expiringWithin30Days,
        totalOrganizations,
        activeTrials,
        trialConversionRate,
        recentActivity: serializedActivity,
        licensesByTier: tierCounts,
        licensesByStatus: statusCounts,
      },
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
