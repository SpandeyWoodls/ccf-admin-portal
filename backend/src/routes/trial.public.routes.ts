import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { uuidToNumericId } from "../lib/validation-token.js";
import { sendEmail } from "../services/email.js";
import { trialApprovedEmail, trialSubmittedEmail } from "../services/email-templates.js";

const router = Router();

// ─── Org-type normalization (backward compat for older desktop apps) ────────

const orgTypeNormalizationMap: Record<string, string> = {
  private: "private_lab",       // desktop app < 2.x sent "private", now sends "private_lab"
  government: "government",
  law_enforcement: "law_enforcement",
  corporate: "corporate",
  academic: "academic",
  private_lab: "private_lab",
  individual: "individual",
};

function normalizeOrgType(raw: string): string {
  return orgTypeNormalizationMap[raw] ?? raw;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const trialRequestSchema = z.object({
  full_name: z.string().min(1).max(255),
  email: z.string().email().max(320),
  phone: z.string().max(30).optional().nullable(),
  organization: z.string().min(1).max(255),
  organization_type: z.string().min(1).max(50).transform(normalizeOrgType),
  designation: z.string().max(255).optional().nullable(),
  department: z.string().max(255).optional().nullable(),
  purpose: z.string().min(1).max(2000),
  expected_volume: z.string().max(100).optional().nullable(),
  hardware_fingerprint: z.string().min(1).max(512),
  machine_name: z.string().min(1).max(255),
  os_info: z.string().min(1).max(512),
  app_version: z.string().min(1).max(30),
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
            request_id: uuidToNumericId(existing.id),
            status: "pending",
            message: "A trial request is already pending for this machine",
            is_existing: true,
          }, null, "Trial request already submitted"),
        );
        return;
      }

      if (existing.status === "approved" && existing.approvedLicenseKey) {
        res.json(
          desktopResponse(true, {
            request_id: uuidToNumericId(existing.id),
            status: "approved",
            license_key: existing.approvedLicenseKey,
            is_existing: true,
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
    const adminEmail = process.env.ADMIN_EMAIL || "ceo@cyberchakra.in";
    console.log(`[Email] New trial request from ${body.full_name} (${body.email}) - org: ${body.organization}. Notifying ${adminEmail}.`);
    sendEmail(
      adminEmail,
      `New Trial Request: ${body.organization}`,
      `<p>New trial request received from <strong>${body.full_name}</strong> (${body.email}) at <strong>${body.organization}</strong> (${body.organization_type}).</p><p>Purpose: ${body.purpose}</p><p>Review it in the <a href="${process.env.PORTAL_URL || "https://cyberchakra.online"}/trial-requests">Admin Portal</a>.</p>`,
    ).catch(err => {
      console.error(`[Email] Failed to send admin notification to ${adminEmail}:`, err.message);
    });

    // Fire-and-forget: send submission confirmation to the user
    const { subject, html } = trialSubmittedEmail(body.full_name, body.organization, body.email);
    sendEmail(body.email, subject, html).catch(err => {
      console.error(`[Email] Failed to send submission confirmation to ${body.email}:`, err.message);
    });

    res.status(201).json(
      desktopResponse(true, {
        request_id: uuidToNumericId(trialReq.id),
        status: "pending",
        is_existing: false,
      }, null, "Trial request submitted successfully. You will be notified once reviewed."),
    );
  } catch (err) {
    next(err);
  }
});

// ─── GET /trial-request-status ──────────────────────────────────────────────

router.get("/trial-request-status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fingerprint = typeof req.query.hardware_fingerprint === "string"
      ? req.query.hardware_fingerprint.slice(0, 512)
      : "";
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
      request_id: uuidToNumericId(latestRequest.id),
      status: latestRequest.status,
      submitted_at: latestRequest.createdAt.toISOString(),
    };

    if (latestRequest.status === "approved" && latestRequest.approvedLicenseKey) {
      data.license_key = latestRequest.approvedLicenseKey;
      data.reviewed_at = latestRequest.reviewedAt?.toISOString() ?? null;
      data.trial_days = 30;
      data.expires_at = new Date(
        (latestRequest.reviewedAt ?? latestRequest.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
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

// ─── POST /trial-request-resend ─────────────────────────────────────────────

const resendSchema = z.object({
  hardware_fingerprint: z.string().min(1).max(512),
});

router.post("/trial-request-resend", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = resendSchema.parse(req.body);

    const trial = await prisma.trialRequest.findFirst({
      where: {
        hardwareFingerprint: body.hardware_fingerprint,
        status: "approved",
        approvedLicenseKey: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!trial || !trial.approvedLicenseKey) {
      res.status(404).json(desktopResponse(false, null, "NOT_FOUND", "No approved trial found for this machine"));
      return;
    }

    const validUntil = new Date(
      (trial.reviewedAt ?? trial.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { subject, html } = trialApprovedEmail(trial.fullName, trial.approvedLicenseKey, validUntil);
    await sendEmail(trial.email, subject, html);

    res.json(desktopResponse(true, { resent: true }, null, "License key resent to " + trial.email));
  } catch (err) {
    next(err);
  }
});

export default router;
