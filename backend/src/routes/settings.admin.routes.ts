import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("super_admin"));

// ─── GET / (list all settings as key-value map) ────────────────────────────

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.setting.findMany({ take: 200 });
    // Return as a flat object { key1: value1, key2: value2, ... }
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }

    // Parse known numeric/boolean keys for frontend convenience
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(map)) {
      if (key === "maintenanceMode") {
        data[key] = value === "true";
      } else if (
        key === "defaultLicenseDurationMonths" ||
        key === "defaultTrialDurationDays"
      ) {
        const n = Number(value);
        data[key] = isNaN(n) ? value : n;
      } else {
        data[key] = value;
      }
    }

    res.json({
      success: true,
      data,
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / (upsert settings) ─────────────────────────────────────────────
// Body: { settings: { key: string, value: string }[] }

router.patch("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = req.body as {
      settings?: { key: string; value: string }[];
    };

    if (!Array.isArray(settings) || settings.length === 0) {
      res.status(400).json({
        success: false,
        data: null,
        error: "INVALID_BODY",
        message: "Body must contain a non-empty 'settings' array of { key, value } pairs.",
      });
      return;
    }

    // Validate each entry
    for (const entry of settings) {
      if (
        typeof entry.key !== "string" ||
        !entry.key.trim() ||
        typeof entry.value !== "string"
      ) {
        res.status(400).json({
          success: false,
          data: null,
          error: "INVALID_ENTRY",
          message: `Each setting must have a non-empty string 'key' and a string 'value'. Invalid entry: ${JSON.stringify(entry)}`,
        });
        return;
      }
    }

    // Fetch old values for audit log
    const existingKeys = settings.map((s) => s.key);
    const existingRows = await prisma.setting.findMany({
      where: { key: { in: existingKeys } },
    });
    const oldMap: Record<string, string> = {};
    for (const row of existingRows) {
      oldMap[row.key] = row.value;
    }

    // Upsert each setting
    const results = await Promise.all(
      settings.map((s) =>
        prisma.setting.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value },
        }),
      ),
    );

    // Build new values map for audit
    const newMap: Record<string, string> = {};
    for (const s of settings) {
      newMap[s.key] = s.value;
    }

    // Audit log
    logAudit({
      adminUserId: req.admin?.id ?? null,
      action: "settings.update",
      resourceType: "setting",
      resourceId: null,
      oldValues: oldMap,
      newValues: newMap,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });

    // Return the updated map
    const data: Record<string, unknown> = {};
    for (const row of results) {
      if (row.key === "maintenanceMode") {
        data[row.key] = row.value === "true";
      } else if (
        row.key === "defaultLicenseDurationMonths" ||
        row.key === "defaultTrialDurationDays"
      ) {
        const n = Number(row.value);
        data[row.key] = isNaN(n) ? row.value : n;
      } else {
        data[row.key] = row.value;
      }
    }

    res.json({
      success: true,
      data,
      error: null,
      message: "Settings updated successfully.",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
