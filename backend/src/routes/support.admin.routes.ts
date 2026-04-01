import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { sendEmail } from "../services/email.js";
import { ticketReplyNotificationEmail } from "../services/email-templates.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const replySchema = z.object({
  message: z.string().min(1).max(10_000),
  isInternal: z.boolean().optional().default(false),
});

const updateTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  category: z.enum(["bug", "feature", "question", "other"]).optional(),
});

const assignSchema = z.object({
  adminId: z.string().uuid("Invalid admin ID format"),
});

const uuidSchema = z.string().uuid("Invalid UUID format");

// ─── GET / (list all tickets) ───────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination({ ...req.query, pageSize: req.query.limit } as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validStatuses = ["open", "in_progress", "waiting", "resolved", "closed"];
    if (req.query.status && validStatuses.includes(req.query.status as string)) {
      where.status = req.query.status as string;
    }

    const validPriorities = ["low", "medium", "high", "critical"];
    if (req.query.priority && validPriorities.includes(req.query.priority as string)) {
      where.priority = req.query.priority as string;
    }

    const validCategories = ["bug", "feature", "question", "other"];
    if (req.query.category && validCategories.includes(req.query.category as string)) {
      where.category = req.query.category as string;
    }

    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 200) : undefined;
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search } },
        { subject: { contains: search } },
        { licenseKey: { contains: search } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    // Reshape to include messageCount and lastMessageAt at top level
    const items = tickets.map((ticket: any) => {
      const { messages, _count, ...rest } = ticket;
      return {
        ...rest,
        messageCount: _count.messages,
        lastMessageAt: messages[0]?.createdAt ?? null,
      };
    });

    res.json({
      success: true,
      data: paginated(items, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id (ticket detail with messages) ─────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 500,
        },
      },
    });

    if (!ticket) {
      throw new AppError(404, "Ticket not found", "NOT_FOUND");
    }

    // Admin routes show ALL messages including internal notes
    res.json({ success: true, data: ticket, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/reply (admin reply to ticket) ───────────────────────────────

router.post(
  "/:id/reply",
  requireRole("admin", "super_admin", "support"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = replySchema.parse(req.body);

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id as string },
      });

      if (!ticket) {
        throw new AppError(404, "Ticket not found", "NOT_FOUND");
      }

      if (ticket.status === "closed") {
        throw new AppError(400, "Cannot reply to a closed ticket", "TICKET_CLOSED");
      }

      const message = await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          message: body.message,
          senderType: "support",
          senderName: req.admin!.name,
          isInternal: body.isInternal,
        },
      });

      // Update ticket's updatedAt (and set status to in_progress if currently open)
      const updateData: any = { updatedAt: new Date() };
      if (ticket.status === "open" && !body.isInternal) {
        updateData.status = "in_progress";
      }

      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: updateData,
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: body.isInternal ? "add_internal_note" : "reply_ticket",
        resourceType: "support_ticket",
        resourceId: ticket.id,
        newValues: {
          messageId: message.id,
          isInternal: body.isInternal,
        },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      // Fire-and-forget: notify the user about admin reply (skip for internal notes)
      if (!body.isInternal) {
        // Look for user email: check the first user message's senderName or find an activation email
        const userMessage = await prisma.ticketMessage.findFirst({
          where: { ticketId: ticket.id, senderType: "user" },
          orderBy: { createdAt: "asc" },
          select: { senderName: true },
        });

        // Try to find user's email from the license activation or support context
        const activation = ticket.licenseKey
          ? await prisma.licenseActivation.findFirst({
              where: { license: { licenseKey: ticket.licenseKey }, isActive: true, userEmail: { not: null } },
              select: { userEmail: true },
            })
          : null;

        const recipientEmail = activation?.userEmail;
        if (recipientEmail) {
          const { subject: replySubject, html: replyHtml } = ticketReplyNotificationEmail(
            ticket.ticketNumber,
            body.message,
          );
          sendEmail(recipientEmail, replySubject, replyHtml).catch(err =>
            console.error("[Email] Ticket reply notification failed:", err.message),
          );
        }
      }

      res.status(201).json({
        success: true,
        data: message,
        error: null,
        message: body.isInternal ? "Internal note added" : "Reply sent",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/close (close ticket) ────────────────────────────────────────

router.post(
  "/:id/close",
  requireRole("admin", "super_admin", "support"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id as string },
      });

      if (!ticket) {
        throw new AppError(404, "Ticket not found", "NOT_FOUND");
      }

      if (ticket.status === "closed") {
        throw new AppError(400, "Ticket is already closed", "ALREADY_CLOSED");
      }

      const oldStatus = ticket.status;
      const updated = await prisma.supportTicket.update({
        where: { id: req.params.id as string },
        data: {
          status: "closed",
          closedAt: new Date(),
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "close_ticket",
        resourceType: "support_ticket",
        resourceId: ticket.id,
        oldValues: { status: oldStatus },
        newValues: { status: "closed" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Ticket closed",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id (update ticket fields) ─────────────────────────────────────

router.patch(
  "/:id",
  requireRole("admin", "super_admin", "support"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateTicketSchema.parse(req.body);

      const existing = await prisma.supportTicket.findUnique({
        where: { id: req.params.id as string },
      });

      if (!existing) {
        throw new AppError(404, "Ticket not found", "NOT_FOUND");
      }

      const updateData: any = {};
      if (body.status !== undefined) {
        updateData.status = body.status;
        // If closing via PATCH, set closedAt
        if (body.status === "closed" && existing.status !== "closed") {
          updateData.closedAt = new Date();
        }
        // If re-opening a closed ticket, clear closedAt
        if (body.status !== "closed" && existing.status === "closed") {
          updateData.closedAt = null;
        }
      }
      if (body.priority !== undefined) updateData.priority = body.priority;
      if (body.category !== undefined) updateData.category = body.category;

      const updated = await prisma.supportTicket.update({
        where: { id: req.params.id as string },
        data: updateData,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "update_ticket",
        resourceType: "support_ticket",
        resourceId: existing.id,
        oldValues: {
          status: existing.status,
          priority: existing.priority,
          category: existing.category,
        },
        newValues: updateData,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Ticket updated",
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/assign (assign ticket to admin) ────────────────────────────

router.post(
  "/:id/assign",
  requireRole("admin", "super_admin", "support"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = assignSchema.parse(req.body);

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: req.params.id as string },
      });

      if (!ticket) {
        throw new AppError(404, "Ticket not found", "NOT_FOUND");
      }

      const updated = await prisma.supportTicket.update({
        where: { id: req.params.id as string },
        data: { assignedToId: body.adminId },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      });

      await logAudit({
        adminUserId: req.admin!.id,
        action: "assign_ticket",
        resourceType: "support_ticket",
        resourceId: ticket.id,
        oldValues: { assignedToId: ticket.assignedToId },
        newValues: { assignedToId: body.adminId },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });

      res.json({
        success: true,
        data: updated,
        error: null,
        message: "Ticket assigned",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
