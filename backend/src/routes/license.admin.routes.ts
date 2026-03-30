import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit, logLicenseEvent } from "../lib/audit.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { addDays, addMonths, addYears } from "date-fns";
import { sendEmail } from "../services/email.js";
import { licenseRevokedEmail } from "../services/email-templates.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const createLicenseSchema = z.object({
  licenseType: z.enum(["trial", "perpetual", "time_limited", "organization"]),
  tier: z.enum(["individual", "team", "enterprise", "government"]),
  organizationId: z.string().uuid().optional().nullable(),
  maxActivations: z.number().int().min(1).default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  featureFlags: z.record(z.unknown()).optional().default({}),
  notes: z.string().optional().nullable(),
  purchaseOrderNumber: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  amountInr: z.number().optional().nullable(),
});

const updateLicenseSchema = z.object({
  tier: z.enum(["individual", "team", "enterprise", "government"]).optional(),
  organizationId: z.string().uuid().optional().nullable(),
  maxActivations: z.number().int().min(1).optional(),
  validUntil: z.string().datetime().optional().nullable(),
  featureFlags: z.record(z.unknown()).optional(),
  notes: z.string().optional().nullable(),
  purchaseOrderNumber: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  amountInr: z.number().optional().nullable(),
});

const renewSchema = z.object({
  duration: z.enum(["30d", "90d", "180d", "1y", "2y", "3y"]),
  notes: z.string().optional(),
});

