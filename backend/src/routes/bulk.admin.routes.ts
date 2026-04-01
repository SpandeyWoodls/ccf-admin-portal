import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit, logLicenseEvent } from "../lib/audit.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { addDays, addMonths, addYears } from "date-fns";

const router = Router();

// All routes require authentication + admin role
router.use(requireAuth);
router.use(requireRole("admin", "super_admin"));

// ─── Schemas ────────────────────────────────────────────────────────────────

const bulkGenerateSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
  licenseType: z.enum(["trial", "perpetual", "time_limited", "organization"]),
  tier: z.enum(["individual", "team", "enterprise", "government"]),
  quantity: z.number().int().min(1, "Minimum quantity is 1").max(100, "Maximum quantity is 100"),
  validUntil: z.string().datetime().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const bulkExportSchema = z.object({
  status: z.enum(["issued", "active", "suspended", "revoked", "expired"]).optional(),
  tier: z.enum(["individual", "team", "enterprise", "government"]).optional(),
  organizationId: z.string().uuid().optional(),
  format: z.enum(["csv", "json"]).optional().default("csv"),
});

const bulkRevokeSchema = z.object({
  licenseIds: z
    .array(z.string().uuid("Invalid license ID"))
    .min(1, "At least one license ID is required")
    .max(500, "Maximum 500 licenses per operation"),
});

