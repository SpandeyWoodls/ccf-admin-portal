import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./errorHandler.js";
/**
 * AdminRole mirrors the Prisma enum but is defined locally so the code
 * compiles even before `prisma generate` has been run.
 */
export type AdminRole = "super_admin" | "admin" | "support" | "viewer";

/**
 * Payload shape stored inside access JWTs.
 */
export interface JwtPayload {
  sub: string; // admin user id
  email: string;
  role: AdminRole;
  iat: number;
  exp: number;
}

/**
 * Extend Express Request to carry authenticated admin info.
 */
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        role: AdminRole;
        name: string;
      };
    }
  }
}

/**
 * Middleware: extract & verify JWT from Authorization header,
 * then attach the admin user to req.admin.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or invalid Authorization header", "UNAUTHORIZED");
    }

    const token = header.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError(500, "JWT_SECRET not configured", "CONFIG_ERROR");
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        throw new AppError(401, "Access token expired", "TOKEN_EXPIRED");
      }
      throw new AppError(401, "Invalid access token", "INVALID_TOKEN");
    }

    // Verify the admin still exists and is active
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, name: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      throw new AppError(401, "Admin account not found or deactivated", "ACCOUNT_DISABLED");
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Factory: returns middleware that checks if the authenticated admin
 * has one of the allowed roles.
 *
 * Usage: router.get('/...', requireAuth, requireRole('admin', 'super_admin'), handler)
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin) {
      return next(new AppError(401, "Not authenticated", "UNAUTHORIZED"));
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return next(
        new AppError(403, "Insufficient permissions for this action", "FORBIDDEN"),
      );
    }

    next();
  };
}
