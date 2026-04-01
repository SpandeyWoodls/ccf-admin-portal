import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { validatePasswordStrength } from "../lib/password-policy.js";
import { paginated } from "../lib/response.js";
import { parsePagination } from "../lib/pagination.js";
import { sendEmail } from "../services/email.js";
import { adminWelcomeEmail } from "../services/email-templates.js";
import { passwordResetLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.use(requireAuth, requireRole("super_admin"));

// ─── Schemas ────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(["super_admin", "admin", "support", "viewer"]),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["super_admin", "admin", "support", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

// ─── GET / (list admin users) ──────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = parsePagination({
      ...req.query,
      pageSize: req.query.limit,
    } as Record<string, unknown>);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    const validRoles = ["super_admin", "admin", "support", "viewer"];
    if (req.query.role && validRoles.includes(req.query.role as string)) {
      where.role = req.query.role as string;
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.slice(0, 200)
        : undefined;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: USER_SELECT,
      }),
      prisma.adminUser.count({ where }),
    ]);

    res.json({
      success: true,
      data: paginated(users, total, page, pageSize),
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST / (create admin user) ────────────────────────────────────────────

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createUserSchema.parse(req.body);

    const strength = validatePasswordStrength(body.password);
    if (!strength.valid) {
      throw new AppError(400, strength.errors.join(". "), "WEAK_PASSWORD");
    }

    const existing = await prisma.adminUser.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      throw new AppError(409, "An admin with this email already exists", "EMAIL_EXISTS");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.adminUser.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        role: body.role,
        isActive: true,
      },
      select: USER_SELECT,
    });

    await logAudit({
      adminUserId: req.admin!.id,
      action: "create_admin_user",
      resourceType: "admin_user",
      resourceId: user.id,
      newValues: { email: body.email, name: body.name, role: body.role },
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    // Send welcome email (fire-and-forget)
    const { subject, html } = adminWelcomeEmail(body.name, body.email, body.role, body.password);
    sendEmail(body.email, subject, html).catch(err => {
      console.error(`[Email] Admin welcome email failed for ${body.email}:`, err.message);
    });

    res.status(201).json({
      success: true,
      data: user,
      error: null,
      message: "Admin user created",
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /:id (update admin user) ────────────────────────────────────────

router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateUserSchema.parse(req.body);

    if (body.role && req.params.id === req.admin!.id) {
      throw new AppError(400, "Cannot change your own role", "SELF_ROLE_CHANGE");
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    if (!existing) {
      throw new AppError(404, "Admin user not found", "NOT_FOUND");
    }

    const user = await prisma.adminUser.update({
      where: { id: req.params.id },
      data: body,
      select: USER_SELECT,
    });

    await logAudit({
      adminUserId: req.admin!.id,
      action: "update_admin_user",
      resourceType: "admin_user",
      resourceId: user.id,
      oldValues: { name: existing.name, role: existing.role, isActive: existing.isActive },
      newValues: body,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: user,
      error: null,
      message: "Admin user updated",
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id (deactivate admin user) ───────────────────────────────────

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.admin!.id) {
      throw new AppError(400, "Cannot deactivate your own account", "SELF_DELETE");
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, "Admin user not found", "NOT_FOUND");
    }

    await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await prisma.adminSession.deleteMany({
      where: { adminUserId: req.params.id },
    });

    await logAudit({
      adminUserId: req.admin!.id,
      action: "deactivate_admin_user",
      resourceType: "admin_user",
      resourceId: req.params.id as string,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: null,
      error: null,
      message: "Admin user deactivated",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/reset-password ──────────────────────────────────────────────

router.post("/:id/reset-password", passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = resetPasswordSchema.parse(req.body);

    const strength = validatePasswordStrength(body.newPassword);
    if (!strength.valid) {
      throw new AppError(400, strength.errors.join(". "), "WEAK_PASSWORD");
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, "Admin user not found", "NOT_FOUND");
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);

    await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });

    await prisma.adminSession.deleteMany({
      where: { adminUserId: req.params.id },
    });

    await logAudit({
      adminUserId: req.admin!.id,
      action: "reset_admin_password",
      resourceType: "admin_user",
      resourceId: req.params.id as string,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: null,
      error: null,
      message: "Password reset successfully",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
