import type { Request, Response, NextFunction } from "express";

/**
 * Input sanitization middleware.
 * - Strips HTML script tags from string inputs to prevent XSS
 * - Trims whitespace
 * - Rejects null bytes
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      obj[key] = value
        .replace(/\0/g, "") // null bytes
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // script tags
        .trim();
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string") {
          value[i] = (value[i] as string)
            .replace(/\0/g, "")
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .trim();
        } else if (typeof value[i] === "object" && value[i] !== null) {
          sanitizeObject(value[i] as Record<string, unknown>);
        }
      }
    }
  }
}
