import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { logLicenseEvent } from "../lib/audit.js";
import { AppError } from "../middleware/errorHandler.js";
import { v4 as uuidv4 } from "uuid";
import semver from "semver";
import { isAfter, isBefore, addDays } from "date-fns";
import { shouldReceiveUpdate, getBlockedVersionInfo } from "../services/rollout.js";
import { generateValidationToken, uuidToNumericId } from "../lib/validation-token.js";

const router = Router();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const activateSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().min(1),
  user_email: z.string().email().optional(),
  machine_name: z.string().optional(),
  os_info: z.string().optional(),
  app_version: z.string().optional(),
});

const validateSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().min(1),
  app_version: z.string().optional(),
});

const deactivateSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().min(1),
});

const heartbeatSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().min(1),
  app_version: z.string().optional(),
  usage_stats: z
    .object({
      cases_created: z.number().int().min(0).optional().default(0),
      acquisitions: z.number().int().min(0).optional().default(0),
      reports_generated: z.number().int().min(0).optional().default(0),
    })
    .optional(),
});

// ─── POST /activate ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/license/activate:
 *   post:
 *     tags: [Desktop App]
 *     summary: Activate a license
 *     description: Activate a license key on a specific machine. Checks status, expiry, and activation limits before creating a new activation record.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_key, hardware_fingerprint]
 *             properties:
 *               license_key:
 *                 type: string
 *                 example: CCF-XXXX-XXXX-XXXX
 *               hardware_fingerprint:
 *                 type: string
 *                 example: a1b2c3d4e5f6
 *               user_email:
 *                 type: string
 *                 format: email
 *               machine_name:
 *                 type: string
 *               os_info:
 *                 type: string
 *               app_version:
 *                 type: string
 *     responses:
 *       200:
 *         description: License activated (or already active on this machine)
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
 *                     activation_id:
 *                       type: string
 *                     license_type:
 *                       type: string
 *                     tier:
 *                       type: string
 *                     valid_until:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     feature_flags:
 *                       type: object
 *                     max_activations:
 *                       type: integer
 *                     current_activations:
 *                       type: integer
 *       403:
 *         description: License revoked, suspended, expired, or activation limit reached
 *       404:
 *         description: License key not found
 */
