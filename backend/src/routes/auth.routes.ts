import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type JwtPayload } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(admin: { id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    secret,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "1h") as any },
  );
}

function signRefreshToken(admin: { id: string }): string {
  const secret = process.env.JWT_REFRESH_SECRET!;
  return jwt.sign(
    { sub: admin.id, type: "refresh" },
    secret,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as any },
  );
}

function parseExpiry(duration: string): Date {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 3600_000); // default 1h
  const val = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const ms = { s: 1000, m: 60_000, h: 3600_000, d: 86400_000 }[unit] ?? 3600_000;
  return new Date(Date.now() + val * ms);
}

// ─── POST /login ────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 *     description: Authenticate an admin user and receive JWT access + refresh tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@cyberchakra.in
 *               password:
 *                 type: string
 *                 example: changeme
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     admin:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account is deactivated
 */
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({ where: { email: body.email } });
    if (!admin) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (!admin.isActive) {
      throw new AppError(403, "Account is deactivated", "ACCOUNT_DISABLED");
    }

    const valid = await bcrypt.compare(body.password, admin.passwordHash);
    if (!valid) {
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    const accessToken = signAccessToken(admin);
    const refreshToken = signRefreshToken(admin);

    const expiresAt = parseExpiry(process.env.JWT_EXPIRES_IN || "1h");
    const refreshExpiresAt = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN || "7d");

    // Store session
    await prisma.adminSession.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
        refreshExpiresAt,
        ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 512) ?? null,
      },
    });

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await logAudit({
      adminUserId: admin.id,
      action: "login",
      resourceType: "admin_user",
      resourceId: admin.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
      error: null,
      message: "Login successful",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /refresh ──────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Exchange a valid refresh token for a new access + refresh token pair.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = refreshSchema.parse(req.body);

    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new AppError(500, "JWT_REFRESH_SECRET not configured", "CONFIG_ERROR");
    }

    let payload: { sub: string; type: string };
    try {
      payload = jwt.verify(body.refreshToken, refreshSecret) as typeof payload;
    } catch {
      throw new AppError(401, "Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
    }

    if (payload.type !== "refresh") {
      throw new AppError(401, "Invalid token type", "INVALID_TOKEN_TYPE");
    }

    // Find the session by refresh token hash
    const tokenHash = hashToken(body.refreshToken);
    const session = await prisma.adminSession.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        refreshExpiresAt: { gt: new Date() },
      },
      include: { admin: true },
    });

    if (!session || !session.admin.isActive) {
      throw new AppError(401, "Session not found or expired", "SESSION_EXPIRED");
    }

    // Issue new tokens
    const newAccessToken = signAccessToken(session.admin);
    const newRefreshToken = signRefreshToken(session.admin);
    const expiresAt = parseExpiry(process.env.JWT_EXPIRES_IN || "1h");
    const refreshExpiresAt = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN || "7d");

    // Update session
    await prisma.adminSession.update({
      where: { id: session.id },
      data: {
        tokenHash: hashToken(newAccessToken),
        refreshTokenHash: hashToken(newRefreshToken),
        expiresAt,
        refreshExpiresAt,
      },
    });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: expiresAt.toISOString(),
      },
      error: null,
      message: "Token refreshed",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /logout ───────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout
 *     description: Invalidate the current session and delete the session record.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post("/logout", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (header) {
      const token = header.slice(7);
      const tHash = hashToken(token);
      // Delete the specific session
      await prisma.adminSession.deleteMany({
        where: { tokenHash: tHash },
      });
    }

    await logAudit({
      adminUserId: req.admin!.id,
      action: "logout",
      resourceType: "admin_user",
      resourceId: req.admin!.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({ success: true, data: null, error: null, message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

// ─── GET /me ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current admin profile
 *     description: Returns the authenticated admin user's profile information.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     lastLoginAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Admin not found
 */
router.get("/me", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!admin) {
      throw new AppError(404, "Admin not found", "NOT_FOUND");
    }

    res.json({ success: true, data: admin, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

export default router;