const bulkExtendSchema = z.object({
  licenseIds: z
    .array(z.string().uuid("Invalid license ID"))
    .min(1, "At least one license ID is required")
    .max(500, "Maximum 500 licenses per operation"),
  months: z.number().int().min(1, "Minimum 1 month").max(60, "Maximum 60 months"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Escape a value for CSV output. Wraps in double-quotes if the value
 * contains commas, double-quotes, or newlines. Internal double-quotes
 * are doubled per RFC 4180.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

// ─── POST /generate — Bulk generate licenses ───────────────────────────────

router.post("/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bulkGenerateSchema.parse(req.body);

    // Validate organization exists
    const org = await prisma.organization.findUnique({
      where: { id: body.organizationId },
      select: { id: true, name: true, isActive: true },
    });

    if (!org) {
      throw new AppError(404, "Organization not found", "NOT_FOUND");
    }
    if (!org.isActive) {
      throw new AppError(400, "Organization is inactive", "ORG_INACTIVE");
    }

    const validFrom = new Date();
    let validUntil: Date | null = null;
    if (body.validUntil) {
      validUntil = new Date(body.validUntil);
    } else if (body.licenseType === "trial") {
      validUntil = addDays(validFrom, 30);
    } else if (body.licenseType === "time_limited") {
      validUntil = addYears(validFrom, 1);
    }

    // Determine default max activations by tier
    const tierActivations: Record<string, number> = {
      individual: 1,
      team: 5,
      enterprise: 25,
      government: 50,
    };
    const maxActivations = tierActivations[body.tier] || 1;

    const results: { index: number; success: boolean; licenseId?: string; licenseKey?: string; error?: string }[] = [];
    const createdLicenses: { id: string; licenseKey: string }[] = [];

    for (let i = 0; i < body.quantity; i++) {
      try {
        const licenseKey = generateLicenseKey();

        const license = await prisma.license.create({
          data: {
            licenseKey,
            licenseType: body.licenseType,
            tier: body.tier,
            organizationId: body.organizationId,
            status: "issued",
            maxActivations,
            validFrom,
            validUntil,
            featureFlags: {},
            issuedById: req.admin!.id,
            notes: body.notes ?? null,
          },
        });

        createdLicenses.push({ id: license.id, licenseKey });
        results.push({ index: i, success: true, licenseId: license.id, licenseKey });

        // Fire-and-forget audit for each license
        logLicenseEvent({
          licenseId: license.id,
          organizationId: body.organizationId,
          action: "license_created",
          actorType: "admin",
          actorId: req.admin!.id,
          actorEmail: req.admin!.email,
          actorIp: req.ip ?? null,
          newValues: {
            license_key: licenseKey,
            license_type: body.licenseType,
            tier: body.tier,
            max_activations: maxActivations,
            valid_from: validFrom.toISOString(),
            valid_until: validUntil?.toISOString() ?? null,
            bulk_operation: true,
          },
        });
      } catch (err) {
        results.push({
          index: i,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Build CSV string for download
    const csvHeaders = ["license_key", "organization", "tier", "type", "status", "issued_date", "expiry_date"];
    const csvLines = [buildCsvRow(csvHeaders)];
    for (const lic of createdLicenses) {
      csvLines.push(
        buildCsvRow([
          lic.licenseKey,
          org.name,
          body.tier,
          body.licenseType,
          "issued",
          validFrom.toISOString(),
          validUntil?.toISOString() ?? "",
        ]),
      );
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Audit the bulk operation itself
    await logAudit({
      adminUserId: req.admin!.id,
      action: "bulk_generate_licenses",
      resourceType: "license",
      newValues: {
        organization_id: body.organizationId,
        organization_name: org.name,
        license_type: body.licenseType,
        tier: body.tier,
        quantity_requested: body.quantity,
        quantity_succeeded: succeeded,
        quantity_failed: failed,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        generated: succeeded,
        failed,
        licenses: createdLicenses,
        results,
        csv: csvLines.join("\n"),
      },
      error: null,
      message: `Bulk generation complete: ${succeeded} succeeded, ${failed} failed`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /export — Export licenses as CSV or JSON ──────────────────────────

router.post("/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bulkExportSchema.parse(req.body);

    const where: any = {};
    if (body.status) where.status = body.status;
    if (body.tier) where.tier = body.tier;
    if (body.organizationId) where.organizationId = body.organizationId;

    // Cap export to 10,000 rows to prevent DoS via unbounded queries
    const EXPORT_LIMIT = 10_000;
    const licenses = await prisma.license.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: EXPORT_LIMIT,
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { activations: { where: { isActive: true } } } },
      },
    });

    // Audit the export
    await logAudit({
      adminUserId: req.admin!.id,
      action: "bulk_export_licenses",
      resourceType: "license",
      newValues: {
        filters: { status: body.status, tier: body.tier, organizationId: body.organizationId },
        format: body.format,
        count: licenses.length,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (body.format === "json") {
      const jsonData = licenses.map((lic) => ({
        license_key: lic.licenseKey,
        organization: lic.organization?.name ?? "",
        tier: lic.tier,
        type: lic.licenseType,
        status: lic.status,
        issued_date: lic.createdAt.toISOString(),
        expiry_date: lic.validUntil?.toISOString() ?? "",
        activations: lic._count.activations,
        max_activations: lic.maxActivations,
        notes: lic.notes ?? "",
      }));

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="licenses-export-${Date.now()}.json"`);
      res.json({
        success: true,
        data: jsonData,
        error: null,
        message: `Exported ${licenses.length} licenses`,
      });
      return;
    }

    // CSV format
    const csvHeaders = [
      "license_key",
      "organization",
      "tier",
      "type",
      "status",
      "issued_date",
      "expiry_date",
      "activations",
      "max_activations",
      "last_heartbeat",
      "notes",
    ];

    const csvLines = [buildCsvRow(csvHeaders)];

    for (const lic of licenses) {
      csvLines.push(
        buildCsvRow([
          lic.licenseKey,
          lic.organization?.name ?? "",
          lic.tier,
          lic.licenseType,
          lic.status,
          lic.createdAt.toISOString(),
          lic.validUntil?.toISOString() ?? "",
          lic._count.activations,
          lic.maxActivations,
          "", // last_heartbeat — would require a join to activations, omitted for performance
          lic.notes ?? "",
        ]),
      );
    }

    const csvContent = csvLines.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="licenses-export-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

// ─── POST /revoke — Bulk revoke licenses ────────────────────────────────────

router.post("/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bulkRevokeSchema.parse(req.body);

    // Fetch all specified licenses
    const licenses = await prisma.license.findMany({
      where: { id: { in: body.licenseIds } },
      select: { id: true, licenseKey: true, status: true, organizationId: true },
    });

    const foundIds = new Set(licenses.map((l) => l.id));
    const results: { licenseId: string; success: boolean; error?: string }[] = [];

    // Report missing IDs
    for (const id of body.licenseIds) {
      if (!foundIds.has(id)) {
        results.push({ licenseId: id, success: false, error: "License not found" });
      }
    }

    for (const lic of licenses) {
      if (lic.status === "revoked") {
        results.push({ licenseId: lic.id, success: false, error: "Already revoked" });
        continue;
      }

      try {
        // Deactivate all activations for this license
        await prisma.licenseActivation.updateMany({
          where: { licenseId: lic.id, isActive: true },
          data: { isActive: false, deactivatedAt: new Date() },
        });

        // Revoke the license
        await prisma.license.update({
          where: { id: lic.id },
          data: { status: "revoked", currentActivations: 0 },
        });

        results.push({ licenseId: lic.id, success: true });

        // Fire-and-forget license event
        logLicenseEvent({
          licenseId: lic.id,
          organizationId: lic.organizationId,
          action: "license_revoked",
          actorType: "admin",
          actorId: req.admin!.id,
          actorEmail: req.admin!.email,
          actorIp: req.ip ?? null,
          oldValues: { status: lic.status },
          newValues: { status: "revoked" },
          metadata: { bulk_operation: true },
        });
      } catch (err) {
        results.push({
          licenseId: lic.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await logAudit({
      adminUserId: req.admin!.id,
      action: "bulk_revoke_licenses",
      resourceType: "license",
      newValues: {
        total_requested: body.licenseIds.length,
        revoked: succeeded,
        failed,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: {
        revoked: succeeded,
        failed,
        results,
      },
      error: null,
      message: `Bulk revoke complete: ${succeeded} revoked, ${failed} failed`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /extend — Bulk extend licenses ───────────────────────────────────

router.post("/extend", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bulkExtendSchema.parse(req.body);

    // Fetch all specified licenses
    const licenses = await prisma.license.findMany({
      where: { id: { in: body.licenseIds } },
      select: { id: true, licenseKey: true, status: true, validUntil: true, organizationId: true },
    });

    const foundIds = new Set(licenses.map((l) => l.id));
    const results: { licenseId: string; success: boolean; newValidUntil?: string; error?: string }[] = [];

    // Report missing IDs
    for (const id of body.licenseIds) {
      if (!foundIds.has(id)) {
        results.push({ licenseId: id, success: false, error: "License not found" });
      }
    }

    for (const lic of licenses) {
      if (lic.status === "revoked") {
        results.push({ licenseId: lic.id, success: false, error: "Cannot extend a revoked license" });
        continue;
      }

      try {
        // Extend from current validUntil (or now if null/expired)
        const baseDate =
          lic.validUntil && lic.validUntil > new Date()
            ? lic.validUntil
            : new Date();
        const newValidUntil = addMonths(baseDate, body.months);

        // If the license was expired, reinstate it
        const newStatus = lic.status === "expired" ? "issued" : lic.status;

        await prisma.license.update({
          where: { id: lic.id },
          data: {
            validUntil: newValidUntil,
            status: newStatus as any,
          },
        });

        results.push({
          licenseId: lic.id,
          success: true,
          newValidUntil: newValidUntil.toISOString(),
        });

        // Fire-and-forget license event
        logLicenseEvent({
          licenseId: lic.id,
          organizationId: lic.organizationId,
          action: "license_extended",
          actorType: "admin",
          actorId: req.admin!.id,
          actorEmail: req.admin!.email,
          actorIp: req.ip ?? null,
          oldValues: { valid_until: lic.validUntil?.toISOString() ?? null, status: lic.status },
          newValues: { valid_until: newValidUntil.toISOString(), status: newStatus, months: body.months },
          metadata: { bulk_operation: true },
        });
      } catch (err) {
        results.push({
          licenseId: lic.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await logAudit({
      adminUserId: req.admin!.id,
      action: "bulk_extend_licenses",
      resourceType: "license",
      newValues: {
        total_requested: body.licenseIds.length,
        months: body.months,
        extended: succeeded,
        failed,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: {
        extended: succeeded,
        failed,
        results,
      },
      error: null,
      message: `Bulk extend complete: ${succeeded} extended by ${body.months} month(s), ${failed} failed`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