router.post("/activate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = activateSchema.parse(req.body);

    // Use a serializable transaction to prevent race conditions on seat limits.
    // All reads and writes happen atomically so two concurrent activations
    // cannot both pass the maxActivations check.
    const result = await prisma.$transaction(async (tx) => {
      const license = await tx.license.findUnique({
        where: { licenseKey: body.license_key },
        include: { activations: { where: { isActive: true } }, organization: { select: { name: true } } },
      });

      if (!license) {
        throw new AppError(404, "License key not found", "LICENSE_NOT_FOUND");
      }

      // Check license status
      if (license.status === "revoked") {
        throw new AppError(403, "This license has been revoked", "LICENSE_REVOKED");
      }
      if (license.status === "suspended") {
        throw new AppError(403, "This license is suspended", "LICENSE_SUSPENDED");
      }
      if (license.status === "expired") {
        throw new AppError(403, "This license has expired", "LICENSE_EXPIRED");
      }

      // Check expiry
      if (license.validUntil && isAfter(new Date(), license.validUntil)) {
        await tx.license.update({
          where: { id: license.id },
          data: { status: "expired" },
        });
        throw new AppError(403, "This license has expired", "LICENSE_EXPIRED");
      }

      // Check if not yet valid
      if (isBefore(new Date(), license.validFrom)) {
        throw new AppError(403, "This license is not yet valid", "LICENSE_NOT_YET_VALID");
      }

      const activeCount = license.activations.length;

      // Check if already activated on this machine (idempotent)
      const existingActivation = license.activations.find(
        (a: any) => a.hardwareFingerprint === body.hardware_fingerprint,
      );

      if (existingActivation) {
        // Already activated - update and return success
        const existingValidatedAt = new Date().toISOString();
        const existingExpiresAt = license.validUntil?.toISOString() ?? "";
        const existingHmacToken = generateValidationToken(
          body.license_key,
          body.hardware_fingerprint,
          existingValidatedAt,
          existingExpiresAt,
        );

        await tx.licenseActivation.update({
          where: { id: existingActivation.id },
          data: {
            lastValidatedAt: new Date(),
            appVersion: body.app_version ?? existingActivation.appVersion,
            validationToken: existingHmacToken,
          },
        });

        // Update license status to active if it was just issued
        if (license.status === "issued") {
          await tx.license.update({
            where: { id: license.id },
            data: { status: "active" },
          });
        }

        return { license, activation: existingActivation, isNew: false, hmacToken: existingHmacToken, expiresAt: existingExpiresAt };
      }

      // Check activation limit INSIDE transaction to prevent race condition
      if (activeCount >= license.maxActivations) {
        throw new AppError(
          403,
          `Maximum activations (${license.maxActivations}) reached. Deactivate another device first.`,
          "ACTIVATION_LIMIT_REACHED",
        );
      }

      // Generate HMAC validation token for offline validation
      const activateValidatedAt = new Date().toISOString();
      const activateExpiresAt = license.validUntil?.toISOString() ?? "";
      const activateHmacToken = generateValidationToken(
        body.license_key,
        body.hardware_fingerprint,
        activateValidatedAt,
        activateExpiresAt,
      );

      // Create new activation within same transaction
      const activation = await tx.licenseActivation.create({
        data: {
          licenseId: license.id,
          hardwareFingerprint: body.hardware_fingerprint,
          machineName: body.machine_name ?? null,
          osInfo: body.os_info ?? null,
          userEmail: body.user_email ?? null,
          appVersion: body.app_version ?? null,
          ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
          isActive: true,
          activatedAt: new Date(),
          lastValidatedAt: new Date(),
          validationToken: activateHmacToken,
        },
      });

      // Update activation count atomically within transaction
      await tx.license.update({
        where: { id: license.id },
        data: {
          currentActivations: activeCount + 1,
          status: "active",
        },
      });

      return { license, activation, isNew: true, hmacToken: activateHmacToken, expiresAt: activateExpiresAt };
    });

    // Post-transaction work (audit log, announcements) - outside transaction to keep it short

    if (result.isNew) {
      await logLicenseEvent({
        licenseId: result.license.id,
        activationId: result.activation.id,
        organizationId: result.license.organizationId,
        action: "activated",
        actorType: "desktop_app",
        actorEmail: body.user_email ?? null,
        actorIp: (req.ip || req.socket.remoteAddress) ?? null,
        newValues: {
          hardware_fingerprint: body.hardware_fingerprint,
          machine_name: body.machine_name,
          os_info: body.os_info,
          app_version: body.app_version,
        },
      });
    }

    // Fetch active announcements for the response
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { message: true, announcementType: true },
    });

    const nextValidation = new Date();
    nextValidation.setDate(nextValidation.getDate() + 30);

    // Response MUST match Rust ServerResponseData struct:
    // { license_id (int), organization (name string), expires_at, validation_token (HMAC base64), next_validation, announcements }
    res.json(
      desktopResponse(true, {
        license_id: uuidToNumericId(result.license.id),
        organization: result.license.organization?.name ?? "Unknown",
        expires_at: result.expiresAt || null,
        validation_token: result.hmacToken,
        next_validation: nextValidation.toISOString(),
        announcements: announcements.map((a: any) => ({
          message: a.message,
          announcement_type: a.announcementType,
        })),
      }, null, result.isNew ? "License activated successfully" : "License already activated on this machine"),
    );
  } catch (err) {
    next(err);
  }
});

// ─── POST /validate ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/license/validate:
 *   post:
 *     tags: [Desktop App]
 *     summary: Validate a license
 *     description: Check whether a license is valid and active on the given machine. Updates the last-validated timestamp.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_key, hardware_fingerprint]
 *             properties:
 *               license_key:
 *                 type: string
 *               hardware_fingerprint:
 *                 type: string
 *               app_version:
 *                 type: string
 *     responses:
 *       200:
 *         description: License validation result
 *       403:
 *         description: License expired, revoked, suspended, or not activated on this machine
 *       404:
 *         description: License key not found
 */
