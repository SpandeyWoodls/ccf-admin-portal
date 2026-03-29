import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { sendEmail } from "../services/email.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const trialRequestSchema = z.object({
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  organization: z.string().min(1).max(255),
  organization_type: z.string().min(1).max(50),
  designation: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  purpose: z.string().min(1),
  expected_volume: z.string().optional().nullable(),
  hardware_fingerprint: z.string().min(1),
  machine_name: z.string().min(1),
  os_info: z.string().min(1),
  app_version: z.string().min(1),
});

// ─── POST /trial-request ────────────────────────────────────────────────────

router.post("/trial-request", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = trialRequestSchema.parse(req.body);

    // Check if there's already a pending or approved request for this fingerprint
    const existing = await prisma.trialRequest.findFirst({
      where: {
        hardwareFingerprint: body.hardware_fingerprint,
        status: { in: ["pending", "approved"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      if (existing.status === "pending") {
        res.json(
          desktopResponse(true, {
            request_id: existing.id,
            status: "pending",
            message: "A trial request is already pending for this machine",
          }, null, "Trial request already submitted"),
        );
        return;
      }

      if (existing.status === "approved" && existing.approvedLicenseKey) {
        res.json(
          desktopResponse(true, {
            request_id: existing.id,
            status: "approved",
            license_key: existing.approvedLicenseKey,
          }, null, "Trial already approved"),
        );
        return;
      }
    }

    const trialReq = await prisma.trialRequest.create({
      data: {
        fullName: body.full_name,
        email: body.email,
        phone: body.phone ?? null,
        organization: body.organization,
        organizationType: body.organization_type,
        designation: body.designation ?? null,
        department: body.department ?? null,
        purpose: body.purpose,
        expectedVolume: body.expected_volume ?? null,
        hardwareFingerprint: body.hardware_fingerprint,
        machineName: body.machine_name,
        osInfo: body.os_info,
        appVersion: body.app_version,
        status: "pending",
      },
    });

    // Fire-and-forget: notify admin about new trial request
    console.log(`[Email] New trial request from ${body.full_name} (${body.email}) - org: ${body.organization}. Admin notification would be sent.`);
    sendEmail(
      process.env.SMTP_FROM || "admin@cyberchakra.in",
      `New Trial Request: ${body.organization}`,
      `<p>New trial request received from <strong>${body.full_name}</strong> (${body.email}) at <strong>${body.organization}</strong> (${body.organization_type}).</p><p>Purpose: ${body.purpose}</p><p>Review it in the <a href="${process.env.PORTAL_URL || "https://admin.cyberchakra.in"}/trial-requests">Admin Portal</a>.</p>`,
    ).catch(() => {});

    res.status(201).json(
      desktopResponse(true, {
        request_id: trialReq.id,
        status: "pending",
      }, null, "Trial request submitted successfully. You will be notified once reviewed."),
    );
  } catch (err) {
    next(err);
  }
});

// ─── GET /trial-request-status ──────────────────────────────────────────────

router.get("/trial-request-status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprint = req.query.hardware_fingerprint as string;
    if (!fingerprint) {
      res.status(400).json(
        desktopResponse(false, null, "MISSING_PARAM", "hardware_fingerprint query parameter is required"),
      );
      return;
    }

    const latestRequest = await prisma.trialRequest.findFirst({
      where: { hardwareFingerprint: fingerprint },
      orderBy: { createdAt: "desc" },
    });

    if (!latestRequest) {
      res.status(404).json(
        desktopResponse(false, null, "NOT_FOUND", "No trial request found for this machine"),
      );
      return;
    }

    const data: Record<string, any> = {
      request_id: latestRequest.id,
      status: latestRequest.status,
      submitted_at: latestRequest.createdAt.toISOString(),
    };

    if (latestRequest.status === "approved" && latestRequest.approvedLicenseKey) {
      data.license_key = latestRequest.approvedLicenseKey;
      data.reviewed_at = latestRequest.reviewedAt?.toISOString() ?? null;
    }

    if (latestRequest.status === "rejected") {
      data.rejection_reason = latestRequest.rejectionReason ?? "Request did not meet trial criteria";
      data.reviewed_at = latestRequest.reviewedAt?.toISOString() ?? null;
    }

    res.json(desktopResponse(true, data, null, ""));
  } catch (err) {
    next(err);
  }
});

export default router;
