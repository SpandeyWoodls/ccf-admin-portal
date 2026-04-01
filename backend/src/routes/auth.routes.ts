import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type JwtPayload } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logAudit } from "../lib/audit.js";
import { validatePasswordStrength } from "../lib/password-policy.js";
import {
  getAccountLockout,
  recordFailedLogin,
  clearFailedLogins,
} from "../middleware/rateLimiter.js";
import { sendEmail } from "../services/email.js";
import { passwordChangedEmail, mfaEnabledEmail, mfaDisabledEmail } from "../services/email-templates.js";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

const mfaVerifySetupSchema = z.object({
  secret: z.string().min(1, "Secret is required"),
  token: z.string().length(6, "Token must be 6 digits").regex(/^\d{6}$/),
});

const mfaTokenSchema = z.object({
  token: z.string().length(6, "Token must be 6 digits").regex(/^\d{6}$/),
});

const mfaVerifyLoginSchema = z.object({
  mfaSessionId: z.string().min(1, "MFA session ID is required"),
  token: z.string().length(6, "Token must be 6 digits").regex(/^\d{6}$/),
});

// ─── JWT Constants ─────────────────────────────────────────────────────────

const JWT_ISSUER = "ccf-admin-portal";
const JWT_AUDIENCE = "ccf-admin-api";
const JWT_ALGORITHM = "HS256" as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create a SHA-256 fingerprint from IP + User-Agent for session binding. */
function sessionFingerprint(ip: string | null | undefined, ua: string | null | undefined): string {
  return crypto.createHash("sha256").update(`${ip ?? ""}|${ua ?? ""}`).digest("hex");
}

// ─── TOTP Helpers (crypto-based, no external library) ──────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode a Buffer to base32 (RFC 4648). */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

/** Decode a base32 string to a Buffer. */
function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** Generate a random TOTP secret (20 bytes, base32 encoded). */
function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Generate a 6-digit TOTP code for a given secret and time counter.
 * Implements RFC 6238 / RFC 4226 using HMAC-SHA1, 30-second time steps.
 */
function generateTotpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);

  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226 section 5.4)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, "0");
}

/**
 * Verify a TOTP token. Allows a window of +/- 1 time step (30s)
 * to account for clock drift.
 */
function verifyTotp(secret: string, token: string): boolean {
  const timeStep = 30;
  const currentCounter = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -1; i <= 1; i++) {
    const code = generateTotpCode(secret, currentCounter + i);
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(token))) {
      return true;
    }
  }
  return false;
}