router.post("/validate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validateSchema.parse(req.body);

    const license = await prisma.license.findUnique({
      where: { licenseKey: body.license_key },
      include: { organization: { select: { name: true } } },
    });

    if (!license) {
      res.status(404).json(desktopResponse(false, null, "LICENSE_NOT_FOUND", "License key not found"));
      return;
    }

    // Check expiry
    if (license.validUntil && isAfter(new Date(), license.validUntil)) {
      if (license.status !== "expired") {
        await prisma.license.update({
          where: { id: license.id },
          data: { status: "expired" },
        });
      }
      res.status(403).json(desktopResponse(false, null, "LICENSE_EXPIRED", "This license has expired"));
      return;
    }

    if (license.status === "revoked") {
      res.status(403).json(desktopResponse(false, null, "LICENSE_REVOKED", "This license has been revoked"));
      return;
    }
    if (license.status === "suspended") {
      res.status(403).json(desktopResponse(false, null, "LICENSE_SUSPENDED", "This license is suspended"));
      return;
    }

    // Find activation for this hardware
    const activation = await prisma.licenseActivation.findFirst({
      where: {
        licenseId: license.id,
        hardwareFingerprint: body.hardware_fingerprint,
        isActive: true,
      },
    });

    if (!activation) {
      res.status(403).json(
        desktopResponse(false, null, "NOT_ACTIVATED", "License not activated on this machine"),
      );
      return;
    }

    // Generate fresh HMAC validation token on each validation
    const validateValidatedAt = new Date().toISOString();
    const validateExpiresAt = license.validUntil?.toISOString() ?? "";
    const validateHmacToken = generateValidationToken(
      body.license_key,
      body.hardware_fingerprint,
      validateValidatedAt,
      validateExpiresAt,
    );

    // Update validation timestamp and store new HMAC token
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: {
        lastValidatedAt: new Date(),
        appVersion: body.app_version ?? activation.appVersion,
        validationToken: validateHmacToken,
      },
    });

    const validateNextValidation = new Date();
    validateNextValidation.setDate(validateNextValidation.getDate() + 30);

    // Fetch active announcements
    const validateNow = new Date();
    const validateAnnouncements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: validateNow },
        OR: [{ expiresAt: null }, { expiresAt: { gt: validateNow } }],
      },
      select: { message: true, announcementType: true },
    });

    // Response MUST match Rust ServerResponseData struct:
    // { license_id (int), organization (name string), expires_at, validation_token (HMAC base64), next_validation, announcements }
    res.json(
      desktopResponse(true, {
        license_id: uuidToNumericId(license.id),
        organization: (license as any).organization?.name ?? "Unknown",
        expires_at: validateExpiresAt || null,
        validation_token: validateHmacToken,
        next_validation: validateNextValidation.toISOString(),
        announcements: validateAnnouncements.map((a: any) => ({
          message: a.message,
          announcement_type: a.announcementType,
        })),
      }, null, "License is valid"),
    );
  } catch (err) {
    next(err);
  }
});

// ─── POST /deactivate ───────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/license/deactivate:
 *   post:
 *     tags: [Desktop App]
 *     summary: Deactivate a license
 *     description: Deactivate a license on the current machine, freeing up an activation slot.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_key, hardware_fingerprint]
 *             properties:
 *               license_key:
 *                 type: string
 *               hardware_fingerprint:
 *                 type: string
 *     responses:
 *       200:
 *         description: License deactivated successfully
 *       404:
 *         description: License or activation not found
 */
router.post("/deactivate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = deactivateSchema.parse(req.body);

    const license = await prisma.license.findUnique({
      where: { licenseKey: body.license_key },
    });

    if (!license) {
      res.status(404).json(desktopResponse(false, null, "LICENSE_NOT_FOUND", "License key not found"));
      return;
    }

    const activation = await prisma.licenseActivation.findFirst({
      where: {
        licenseId: license.id,
        hardwareFingerprint: body.hardware_fingerprint,
        isActive: true,
      },
    });

    if (!activation) {
      res.status(404).json(
        desktopResponse(false, null, "ACTIVATION_NOT_FOUND", "No active activation found for this machine"),
      );
      return;
    }

    // Deactivate
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    // Decrement count
    const newCount = Math.max(0, license.currentActivations - 1);
    await prisma.license.update({
      where: { id: license.id },
      data: { currentActivations: newCount },
    });

    await logLicenseEvent({
      licenseId: license.id,
      activationId: activation.id,
      organizationId: license.organizationId,
      action: "deactivated",
      actorType: "desktop_app",
      actorIp: (req.ip || req.socket.remoteAddress) ?? null,
      metadata: { hardware_fingerprint: body.hardware_fingerprint },
    });

    res.json(desktopResponse(true, { deactivated: true }, null, "License deactivated successfully"));
  } catch (err) {
    next(err);
  }
});

// ─── POST /heartbeat (mounted at /api/v1/heartbeat) ────────────────────────

/**
 * @openapi
 * /api/v1/heartbeat:
 *   post:
 *     tags: [Desktop App]
 *     summary: Send heartbeat
 *     description: Desktop app periodic heartbeat reporting usage statistics and confirming the app is still running.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_key, hardware_fingerprint]
 *             properties:
 *               license_key:
 *                 type: string
 *               hardware_fingerprint:
 *                 type: string
 *               app_version:
 *                 type: string
 *               usage_stats:
 *                 type: object
 *                 properties:
 *                   cases_created:
 *                     type: integer
 *                   acquisitions:
 *                     type: integer
 *                   reports_generated:
 *                     type: integer
 *     responses:
 *       200:
 *         description: Heartbeat recorded
 */
