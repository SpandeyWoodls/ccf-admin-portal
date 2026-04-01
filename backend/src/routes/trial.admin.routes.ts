import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { addMonths } from "date-fns";
import { sendEmail } from "../services/email.js";
import { trialApprovedEmail, trialRejectedEmail } from "../services/email-templates.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const approveTrialSchema = z.object({
  tier: z.enum(["individual", "team", "enterprise", "government"]),
  months: z.number().int().min(1).max(12).optional(),
  days: z.number().int().min(1).max(1825).optional(),
});

const rejectTrialSchema = z.object({
  reason: z.string().min(1),
});

// ─── GET / (list trial requests) ────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination({ ...req.query, pageSize: req.query.limit } as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validStatuses = ["pending", "approved", "rejected"];
    if (req.query.status && validStatuses.includes(req.query.status as string)) {
      where.status = req.query.status as string;
    }

    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 200) : undefined;
    if (search) {
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
      const validUntil = body.days
        ? new Date(validFrom.getTime() + body.days * 24 * 60 * 60 * 1000)
        : addMonths(validFrom, body.months ?? 1);

      // Create license and update trial atomically to prevent orphaned records
      const { license, updated } = await prisma.$transaction(async (tx: any) => {
        // Find or create organization from trial request data
        let orgId: string | null = null;
        if (trial.organization) {
          const existingOrg = await tx.organization.findFirst({
            where: { name: { equals: trial.organization } },
          });
          if (existingOrg) {
            orgId = existingOrg.id;
          } else {
            const slug = trial.organization.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const newOrg = await tx.organization.create({
              data: {
                name: trial.organization,
                slug: slug || 'trial-org-' + Date.now(),
                orgType: trial.organizationType || 'individual',
                email: trial.email,
                isActive: true,
              },
            });
            orgId = newOrg.id;
          }
        }

        const license = await tx.license.create({
          data: {
            licenseKey,
            licenseType: "trial",
            tier: body.tier,
            status: "issued",
            maxActivations: 1,
            validFrom,
            validUntil,
            issuedById: req.admin!.id,
            organizationId: orgId,
            notes: `Trial license for ${trial.fullName} (${trial.organization}). Request ID: ${trial.id}`,
          },
        });

        const updated = await tx.trialRequest.update({
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

        return { license, updated };
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

      // Send trial approval email
      if (trial.email) {
        const { subject, html } = trialApprovedEmail(trial.fullName, licenseKey, validUntil.toISOString());
        sendEmail(trial.email, subject, html).catch(err => {
          console.error(`[Email] Failed to send to ${trial.email}:`, err.message);
        });
      }

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

      // Send trial rejection email
      if (trial.email) {
        const { subject, html } = trialRejectedEmail(trial.fullName, body.reason);
        sendEmail(trial.email, subject, html).catch(err => {
          console.error(`[Email] Failed to send to ${trial.email}:`, err.message);
        });
      }

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
