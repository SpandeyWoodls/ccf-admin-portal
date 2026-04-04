import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { uuidToNumericId } from "../lib/validation-token.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendEmail } from "../services/email.js";
import { ticketReplyEmail, ticketConfirmationEmail } from "../services/email-templates.js";
import { logAudit } from "../lib/audit.js";
import { ticketUpload, TICKET_UPLOADS_URL_PREFIX } from "../lib/upload.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  license_key: z.string().min(1).max(50),
  hardware_fingerprint: z.string().max(512).optional(),
  subject: z.string().min(1).max(512),
  message: z.string().min(1).max(10_000).optional(),
  description: z.string().min(1).max(10_000).optional(),
  category: z.enum(["bug", "feature", "question", "other", "technical", "billing", "license", "general"]).default("other"),
  priority: z.enum(["low", "medium", "high", "critical", "urgent"]).default("medium"),
  sender_name: z.string().min(1).max(255).optional(),
  sender_email: z.string().email().max(320).optional(),
  app_version: z.string().max(30).optional(),
  system_info: z.string().max(2000).optional(),
});

const ticketStatusSchema = z.object({
  license_key: z.string().min(1).max(50),
  hardware_fingerprint: z.string().max(512).optional(),
  ticket_number: z.string().max(50).optional(),
});

const ticketDetailsSchema = z.object({
  ticket_number: z.string().min(1).max(50),
  license_key: z.string().min(1).max(50),
});

const attachmentSchema = z.object({
  url: z.string(),
  filename: z.string(),
  size: z.number(),
  mimeType: z.string(),
});

const replyTicketSchema = z.object({
  ticket_number: z.string().min(1).max(50),
  license_key: z.string().min(1).max(50),
  message: z.string().min(1).max(10_000),
  sender_name: z.string().min(1).max(255).optional().default("User"),
  hardware_fingerprint: z.string().max(512).optional(),
  attachments: z.array(attachmentSchema).optional().default([]),
});

// ─── Helper: generate ticket number ────────────────────────────────────────

function generateTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CCF-${timestamp}-${random}`;
}

// ─── POST /create-ticket ────────────────────────────────────────────────────

router.post("/create-ticket", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTicketSchema.parse(req.body);

    // Verify license exists
    const license = await prisma.license.findUnique({
      where: { licenseKey: body.license_key },
    });

    if (!license) {
      res.status(404).json(
        desktopResponse(false, null, "LICENSE_NOT_FOUND", "License key not found"),
      );
      return;
    }

    const ticketNumber = generateTicketNumber();
    const messageText = body.message || body.description || body.subject;
    const senderName = body.sender_name || "User";
    const priority = body.priority === "urgent" ? "critical" : body.priority;
    const category = (body.category === "technical" || body.category === "billing" || body.category === "license" || body.category === "general") ? "other" : body.category;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        licenseKey: body.license_key,
        organizationId: license.organizationId,
        subject: body.subject,
        category: category as any,
        priority: priority as any,
        status: "open",
        messages: {
          create: {
            message: messageText,
            senderType: "user",
            senderName: senderName,
          },
        },
      },
    });

    // Fire-and-forget: send confirmation email to user if email is available
    const userEmail = body.sender_email;
    if (userEmail) {
      const { subject: confirmSubject, html: confirmHtml } = ticketConfirmationEmail(
        ticket.ticketNumber,
        body.subject,
      );
      sendEmail(userEmail, confirmSubject, confirmHtml).catch(err =>
        console.error("[Email] Ticket confirmation failed:", err.message),
      );
    }

    res.status(201).json(
      desktopResponse(true, {
        ticket_number: ticket.ticketNumber,
        ticket_id: uuidToNumericId(ticket.id),
        status: ticket.status,
        portal_url: `${process.env.PORTAL_URL || "https://cyberchakra.online"}/support`,
        created_at: ticket.createdAt.toISOString(),
      }, null, "Support ticket created successfully"),
    );
  } catch (err) {
    next(err);
  }
});

// ─── POST /ticket-status ───────────────────────────────────────────────────

router.post("/ticket-status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ticketStatusSchema.parse(req.body);
    const portalBaseUrl = process.env.PORTAL_URL || "https://cyberchakra.online";

    // If ticket_number provided, return that specific ticket
    if (body.ticket_number) {
      const ticket = await prisma.supportTicket.findUnique({
        where: { ticketNumber: body.ticket_number },
      });

      if (!ticket || ticket.licenseKey !== body.license_key) {
        res.status(404).json(
          desktopResponse(false, null, "TICKET_NOT_FOUND", "Ticket not found"),
        );
        return;
      }

      res.json(desktopResponse(true, {
        open_tickets: 1,
        unread_replies: 0,
        tickets: [{
          ticket_number: ticket.ticketNumber,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          has_new_reply: false,
          last_updated: ticket.updatedAt.toISOString(),
          portal_url: `${portalBaseUrl}/support`,
        }],
        portal_url: `${portalBaseUrl}/support`,
      }, null, ""));
      return;
    }

    // Otherwise list all tickets for this license
    const tickets = await prisma.supportTicket.findMany({
      where: { licenseKey: body.license_key },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const openCount = tickets.filter(t => t.status === "open" || t.status === "in_progress").length;

    res.json(desktopResponse(true, {
      open_tickets: openCount,
      unread_replies: 0,
      tickets: tickets.map(t => ({
        ticket_number: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category,
        has_new_reply: false,
        last_updated: t.updatedAt.toISOString(),
        portal_url: `${portalBaseUrl}/support`,
      })),
      portal_url: `${portalBaseUrl}/support`,
    }, null, ""));
  } catch (err) {
    next(err);
  }
});

// ─── POST /ticket-details ──────────────────────────────────────────────────

router.post("/ticket-details", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = ticketDetailsSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { ticketNumber: body.ticket_number },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            message: true,
            senderType: true,
            senderName: true,
            attachments: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket || ticket.licenseKey !== body.license_key) {
      res.status(404).json(
        desktopResponse(false, null, "TICKET_NOT_FOUND", "Ticket not found or license key mismatch"),
      );
      return;
    }

    const canReply = ticket.status !== "closed";

    res.json(
      desktopResponse(true, {
        ticket_number: ticket.ticketNumber,
        ticket_id: uuidToNumericId(ticket.id),
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        created_at: ticket.createdAt.toISOString(),
        updated_at: ticket.updatedAt.toISOString(),
        closed_at: ticket.closedAt?.toISOString() ?? null,
        can_reply: canReply,
        messages: ticket.messages.map((m: any, index: number) => ({
          id: m.id,
          message: m.message,
          sender_type: m.senderType,
          sender_name: m.senderName,
          attachments: m.attachments ?? [],
          created_at: m.createdAt.toISOString(),
          can_reply: canReply,
          is_initial: index === 0,
        })),
      }, null, ""),
    );
  } catch (err) {
    next(err);
  }
});

// ─── POST /reply-ticket ────────────────────────────────────────────────────

router.post("/reply-ticket", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = replyTicketSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { ticketNumber: body.ticket_number },
    });

    if (!ticket || ticket.licenseKey !== body.license_key) {
      res.status(404).json(
        desktopResponse(false, null, "TICKET_NOT_FOUND", "Ticket not found or license key mismatch"),
      );
      return;
    }

    if (ticket.status === "closed") {
      res.status(400).json(
        desktopResponse(false, null, "TICKET_CLOSED", "This ticket is closed and cannot receive new replies"),
      );
      return;
    }

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        message: body.message,
        senderType: "user",
        senderName: body.sender_name,
        attachments: body.attachments.length > 0 ? body.attachments : undefined,
      },
    });

    // Always update the ticket's updatedAt so it bubbles up in the admin list.
    // If ticket was in "waiting" or "resolved", also re-open it.
    const ticketUpdateData: any = { updatedAt: new Date() };
    if (ticket.status === "waiting" || ticket.status === "resolved") {
      ticketUpdateData.status = "open";
    }
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: ticketUpdateData,
    });

    // Fire-and-forget: notify admin about new user reply on ticket
    // If ticket is assigned, email that admin; otherwise fall back to ADMIN_EMAIL
    (async () => {
      try {
        let adminEmail: string | null = null;
        if (ticket.assignedToId) {
          const assignedAdmin = await prisma.adminUser.findUnique({
            where: { id: ticket.assignedToId },
            select: { email: true },
          });
          adminEmail = assignedAdmin?.email ?? null;
        }
        adminEmail = adminEmail || process.env.ADMIN_EMAIL || "ceo@cyberchakra.in";

        const { subject: emailSubject, html: emailHtml } = ticketReplyEmail(
          ticket.ticketNumber,
          ticket.subject,
          body.message,
        );
        await sendEmail(adminEmail, emailSubject, emailHtml);
      } catch (err: any) {
        console.error("[Email] Admin ticket reply notification failed:", err.message);
      }
    })();

    await logAudit({
      action: "ticket_reply_received",
      resourceType: "SupportTicket",
      resourceId: ticket.id,
      newValues: { ticketNumber: ticket.ticketNumber, messageLength: body.message.length },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    const updatedStatus = ticket.status === "waiting" || ticket.status === "resolved" ? "open" : ticket.status;

    res.json(
      desktopResponse(true, {
        reply_id: message.id,
        ticket_number: ticket.ticketNumber,
        status: updatedStatus,
        ticket_status: updatedStatus,
      }, null, "Reply sent successfully"),
    );
  } catch (err) {
    next(err);
  }
});

// ─── POST /upload-attachment ────────────────────────────────────────────────

router.post(
  "/upload-attachment",
  ticketUpload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json(
          desktopResponse(false, null, "NO_FILE", "No file provided"),
        );
        return;
      }

      const file = req.file;
      const url = `${TICKET_UPLOADS_URL_PREFIX}/${file.filename}`;

      res.json(
        desktopResponse(true, {
          url,
          filename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        }, null, "File uploaded successfully"),
      );
    } catch (err: any) {
      // Multer errors (file too large, wrong type, etc.)
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json(
          desktopResponse(false, null, "FILE_TOO_LARGE", "File exceeds 10MB limit"),
        );
        return;
      }
      if (err.message?.startsWith("File type not allowed") || err.message?.startsWith("MIME type not allowed")) {
        res.status(400).json(
          desktopResponse(false, null, "INVALID_FILE_TYPE", err.message),
        );
        return;
      }
      next(err);
    }
  },
);

export default router;