// ─── GET / (list licenses) ──────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/licenses:
 *   get:
 *     tags: [Licenses (Admin)]
 *     summary: List licenses
 *     description: Paginated list of all licenses with optional filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [issued, active, suspended, revoked, expired]
 *       - in: query
 *         name: licenseType
 *         schema:
 *           type: string
 *           enum: [trial, perpetual, time_limited, organization]
 *       - in: query
 *         name: tier
 *         schema:
 *           type: string
 *           enum: [individual, team, enterprise, government]
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by license key, notes, PO number, or invoice number
 *     responses:
 *       200:
 *         description: Paginated license list
 *       401:
 *         description: Not authenticated
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validStatuses = ["issued", "active", "suspended", "revoked", "expired"];
    if (req.query.status && validStatuses.includes(req.query.status as string)) {
      where.status = req.query.status as string;
    }

    const validLicenseTypes = ["trial", "perpetual", "time_limited", "organization"];
    if (req.query.licenseType && validLicenseTypes.includes(req.query.licenseType as string)) {
      where.licenseType = req.query.licenseType as string;
    }

    const validTiers = ["individual", "team", "enterprise", "government"];
    if (req.query.tier && validTiers.includes(req.query.tier as string)) {
      where.tier = req.query.tier as string;
    }

    if (req.query.organizationId) where.organizationId = req.query.organizationId;

    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 200) : undefined;
    if (search) {
      where.OR = [
        { licenseKey: { contains: search } },
        { notes: { contains: search } },
        { purchaseOrderNumber: { contains: search } },
        { invoiceNumber: { contains: search } },
      ];
    }

    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          issuedBy: { select: { id: true, name: true, email: true } },
          _count: { select: { activations: { where: { isActive: true } } } },
        },
      }),
      prisma.license.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(licenses, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id (license detail) ──────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/licenses/{id}:
 *   get:
 *     tags: [Licenses (Admin)]
 *     summary: Get license detail
 *     description: Returns full license details including activations and recent events.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: License detail with activations and events
 *       404:
 *         description: License not found
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const license = await prisma.license.findUnique({
      where: { id: req.params.id as string },
      include: {
        organization: true,
        issuedBy: { select: { id: true, name: true, email: true } },
        activations: {
          orderBy: { activatedAt: "desc" },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!license) {
      throw new AppError(404, "License not found", "NOT_FOUND");
    }

    res.json({ success: true, data: license, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST / (create license) ────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/licenses:
 *   post:
 *     tags: [Licenses (Admin)]
 *     summary: Create a new license
 *     description: Issue a new license key. Requires admin or super_admin role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [licenseType, tier]
 *             properties:
 *               licenseType:
 *                 type: string
 *                 enum: [trial, perpetual, time_limited, organization]
 *               tier:
 *                 type: string
 *                 enum: [individual, team, enterprise, government]
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               maxActivations:
 *                 type: integer
 *                 default: 1
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               featureFlags:
 *                 type: object
 *               notes:
 *                 type: string
 *                 nullable: true
 *               purchaseOrderNumber:
 *                 type: string
 *                 nullable: true
 *               invoiceNumber:
 *                 type: string
 *                 nullable: true
 *               amountInr:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       201:
 *         description: License created successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient role
 */
router.post(
  "/",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createLicenseSchema.parse(req.body);

      const licenseKey = generateLicenseKey();
      const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();

      let validUntil: Date | null = null;
      if (body.validUntil) {
        validUntil = new Date(body.validUntil);
      } else if (body.licenseType === "trial") {
        validUntil = addDays(validFrom, 30);
      } else if (body.licenseType === "time_limited") {
        validUntil = addYears(validFrom, 1);
      }

      const license = await prisma.license.create({
        data: {
          licenseKey,
          licenseType: body.licenseType,
          tier: body.tier,
          organizationId: body.organizationId ?? null,
          status: "issued",
          maxActivations: body.maxActivations,
          validFrom,
          validUntil,
          featureFlags: body.featureFlags as any,
          issuedById: req.admin!.id,
          notes: body.notes ?? null,
          purchaseOrderNumber: body.purchaseOrderNumber ?? null,
          invoiceNumber: body.invoiceNumber ?? null,
          amountInr: body.amountInr ?? null,
        },
        include: {
          organization: { select: { id: true, name: true } },
        },
      });

      await logLicenseEvent({
        licenseId: license.id,
        organizationId: license.organizationId,
        action: "license_created",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        newValues: {
          license_key: licenseKey,
          license_type: body.licenseType,
          tier: body.tier,
          max_activations: body.maxActivations,
          valid_from: validFrom.toISOString(),
          valid_until: validUntil?.toISOString() ?? null,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "create_license",
        resourceType: "license",
        resourceId: license.id,
        newValues: { licenseKey, licenseType: body.licenseType, tier: body.tier },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.status(201).json({ success: true, data: license, error: null, message: "License created" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id (update license) ────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/admin/licenses/{id}:
 *   patch:
 *     tags: [Licenses (Admin)]
 *     summary: Update a license
 *     description: Update license fields such as tier, max activations, expiry, or notes. Requires admin or super_admin role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [individual, team, enterprise, government]
 *               maxActivations:
 *                 type: integer
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               featureFlags:
 *                 type: object
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: License updated
 *       404:
 *         description: License not found
 */
router.patch(
  "/:id",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateLicenseSchema.parse(req.body);

      const existing = await prisma.license.findUnique({ where: { id: req.params.id as string } });
      if (!existing) {
        throw new AppError(404, "License not found", "NOT_FOUND");
      }

      const updateData: any = {};
      if (body.tier !== undefined) updateData.tier = body.tier;
      if (body.organizationId !== undefined) updateData.organizationId = body.organizationId;
      if (body.maxActivations !== undefined) updateData.maxActivations = body.maxActivations;
      if (body.validUntil !== undefined) updateData.validUntil = body.validUntil ? new Date(body.validUntil) : null;
      if (body.featureFlags !== undefined) updateData.featureFlags = body.featureFlags;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.purchaseOrderNumber !== undefined) updateData.purchaseOrderNumber = body.purchaseOrderNumber;
      if (body.invoiceNumber !== undefined) updateData.invoiceNumber = body.invoiceNumber;
      if (body.amountInr !== undefined) updateData.amountInr = body.amountInr;

      const updated = await prisma.license.update({
        where: { id: req.params.id as string },
        data: updateData,
        include: { organization: { select: { id: true, name: true } } },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "update_license",
        resourceType: "license",
        resourceId: existing.id,
        oldValues: existing,
        newValues: updateData,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "License updated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/suspend ─────────────────────────────────────────────────────

router.post(
  "/:id/suspend",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.license.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "License not found", "NOT_FOUND");
      if (existing.status === "suspended") throw new AppError(400, "License is already suspended", "ALREADY_SUSPENDED");

      const updated = await prisma.license.update({
        where: { id: req.params.id as string },
        data: { status: "suspended" },
      });

      await logLicenseEvent({
        licenseId: existing.id,
        organizationId: existing.organizationId,
        action: "license_suspended",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        oldValues: { status: existing.status },
        newValues: { status: "suspended" },
        metadata: { reason: req.body.reason ?? null },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "license_suspended",
        resourceType: "License",
        resourceId: existing.id,
        oldValues: { status: "active" },
        newValues: { status: "suspended", reason: req.body.reason || "No reason provided" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "License suspended" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/reinstate ───────────────────────────────────────────────────

router.post(
  "/:id/reinstate",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.license.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "License not found", "NOT_FOUND");
      if (existing.status !== "suspended") throw new AppError(400, "License is not suspended", "NOT_SUSPENDED");

      const newStatus = existing.currentActivations > 0 ? "active" : "issued";
      const updated = await prisma.license.update({
        where: { id: req.params.id as string },
        data: { status: newStatus as any },
      });

      await logLicenseEvent({
        licenseId: existing.id,
        organizationId: existing.organizationId,
        action: "license_reinstated",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        oldValues: { status: "suspended" },
        newValues: { status: newStatus },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "reinstate_license",
        resourceType: "license",
        resourceId: existing.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: "License reinstated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/revoke ──────────────────────────────────────────────────────

router.post(
  "/:id/revoke",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.license.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "License not found", "NOT_FOUND");
      if (existing.status === "revoked") throw new AppError(400, "License is already revoked", "ALREADY_REVOKED");

      // Deactivate all activations
      await prisma.licenseActivation.updateMany({
        where: { licenseId: existing.id, isActive: true },
        data: { isActive: false, deactivatedAt: new Date() },
      });

      const updated = await prisma.license.update({
        where: { id: req.params.id as string },
        data: { status: "revoked", currentActivations: 0 },
      });

      await logLicenseEvent({
        licenseId: existing.id,
        organizationId: existing.organizationId,
        action: "license_revoked",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        oldValues: { status: existing.status },
        newValues: { status: "revoked" },
        metadata: { reason: req.body.reason ?? null },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "revoke_license",
        resourceType: "license",
        resourceId: existing.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      // Fire-and-forget: notify organization about license revocation
      if (existing.organizationId) {
        prisma.organization
          .findUnique({ where: { id: existing.organizationId }, select: { name: true, email: true } })
          .then((org) => {
            if (org?.email) {
              const { subject, html } = licenseRevokedEmail(
                org.name,
                existing.licenseKey,
                req.body.reason ?? null,
              );
              sendEmail(org.email, subject, html).catch(err => {
                console.error(`[Email] Failed to send to ${org.email}:`, err.message);
              });
            }
          })
          .catch(err => {
            console.error(`[Email] Failed to fetch org for revocation notification:`, err.message);
          });
      }

      res.json({ success: true, data: updated, error: null, message: "License revoked and all activations deactivated" });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/renew ───────────────────────────────────────────────────────

router.post(
  "/:id/renew",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = renewSchema.parse(req.body);
      const existing = await prisma.license.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new AppError(404, "License not found", "NOT_FOUND");

      // Calculate new valid_until from current valid_until or now
      const baseDate = existing.validUntil && existing.validUntil > new Date()
        ? existing.validUntil
        : new Date();

      let newValidUntil: Date;
      switch (body.duration) {
        case "30d":  newValidUntil = addDays(baseDate, 30); break;
        case "90d":  newValidUntil = addDays(baseDate, 90); break;
        case "180d": newValidUntil = addDays(baseDate, 180); break;
        case "1y":   newValidUntil = addYears(baseDate, 1); break;
        case "2y":   newValidUntil = addYears(baseDate, 2); break;
        case "3y":   newValidUntil = addYears(baseDate, 3); break;
      }

      // If license was expired, reactivate it
      const newStatus = existing.status === "expired"
        ? (existing.currentActivations > 0 ? "active" : "issued")
        : existing.status;

      const updated = await prisma.license.update({
        where: { id: req.params.id as string },
        data: {
          validUntil: newValidUntil,
          status: newStatus as any,
        },
      });

      await logLicenseEvent({
        licenseId: existing.id,
        organizationId: existing.organizationId,
        action: "license_renewed",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        oldValues: { valid_until: existing.validUntil?.toISOString(), status: existing.status },
        newValues: { valid_until: newValidUntil.toISOString(), status: newStatus, duration: body.duration },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "renew_license",
        resourceType: "license",
        resourceId: existing.id,
        oldValues: { validUntil: existing.validUntil },
        newValues: { validUntil: newValidUntil, duration: body.duration },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: updated, error: null, message: `License renewed for ${body.duration}` });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/activations ───────────────────────────────────────────────────

router.get("/:id/activations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const license = await prisma.license.findUnique({ where: { id: req.params.id as string } });
    if (!license) throw new AppError(404, "License not found", "NOT_FOUND");

    const activations = await prisma.licenseActivation.findMany({
      where: { licenseId: req.params.id as string },
      orderBy: { activatedAt: "desc" },
    });

    res.json({ success: true, data: activations, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id/activations/:activationId (force deactivate) ───────────────

router.delete(
  "/:id/activations/:activationId",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activation = await prisma.licenseActivation.findFirst({
        where: { id: req.params.activationId as string, licenseId: req.params.id as string },
      });

      if (!activation) throw new AppError(404, "Activation not found", "NOT_FOUND");
      if (!activation.isActive) throw new AppError(400, "Activation already deactivated", "ALREADY_DEACTIVATED");

      await prisma.licenseActivation.update({
        where: { id: activation.id },
        data: { isActive: false, deactivatedAt: new Date() },
      });

      // Decrement activation count
      await prisma.license.update({
        where: { id: req.params.id as string },
        data: { currentActivations: { decrement: 1 } },
      });

      await logLicenseEvent({
        licenseId: req.params.id as string,
        activationId: activation.id,
        action: "force_deactivated",
        actorType: "admin",
        actorId: req.admin!.id,
        actorEmail: req.admin!.email,
        actorIp: req.ip ?? null,
        metadata: {
          hardware_fingerprint: activation.hardwareFingerprint,
          machine_name: activation.machineName,
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "force_deactivate",
        resourceType: "license_activation",
        resourceId: activation.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({ success: true, data: null, error: null, message: "Activation force-deactivated" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