/** Build an otpauth:// URI for QR code scanning. */
function buildOtpAuthUrl(secret: string, email: string): string {
  const issuer = "CCF-Admin-Portal";
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// In-memory store for pending MFA login sessions (short-lived).
// In production, consider using Redis or a DB table with TTL.
interface MfaSession {
  adminId: string;
  email: string;
  role: string;
  name: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number;
}

const pendingMfaSessions = new Map<string, MfaSession>();

// Clean up expired MFA sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  for (const [id, session] of pendingMfaSessions) {
    if (now - session.createdAt > maxAge) {
      pendingMfaSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

function signAccessToken(admin: { id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: (process.env.JWT_EXPIRES_IN || "1h") as any,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
}

function signRefreshToken(admin: { id: string }): string {
  const secret = process.env.JWT_REFRESH_SECRET!;
  return jwt.sign(
    { sub: admin.id, type: "refresh" },
    secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as any,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
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

    // ─── Account lockout check (per-email, not per-IP) ─────────────────────
    const attempt = getAccountLockout(body.email);
    if (attempt?.lockedUntil && Date.now() < attempt.lockedUntil) {
      const remainingMs = attempt.lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      await logAudit({
        adminUserId: null,
        action: "login_blocked_lockout",
        resourceType: "admin_user",
        resourceId: null,
        newValues: { email: body.email, remainingMin },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });
      throw new AppError(423, `Account temporarily locked. Try again in ${remainingMin} minute(s)`, "ACCOUNT_LOCKED");
    }

    const admin = await prisma.adminUser.findUnique({
      where: { email: body.email },
      select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true, mfaSecret: true },
    });
    if (!admin) {
      // Record failed attempt even for non-existent emails to prevent
      // timing-based enumeration (attacker can't distinguish user-not-found
      // from wrong-password based on lockout behavior).
      recordFailedLogin(body.email);
      logAudit({
        adminUserId: null,
        action: "login_failed",
        resourceType: "admin_user",
        resourceId: null,
        newValues: { email: body.email, reason: "nonexistent_email" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      }).catch(() => {});
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (!admin.isActive) {
      logAudit({
        adminUserId: admin.id,
        action: "login_failed",
        resourceType: "admin_user",
        resourceId: admin.id,
        newValues: { reason: "account_disabled" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      }).catch(() => {});
      throw new AppError(403, "Account is deactivated", "ACCOUNT_DISABLED");
    }

    const valid = await bcrypt.compare(body.password, admin.passwordHash);
    if (!valid) {
      const nowLocked = recordFailedLogin(body.email);
      logAudit({
        adminUserId: admin.id,
        action: "login_failed",
        resourceType: "admin_user",
        resourceId: admin.id,
        newValues: { reason: "invalid_password" },
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      }).catch(() => {});
      if (nowLocked) {
        await logAudit({
          adminUserId: admin.id,
          action: "account_locked",
          resourceType: "admin_user",
          resourceId: admin.id,
          newValues: { reason: "too_many_failed_login_attempts" },
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        });
      }
      throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    // Credentials valid — clear any accumulated failed login attempts
    clearFailedLogins(body.email);

    // ─── MFA gate: if admin has MFA enabled, require TOTP before issuing tokens
    if (admin.mfaSecret) {
      const mfaSessionId = crypto.randomUUID();
      pendingMfaSessions.set(mfaSessionId, {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
        name: admin.name,
        ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 512) ?? null,
        createdAt: Date.now(),
      });

      res.json({
        success: true,
        data: {
          requiresMfa: true,
          mfaSessionId,
        },
        error: null,
        message: "MFA verification required",
      });
      return;
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
      throw new AppError(500, "Server authentication configuration error", "CONFIG_ERROR");
    }

    let payload: { sub: string; type: string };
    try {
      payload = jwt.verify(body.refreshToken, refreshSecret, {
        algorithms: ['HS256'],
        issuer: 'ccf-admin-portal',
      }) as typeof payload;
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
      include: {
        admin: {
          select: { id: true, email: true, role: true, name: true, isActive: true },
        },
      },
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

// ─── PATCH /change-password ─────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change admin password
 *     description: >
 *       Change the authenticated admin's password. Requires the current password
 *       for verification. On success, all existing sessions are invalidated.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Current password is incorrect
 */
router.patch("/change-password", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = changePasswordSchema.parse(req.body);

    const strength = validatePasswordStrength(body.newPassword);
    if (!strength.valid) {
      throw new AppError(400, strength.errors.join(". "), "WEAK_PASSWORD");
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!admin) {
      throw new AppError(404, "Admin not found", "NOT_FOUND");
    }

    const valid = await bcrypt.compare(body.currentPassword, admin.passwordHash);
    if (!valid) {
      throw new AppError(401, "Current password is incorrect", "INVALID_CREDENTIALS");
    }

    const newPasswordHash = await bcrypt.hash(body.newPassword, 12);

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all existing sessions
    await prisma.adminSession.deleteMany({
      where: { adminUserId: admin.id },
    });

    await logAudit({
      adminUserId: admin.id,
      action: "change_password",
      resourceType: "admin_user",
      resourceId: admin.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    // Fire-and-forget: send password change confirmation email
    const { subject, html } = passwordChangedEmail(admin.name, req.ip ?? "Unknown");
    sendEmail(admin.email, subject, html).catch(err => {
      console.error(`[Email] Password change confirmation failed:`, err.message);
    });

    res.json({ success: true, data: null, error: null, message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
});

// ─── GET /sessions ─────────────────────────────────────────────────────────

router.get("/sessions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await prisma.adminSession.findMany({
      where: {
        adminUserId: req.admin!.id,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        tokenHash: true, // Used only for isCurrent comparison — never returned
      },
      orderBy: { createdAt: "desc" },
    });

    // Determine current session by hashing the caller's Bearer token
    const currentTokenHash = req.headers.authorization
      ? hashToken(req.headers.authorization.slice(7))
      : null;

    // SECURITY: Destructure to strip tokenHash so it is never serialized
    const result = sessions.map(({ tokenHash: th, ...rest }: any) => ({
      ...rest,
      isCurrent: th === currentTokenHash,
    }));

    res.json({ success: true, data: { sessions: result }, error: null, message: "" });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /sessions/:sessionId ───────────────────────────────────────────

router.delete("/sessions/:sessionId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.adminSession.findFirst({
      where: { id: req.params.sessionId, adminUserId: req.admin!.id },
    });

    if (!session) {
      throw new AppError(404, "Session not found", "NOT_FOUND");
    }

    await prisma.adminSession.delete({ where: { id: session.id } });

    res.json({ success: true, data: null, error: null, message: "Session revoked" });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /sessions (revoke all other sessions) ──────────────────────────

router.delete("/sessions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentTokenHash = req.headers.authorization
      ? hashToken(req.headers.authorization.slice(7))
      : null;

    const result = await prisma.adminSession.deleteMany({
      where: {
        adminUserId: req.admin!.id,
        ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
      },
    });

    res.json({
      success: true,
      data: { revokedCount: result.count },
      error: null,
      message: `Revoked ${result.count} other session(s)`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/setup ───────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/mfa/setup:
 *   post:
 *     tags: [Auth, MFA]
 *     summary: Generate TOTP secret for MFA setup
 *     description: >
 *       Generate a new TOTP secret and QR code URL. The secret is NOT saved
 *       to the database yet — the admin must verify a code first via /mfa/verify-setup.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP secret and QR code URL
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
 *                     secret:
 *                       type: string
 *                     qrCodeUrl:
 *                       type: string
 *       400:
 *         description: MFA is already enabled
 *       401:
 *         description: Not authenticated
 */
router.post("/mfa/setup", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: { id: true, email: true, mfaSecret: true },
    });

    if (!admin) {
      throw new AppError(404, "Admin not found", "NOT_FOUND");
    }

    if (admin.mfaSecret) {
      throw new AppError(400, "MFA is already enabled. Disable it first to reconfigure.", "MFA_ALREADY_ENABLED");
    }

    const secret = generateTotpSecret();
    const qrCodeUrl = buildOtpAuthUrl(secret, admin.email);

    res.json({
      success: true,
      data: { secret, qrCodeUrl },
      error: null,
      message: "Scan the QR code with your authenticator app, then verify with /mfa/verify-setup",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/verify-setup ────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/mfa/verify-setup:
 *   post:
 *     tags: [Auth, MFA]
 *     summary: Verify TOTP code and enable MFA
 *     description: >
 *       Verify the TOTP token generated by the authenticator app against the
 *       provided secret. If valid, saves the secret to the admin's mfaSecret field.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret, token]
 *             properties:
 *               secret:
 *                 type: string
 *                 description: The base32-encoded TOTP secret from /mfa/setup
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code from the authenticator app
 *     responses:
 *       200:
 *         description: MFA enabled successfully
 *       400:
 *         description: Invalid TOTP token
 *       401:
 *         description: Not authenticated
 */
router.post("/mfa/verify-setup", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = mfaVerifySetupSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: { id: true, email: true, name: true, mfaSecret: true },
    });

    if (!admin) {
      throw new AppError(404, "Admin not found", "NOT_FOUND");
    }

    if (admin.mfaSecret) {
      throw new AppError(400, "MFA is already enabled", "MFA_ALREADY_ENABLED");
    }

    // Verify the TOTP token against the provided secret
    if (!verifyTotp(body.secret, body.token)) {
      throw new AppError(400, "Invalid TOTP code. Please try again.", "INVALID_MFA_TOKEN");
    }

    // Save the secret to the admin record
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { mfaSecret: body.secret },
    });

    await logAudit({
      adminUserId: admin.id,
      action: "mfa_enabled",
      resourceType: "admin_user",
      resourceId: admin.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    // Fire-and-forget MFA enabled notification email
    const { subject: mfaSubject, html: mfaHtml } = mfaEnabledEmail(admin.name);
    sendEmail(admin.email, mfaSubject, mfaHtml).catch(err =>
      console.error("[Email] MFA enabled notification failed:", err.message),
    );

    res.json({
      success: true,
      data: null,
      error: null,
      message: "MFA has been enabled successfully",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/disable ────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/mfa/disable:
 *   post:
 *     tags: [Auth, MFA]
 *     summary: Disable MFA
 *     description: >
 *       Disable MFA for the authenticated admin. Requires a valid current TOTP
 *       code to confirm the action.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code to confirm disabling MFA
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 *       400:
 *         description: Invalid TOTP token or MFA not enabled
 *       401:
 *         description: Not authenticated
 */
router.post("/mfa/disable", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = mfaTokenSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: { id: true, email: true, name: true, mfaSecret: true },
    });

    if (!admin) {
      throw new AppError(404, "Admin not found", "NOT_FOUND");
    }

    if (!admin.mfaSecret) {
      throw new AppError(400, "MFA is not enabled", "MFA_NOT_ENABLED");
    }

    // Verify the TOTP token against the stored secret
    if (!verifyTotp(admin.mfaSecret, body.token)) {
      throw new AppError(400, "Invalid TOTP code", "INVALID_MFA_TOKEN");
    }

    // Clear the MFA secret
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { mfaSecret: null },
    });

    await logAudit({
      adminUserId: admin.id,
      action: "mfa_disabled",
      resourceType: "admin_user",
      resourceId: admin.id,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    // Fire-and-forget MFA disabled notification email
    const { subject: mfaSubject, html: mfaHtml } = mfaDisabledEmail(admin.name, req.ip ?? "Unknown");
    sendEmail(admin.email, mfaSubject, mfaHtml).catch(err =>
      console.error("[Email] MFA disabled notification failed:", err.message),
    );

    res.json({
      success: true,
      data: null,
      error: null,
      message: "MFA has been disabled successfully",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/verify ─────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/mfa/verify:
 *   post:
 *     tags: [Auth, MFA]
 *     summary: Verify MFA during login
 *     description: >
 *       Complete login for MFA-enabled admins. After /login returns requiresMfa: true,
 *       the client sends the mfaSessionId and a TOTP code to receive JWT tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mfaSessionId, token]
 *             properties:
 *               mfaSessionId:
 *                 type: string
 *               token:
 *                 type: string
 *                 description: 6-digit TOTP code
 *     responses:
 *       200:
 *         description: MFA verified, tokens issued
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
 *                     admin:
 *                       type: object
 *       401:
 *         description: Invalid MFA session or TOTP code
 */
router.post("/mfa/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = mfaVerifyLoginSchema.parse(req.body);

    // Look up the pending MFA session
    const mfaSession = pendingMfaSessions.get(body.mfaSessionId);
    if (!mfaSession) {
      throw new AppError(401, "MFA session not found or expired", "MFA_SESSION_EXPIRED");
    }

    // Check session age (5-minute maximum)
    if (Date.now() - mfaSession.createdAt > 5 * 60 * 1000) {
      pendingMfaSessions.delete(body.mfaSessionId);
      throw new AppError(401, "MFA session expired", "MFA_SESSION_EXPIRED");
    }

    // Fetch the admin (with MFA secret)
    const admin = await prisma.adminUser.findUnique({
      where: { id: mfaSession.adminId },
      select: { id: true, email: true, name: true, role: true, isActive: true, mfaSecret: true },
    });

    if (!admin || !admin.isActive) {
      pendingMfaSessions.delete(body.mfaSessionId);
      throw new AppError(401, "Admin account not found or deactivated", "ACCOUNT_DISABLED");
    }

    if (!admin.mfaSecret) {
      pendingMfaSessions.delete(body.mfaSessionId);
      throw new AppError(400, "MFA is no longer enabled for this account", "MFA_NOT_ENABLED");
    }

    // Verify the TOTP token
    if (!verifyTotp(admin.mfaSecret, body.token)) {
      // Record failed MFA attempt against the account (same lockout as password)
      const nowLocked = recordFailedLogin(admin.email);
      if (nowLocked) {
        // Consume the MFA session so the attacker can't keep trying
        pendingMfaSessions.delete(body.mfaSessionId);
        await logAudit({
          adminUserId: admin.id,
          action: "account_locked",
          resourceType: "admin_user",
          resourceId: admin.id,
          newValues: { reason: "too_many_failed_mfa_attempts" },
          ipAddress: mfaSession.ipAddress,
          userAgent: mfaSession.userAgent,
        });
      }
      logAudit({
        adminUserId: admin.id,
        action: "mfa_failed",
        resourceType: "admin_user",
        resourceId: admin.id,
        newValues: { reason: "invalid_totp_code" },
        ipAddress: mfaSession.ipAddress,
        userAgent: mfaSession.userAgent,
      }).catch(() => {});
      throw new AppError(401, "Invalid TOTP code", "INVALID_MFA_TOKEN");
    }

    // MFA verified — consume the session and clear failed attempt counter
    pendingMfaSessions.delete(body.mfaSessionId);
    clearFailedLogins(admin.email);

    // Issue tokens (same flow as non-MFA login)
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
        ipAddress: mfaSession.ipAddress,
        userAgent: mfaSession.userAgent,
      },
    });

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await logAudit({
      adminUserId: admin.id,
      action: "login_mfa",
      resourceType: "admin_user",
      resourceId: admin.id,
      ipAddress: mfaSession.ipAddress,
      userAgent: mfaSession.userAgent,
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

// ─── GET /mfa/status ───────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/auth/mfa/status:
 *   get:
 *     tags: [Auth, MFA]
 *     summary: Check MFA status
 *     description: Returns whether MFA is enabled for the authenticated admin.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA status
 */
router.get("/mfa/status", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: req.admin!.id },
      select: { mfaSecret: true },
    });

    res.json({
      success: true,
      data: { mfaEnabled: !!admin?.mfaSecret },
      error: null,
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
