import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { paginated } from "../lib/response.js";
import { addMonths } from "date-fns";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const approveTrialSchema = z.object({
  tier: z.enum(["individual", "team", "enterprise", "government"]),
  months: z.number().int().min(1).max(12),
});

const rejectTrialSchema = z.object({
  reason: z.string().min(1),
});

// ─── GET / (list trial requests) ────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.search) {
      const search = req.query.search as string;
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { organization: { contains: search } },
        { hardwareFingerprint: { contains: search } },
      ];
    }

    const [trials, total] = await Promise.all([
      prisma.trialRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.trialRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(trials, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id (trial request detail) ────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trial = await prisma.trialRequest.findUnique({
      where: { id: req.params.id as string },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!trial) {
      throw new AppError(404, "Trial request not found", "NOT_FOUND");
    }

    res.json({ success: true, data: trial, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/approve (approve trial request) ─────────────────────────────

router.post(
  "/:id/approve",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = approveTrialSchema.parse(req.body);

      const trial = await prisma.trialRequest.findUnique({
        where: { id: req.params.id as string },
      });

      if (!trial) {
        throw new AppError(404, "Trial request not found", "NOT_FOUND");
      }

      if (trial.status !== "pending") {
        throw new AppError(400, `Trial request is already ${trial.status}`, "INVALID_STATUS");
      }

      // Generate a trial license key
      const licenseKey = generateLicenseKey();
      const validFrom = new Date();
      const validUntil = addMonths(validFrom, body.months);

      // Create the license record
      const license = await prisma.license.create({
        data: {
          licenseKey,
          licenseType: "trial",
          tier: body.tier,
          status: "issued",
          maxActivations: 1,
          validFrom,
          validUntil,
          issuedById: req.admin!.id,
          notes: `Trial license for ${trial.fullName} (${trial.organization}). Request ID: ${trial.id}`,
        },
      });

      // Update the trial request
      const updated = await prisma.trialRequest.update({
        where: { id: req.params.id as string },
        data: {
          status: "approved",
          approvedLicenseKey: licenseKey,
          reviewedAt: new Date(),
          reviewedById: req.admin!.id,
        },
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "approve_trial",
        resourceType: "trial_request",
        resourceId: trial.id,
        oldValues: { status: "pending" },
        newValues: {
          status: "approved",
          licenseKey,
          licenseId: license.id,
          tier: body.tier,
          months: body.months,
          validUntil: validUntil.toISOString(),
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: { trial: updated, licenseKey },
        error: null,
        message: "Trial request approved and license generated",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/reject (reject trial request) ───────────────────────────────

router.post(
  "/:id/reject",
  requireRole("admin", "super_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = rejectTrialSchema.parse(req.body);

      const trial = await prisma.trialRequest.findUnique({
        where: { id: req.params.id as string },
      });

      if (!trial) {
        throw new AppError(404, "Trial request not found", "NOT_FOUND");
      }

      if (trial.status !== "pending") {
        throw new AppError(400, `Trial request is already ${trial.status}`, "INVALID_STATUS");
      }

      const updated = await prisma.trialRequest.update({
        where: { id: req.params.id as string },
        data: {
          status: "rejected",
          rejectionReason: body.reason,
          reviewedAt: new Date(),
          reviewedById: req.admin!.id,
        },
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "reject_trial",
        resourceType: "trial_request",
        resourceId: trial.id,
        oldValues: { status: "pending" },
        newValues: { status: "rejected", rejectionReason: body.reason },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Trial request rejected",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
