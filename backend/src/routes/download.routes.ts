import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { paginated } from "../lib/response.js";

const router = Router();

// ─── Admin Routes (require JWT auth) ───────────────────────────────────────

/**
 * @swagger
 * /api/v1/admin/downloads:
 *   get:
 *     summary: List published releases for the download portal
 *     tags: [Downloads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [stable, beta, rc] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by version or title
 */
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const skip = (page - 1) * pageSize;

      const where: any = {
        publishedAt: { not: null }, // Only published releases
        isBlocked: false,           // Exclude blocked releases
      };

      const validChannels = ["stable", "beta", "rc"];
      if (req.query.channel && typeof req.query.channel === "string" && validChannels.includes(req.query.channel)) {
        where.channel = req.query.channel;
      }

      if (req.query.search) {
        const search = String(req.query.search).slice(0, 200);
        where.OR = [
          { version: { contains: search } },
          { title: { contains: search } },
        ];
      }

      const [releases, total] = await Promise.all([
        prisma.release.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { publishedAt: "desc" },
          include: {
            assets: {
              select: {
                id: true,
                platform: true,
                arch: true,
                packageType: true,
                filename: true,
                fileSize: true,
                sha256Hash: true,
                downloadUrl: true,
                signature: true,
              },
            },
            _count: {
              select: {
                assets: true,
              },
            },
          },
        }),
        prisma.release.count({ where }),
      ]);

      // Convert BigInt fileSize to number for JSON serialization
      const serialized = releases.map((r: any) => ({
        ...r,
        assets: r.assets.map((a: any) => ({
          ...a,
          fileSize: Number(a.fileSize),
        })),
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
  }
);

/**
 * @swagger
 * /api/v1/admin/downloads/stats:
 *   get:
 *     summary: Download statistics for the admin dashboard
 *     tags: [Downloads]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // Total downloads this month
      const thisMonthCount = await prisma.download.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      });

      // Total downloads last month (for trend calculation)
      const lastMonthCount = await prisma.download.count({
        where: {
          createdAt: {
            gte: startOfLastMonth,
            lt: startOfMonth,
          },
        },
      });

      // Downloads by platform this month (via asset relation)
      const byPlatformRaw = await prisma.download.groupBy({
        by: ["downloadType"],
        _count: { id: true },
        where: {
          createdAt: { gte: startOfMonth },
        },
      });

      const byPlatform = byPlatformRaw.map((row: any) => ({
        downloadType: row.downloadType,
        count: row._count.id,
      }));

      // Calculate trend percentage
      const trend =
        lastMonthCount > 0
          ? parseFloat(
              (
                ((thisMonthCount - lastMonthCount) / lastMonthCount) *
                100
              ).toFixed(1)
            )
          : 0;

      res.json({
        success: true,
        data: {
          totalThisMonth: thisMonthCount,
          byPlatform,
          trend,
        },
        error: null,
        message: "",
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/v1/admin/downloads/{assetId}/track:
 *   post:
 *     summary: Track a download event when an admin downloads an asset
 *     tags: [Downloads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema: { type: string }
 */
router.post(
  "/:assetId/track",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assetId = req.params.assetId as string;

      // Validate asset exists
      const asset = await prisma.releaseAsset.findUnique({
        where: { id: assetId },
        include: {
          release: {
            select: { id: true, version: true },
          },
        },
      });

      if (!asset) {
        throw new AppError(404, "Asset not found", "NOT_FOUND");
      }

      // Create download record using the Download model
      await prisma.download.create({
        data: {
          assetId,
          ipAddress: req.ip ?? null,
          userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
          downloadType: "manual",
        },
      });

      // Audit log
      await logAudit({
        adminUserId: req.admin!.id,
        action: "download_asset",
        resourceType: "release_asset",
        resourceId: assetId,
        newValues: {
          filename: asset.filename,
          version: asset.release.version,
          platform: asset.platform,
        },
        ipAddress: req.ip ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      });

      res.json({
        success: true,
        data: { tracked: true },
        error: null,
        message: "Download tracked",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Public Authenticated Download ─────────────────────────────────────────

/**
 * @swagger
 * /api/v1/downloads/{assetId}:
 *   get:
 *     summary: Download an asset (requires license key header or admin JWT)
 *     tags: [Downloads]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: X-License-Key
 *         schema: { type: string }
 *         description: License key for authenticated download
 */
export async function publicDownloadHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const assetId = req.params.assetId as string;
    const licenseKey = req.headers["x-license-key"] as string | undefined;
    const authHeader = req.headers.authorization;

    // Require at least one authentication method
    if (!licenseKey && !authHeader) {
      throw new AppError(
        401,
        "Authentication required. Provide X-License-Key header or Authorization Bearer token.",
        "UNAUTHORIZED"
      );
    }

    // Validate license key if provided
    if (licenseKey) {
      const license = await prisma.license.findFirst({
        where: {
          licenseKey,
          status: "active",
        },
      });

      if (!license) {
        throw new AppError(
          403,
          "Invalid or inactive license key",
          "INVALID_LICENSE"
        );
      }
    }

    // Look up the asset
    const asset = await prisma.releaseAsset.findUnique({
      where: { id: assetId },
      include: {
        release: {
          select: {
            id: true,
            version: true,
            publishedAt: true,
            isBlocked: true,
          },
        },
      },
    });

    if (!asset) {
      throw new AppError(404, "Asset not found", "NOT_FOUND");
    }

    if (!asset.release.publishedAt) {
      throw new AppError(404, "Release is not published yet", "NOT_PUBLISHED");
    }

    if (asset.release.isBlocked) {
      throw new AppError(
        403,
        "This release has been blocked. Please download a newer version.",
        "RELEASE_BLOCKED"
      );
    }

    // Track the download using the Download model
    await prisma.download.create({
      data: {
        assetId,
        licenseKey: licenseKey ?? null,
        ipAddress: req.ip ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
        downloadType: licenseKey ? "api" : "manual",
      },
    });

    // Redirect to the actual download URL
    // In production, this would be a signed S3/R2 URL with expiry
    res.redirect(302, asset.downloadUrl);
  } catch (err) {
    next(err);
  }
}

export default router;
