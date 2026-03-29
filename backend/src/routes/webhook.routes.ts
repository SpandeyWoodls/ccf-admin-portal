import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Webhook authentication (Bearer token, not JWT) ────────────────────────
// This middleware authenticates GitHub Actions CI/CD webhook calls using a
// shared secret. The token is stored as GITHUB_WEBHOOK_SECRET on the server
// and as ADMIN_PORTAL_WEBHOOK_KEY in GitHub repository secrets.

function requireWebhookAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.GITHUB_WEBHOOK_SECRET;

  if (!expectedToken) {
    return next(new AppError(500, "Webhook secret not configured on server", "WEBHOOK_NOT_CONFIGURED"));
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing webhook authorization header", "UNAUTHORIZED"));
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(token, "utf8");

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return next(new AppError(403, "Invalid webhook token", "FORBIDDEN"));
  }

  next();
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const webhookAssetSchema = z.object({
  platform: z.enum(["windows", "linux", "android"]),
  arch: z.string().default("x86_64"),
  packageType: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().int().min(0),
  sha256Hash: z.string().length(64),
  downloadUrl: z.string().url(),
  signature: z.string().optional().nullable(),
});

const githubReleaseWebhookSchema = z.object({
  version: z.string().min(1).max(30),
  channel: z.enum(["stable", "beta", "rc"]).default("stable"),
  severity: z.enum(["critical", "recommended", "optional"]).default("optional"),
  title: z.string().min(1).max(255),
  releaseNotes: z.string().optional().nullable(),
  gitCommitSha: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  releaseUrl: z.string().url().optional().nullable(),
  forceUpdate: z.boolean().default(false),
  assets: z.array(webhookAssetSchema).default([]),
});

// ─── POST /github-release ──────────────────────────────────────────────────
// Called by GitHub Actions release.yml after a successful multi-platform build.
// Creates a draft release in the admin portal. An admin must manually publish
// it via POST /api/v1/admin/releases/:id/publish before the desktop updater
// sees it.

router.post(
  "/github-release",
  requireWebhookAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = githubReleaseWebhookSchema.parse(req.body);

      // Check for existing release with same version + channel
      const existing = await prisma.release.findFirst({
        where: { version: body.version, channel: body.channel },
      });

      if (existing) {
        // Update existing draft: replace assets, update metadata
        await prisma.releaseAsset.deleteMany({ where: { releaseId: existing.id } });

        const updated = await prisma.release.update({
          where: { id: existing.id },
          data: {
            title: body.title,
            releaseNotes: body.releaseNotes ?? null,
            gitCommitSha: body.gitCommitSha ?? null,
            severity: body.severity,
            forceUpdate: body.forceUpdate,
            assets: {
              create: body.assets.map((a) => ({
                platform: a.platform,
                arch: a.arch,
                packageType: a.packageType,
                filename: a.filename,
                fileSize: BigInt(a.fileSize),
                sha256Hash: a.sha256Hash,
                downloadUrl: a.downloadUrl,
                signature: a.signature ?? null,
              })),
            },
          },
          include: { assets: true },
        });

        await logAudit({
          adminUserId: null, // System action via CI/CD
          action: "webhook_update_release",
          resourceType: "release",
          resourceId: updated.id,
          newValues: {
            version: body.version,
            channel: body.channel,
            source: "github-actions",
            tag: body.tag,
          },
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        });

        res.json({
          success: true,
          data: { id: updated.id, action: "updated" },
          error: null,
          message: `Release ${body.version} (${body.channel}) updated with new assets`,
        });
        return;
      }

      // Create new draft release
      const release = await prisma.release.create({
        data: {
          version: body.version,
          channel: body.channel,
          severity: body.severity,
          title: body.title,
          releaseNotes: body.releaseNotes ?? null,
          gitCommitSha: body.gitCommitSha ?? null,
          forceUpdate: body.forceUpdate,
          // publishedAt is left null -- admin must manually publish
          assets: {
            create: body.assets.map((a) => ({
              platform: a.platform,
              arch: a.arch,
              packageType: a.packageType,
              filename: a.filename,
              fileSize: BigInt(a.fileSize),
              sha256Hash: a.sha256Hash,
              downloadUrl: a.downloadUrl,
              signature: a.signature ?? null,
            })),
          },
        },
        include: { assets: true },
      });

      await logAudit({
        adminUserId: null,
        action: "webhook_create_release",
        resourceType: "release",
        resourceId: release.id,
        newValues: {
          version: body.version,
          channel: body.channel,
          source: "github-actions",
          tag: body.tag,
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({
        success: true,
        data: { id: release.id, action: "created" },
        error: null,
        message: `Release ${body.version} (${body.channel}) created as draft. Publish via admin portal.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