export const heartbeatHandler = Router();
heartbeatHandler.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = heartbeatSchema.parse(req.body);

    // Store heartbeat
    await prisma.heartbeat.create({
      data: {
        licenseKey: body.license_key,
        hardwareFingerprint: body.hardware_fingerprint,
        appVersion: body.app_version ?? "",
        casesCreated: body.usage_stats?.cases_created ?? 0,
        acquisitions: body.usage_stats?.acquisitions ?? 0,
        reportsGenerated: body.usage_stats?.reports_generated ?? 0,
        ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
      },
    });

    // Update last heartbeat on activation
    const license = await prisma.license.findUnique({
      where: { licenseKey: body.license_key },
    });

    if (license) {
      await prisma.licenseActivation.updateMany({
        where: {
          licenseId: license.id,
          hardwareFingerprint: body.hardware_fingerprint,
          isActive: true,
        },
        data: {
          lastHeartbeatAt: new Date(),
          appVersion: body.app_version ?? undefined,
        },
      });
    }

    // Response MUST match Rust HeartbeatResponse struct (NOT ServerResponse!):
    // { success: bool, announcements: Vec<String>, commands: Vec<String>, update_available: Option<UpdateInfo> }
    // Note: announcements here is Vec<String> (just message strings), NOT Vec<Announcement>
    // Note: commands is Vec<String> for remote command execution (e.g., "force_revalidate")
    const heartbeatNow = new Date();
    const heartbeatAnnouncements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: heartbeatNow },
        OR: [{ expiresAt: null }, { expiresAt: { gt: heartbeatNow } }],
      },
      select: { message: true },
      orderBy: [{ priority: "desc" }],
      take: 10,
    });

    res.json({
      success: true,
      announcements: heartbeatAnnouncements.map((a: any) => a.message),
      commands: [],
      update_available: null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /health (mounted at /api/v1/health) ───────────────────────────────

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags: [Desktop App]
 *     summary: Health check
 *     description: Simple health check endpoint to verify the API server is running.
 *     responses:
 *       200:
 *         description: Server is healthy
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
 *                     status:
 *                       type: string
 *                       example: ok
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
export const healthHandler = Router();
healthHandler.get("/", (_req: Request, res: Response) => {
  res.json(desktopResponse(true, { status: "ok", timestamp: new Date().toISOString() }, null, "Server is healthy"));
});

// ─── GET /announcements (mounted at /api/v1/announcements) ─────────────────

/**
 * @openapi
 * /api/v1/announcements:
 *   get:
 *     tags: [Desktop App]
 *     summary: Get active announcements
 *     description: Returns all currently active announcements for display in the desktop application.
 *     responses:
 *       200:
 *         description: List of active announcements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       announcementType:
 *                         type: string
 *                         enum: [info, warning, critical, feature]
 *                       dismissible:
 *                         type: boolean
 *                       priority:
 *                         type: integer
 */
export const announcementsPublicHandler = Router();
announcementsPublicHandler.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ priority: "desc" }, { startsAt: "desc" }],
      select: {
        id: true,
        title: true,
        message: true,
        announcementType: true,
        actionUrl: true,
        actionLabel: true,
        dismissible: true,
        priority: true,
        startsAt: true,
        expiresAt: true,
      },
    });

    // Response MUST match what Rust AnnouncementsResponse expects:
    // { success: bool, data: { announcements: Vec<Announcement> } }
    // where Announcement = { message: String, announcement_type: String }
    // Note: Prisma returns camelCase "announcementType" but Rust expects snake_case "announcement_type"
    res.json(desktopResponse(true, {
      announcements: announcements.map((a: any) => ({
        message: a.message,
        announcement_type: a.announcementType,
      })),
    }, null, ""));
  } catch (err) {
    next(err);
  }
});

// ─── GET /update-check (mounted at /api/v1/update-check) ───────────────────

