import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { uuidToNumericId } from "../lib/validation-token.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendEmail } from "../services/email.js";
import { ticketReplyEmail } from "../services/email-templates.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().optional(),
  subject: z.string().min(1).max(512),
  message: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.enum(["bug", "feature", "question", "other", "technical", "billing", "license"]).default("other"),
  priority: z.enum(["low", "medium", "high", "critical", "urgent"]).default("medium"),
  sender_name: z.string().min(1).max(255).optional(),
  sender_email: z.string().email().optional(),
  app_version: z.string().optional(),
  system_info: z.string().optional(),
});

const ticketStatusSchema = z.object({
  license_key: z.string().min(1),
  hardware_fingerprint: z.string().optional(),
  ticket_number: z.string().optional(),
});

const ticketDetailsSchema = z.object({
  ticket_number: z.string().min(1),
  license_key: z.string().min(1),
});

const replyTicketSchema = z.object({
  ticket_number: z.string().min(1),
  license_key: z.string().min(1),
  message: z.string().min(1),
  sender_name: z.string().min(1).max(255),
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
    const category = (body.category === "technical" || body.category === "billing" || body.category === "license") ? "other" : body.category;

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
          select: {
            id: true,
            message: true,
            senderType: true,
            senderName: true,
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
      },
    });

    // If ticket was in "waiting" or "resolved", re-open it
    if (ticket.status === "waiting" || ticket.status === "resolved") {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "open" },
      });
    }

    // Fire-and-forget: notify admin about new user reply on ticket
    const { subject: emailSubject, html: emailHtml } = ticketReplyEmail(
      ticket.ticketNumber,
      ticket.subject,
      body.message,
    );
    sendEmail(
      process.env.SMTP_FROM || "admin@cyberchakra.in",
      emailSubject,
      emailHtml,
    ).catch(err => {
      console.error(`[Email] Failed to send to ${process.env.SMTP_FROM || "admin@cyberchakra.in"}:`, err.message);
    });

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

export default router;
