import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { desktopResponse } from "../lib/response.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendEmail } from "../services/email.js";
import { ticketReplyEmail } from "../services/email-templates.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  license_key: z.string().min(1),
  subject: z.string().min(1).max(512),
  message: z.string().min(1),
  category: z.enum(["bug", "feature", "question", "other"]).default("other"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  sender_name: z.string().min(1).max(255),
  sender_email: z.string().email().optional(),
});

const ticketStatusSchema = z.object({
  ticket_number: z.string().min(1),
  license_key: z.string().min(1),
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

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        licenseKey: body.license_key,
        organizationId: license.organizationId,
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        status: "open",
        messages: {
          create: {
            message: body.message,
            senderType: "user",
            senderName: body.sender_name,
          },
        },
      },
    });

    res.status(201).json(
      desktopResponse(true, {
        ticket_number: ticket.ticketNumber,
        status: ticket.status,
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

    const ticket = await prisma.supportTicket.findUnique({
      where: { ticketNumber: body.ticket_number },
    });

    if (!ticket || ticket.licenseKey !== body.license_key) {
      res.status(404).json(
        desktopResponse(false, null, "TICKET_NOT_FOUND", "Ticket not found or license key mismatch"),
      );
      return;
    }

    const portalBaseUrl = process.env.PORTAL_URL || "https://admin.cyberchakra.in";

    res.json(
      desktopResponse(true, {
        ticket_number: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        created_at: ticket.createdAt.toISOString(),
        updated_at: ticket.updatedAt.toISOString(),
        closed_at: ticket.closedAt?.toISOString() ?? null,
        portal_url: `${portalBaseUrl}/support/tickets/${ticket.ticketNumber}`,
      }, null, ""),
    );
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
    ).catch(() => {});

    const updatedStatus = ticket.status === "waiting" || ticket.status === "resolved" ? "open" : ticket.status;

    res.json(
      desktopResponse(true, {
        message_id: message.id,
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