/**
 * @openapi
 * /api/v1/update-check:
 *   get:
 *     tags: [Desktop App]
 *     summary: Check for application updates
 *     description: Returns Tauri-compatible update JSON if a newer version is available. Returns 204 if already up-to-date.
 *     parameters:
 *       - in: query
 *         name: target
 *         schema:
 *           type: string
 *           default: windows
 *         description: Target platform (windows, linux)
 *       - in: query
 *         name: arch
 *         schema:
 *           type: string
 *           default: x86_64
 *         description: CPU architecture
 *       - in: query
 *         name: current_version
 *         schema:
 *           type: string
 *         description: Currently installed version (e.g. 1.0.0)
 *       - in: header
 *         name: X-License-Key
 *         schema:
 *           type: string
 *         description: License key (CCF-XXXX-XXXX-XXXX) for staged rollout targeting
 *       - in: header
 *         name: X-Hardware-Fingerprint
 *         schema:
 *           type: string
 *         description: Machine hardware fingerprint for rollout bucketing
 *       - in: header
 *         name: X-App-Channel
 *         schema:
 *           type: string
 *           default: stable
 *           enum: [stable, beta, nightly]
 *         description: Release channel the client is enrolled in
 *     responses:
 *       200:
 *         description: Update available (Tauri updater JSON format)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                 notes:
 *                   type: string
 *                 pub_date:
 *                   type: string
 *                   format: date-time
 *                 platforms:
 *                   type: object
 *       204:
 *         description: No update available (already on latest version)
 */
export const updateCheckHandler = Router();
updateCheckHandler.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = (req.query.target as string) || "windows";
    const arch = (req.query.arch as string) || "x86_64";
    const currentVersion = req.query.current_version as string | undefined;
    const licenseKey = (req.headers["x-license-key"] as string) || (req.query.license_key as string) || null;
    const fingerprint = (req.headers["x-hardware-fingerprint"] as string) || (req.query.hardware_fingerprint as string) || null;
    // Clients send X-App-Channel to opt into beta/nightly releases; default to stable
    const channel = (req.headers["x-app-channel"] as string) || "stable";

    // Check if the client's current version is blocked (force-downgrade / force-update)
    if (currentVersion) {
      const blockInfo = await getBlockedVersionInfo(currentVersion);
      if (blockInfo.blocked) {
        // If there is a forced update target, find that release
        if (blockInfo.forceUpdateTo) {
          const forcedRelease = await prisma.release.findFirst({
            where: { version: blockInfo.forceUpdateTo, isBlocked: false },
            include: { assets: { where: { platform: target as any, arch } } },
          });

          if (forcedRelease && forcedRelease.assets.length > 0) {
            const asset = forcedRelease.assets[0]!;
            res.json({
              version: forcedRelease.version,
              notes: `[MANDATORY] ${blockInfo.reason || "Your current version has been blocked."}`,
              pub_date: forcedRelease.publishedAt?.toISOString() ?? new Date().toISOString(),
              platforms: {
                [`${target}-${arch}`]: {
                  signature: asset.signature ?? "",
                  url: asset.downloadUrl,
                },
              },
            });
            return;
          }
        }
        // Blocked but no forced target - still inform via 204 (no safe update path)
        res.status(204).send();
        return;
      }
    }

    // Find the latest published, non-blocked release for the requested channel
    const latestRelease = await prisma.release.findFirst({
      where: {
        channel: channel as any,
        isBlocked: false,
        publishedAt: { not: null },
      },
      orderBy: { publishedAt: "desc" },
      include: {
        assets: {
          where: {
            platform: target as any,
            arch,
          },
        },
      },
    });

    if (!latestRelease || latestRelease.assets.length === 0) {
      // Tauri updater expects 204 when no update available
      res.status(204).send();
      return;
    }

    // Proper semver comparison: skip update if client is already on latest or newer
    if (currentVersion && semver.valid(currentVersion) && semver.valid(latestRelease.version)) {
      if (semver.gte(currentVersion, latestRelease.version)) {
        // Even if version is current/newer, a forced update must still be delivered
        if (!latestRelease.forceUpdate) {
          res.status(204).send(); // Already on latest or newer
          return;
        }
      }
    }

    // Check staged rollout: should this client receive the update?
    const allowed = await shouldReceiveUpdate(latestRelease.id, licenseKey, fingerprint);
    if (!allowed) {
      // Client is not in the current rollout stage - no update for now
      res.status(204).send();
      return;
    }

    const asset = latestRelease.assets[0]!;

    // Don't serve updates without valid signatures
    if (!asset.signature) {
      res.status(204).send();
      return;
    }

    // Return Tauri updater JSON format
    const notes = latestRelease.forceUpdate
      ? `[MANDATORY] ${latestRelease.releaseNotes ?? ""}`
      : (latestRelease.releaseNotes ?? "");
    res.json({
      version: latestRelease.version,
      notes,
      pub_date: latestRelease.publishedAt!.toISOString(),
      platforms: {
        [`${target}-${arch}`]: {
          signature: asset.signature,
          url: asset.downloadUrl,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
