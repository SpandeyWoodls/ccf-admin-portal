import xss from "xss";
import type { Request, Response, NextFunction } from "express";

// Configure xss with strict whitelist (no HTML allowed in API inputs)
const xssOptions = {
  whiteList: {},          // No tags allowed
  stripIgnoreTag: true,   // Strip all non-whitelisted tags
  stripIgnoreTagBody: ["script", "style"], // Remove script/style entirely
};

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
      // Remove null bytes and sanitize HTML
      obj[key] = xss(value.replace(/\0/g, "").trim(), xssOptions);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string") {
          value[i] = xss((value[i] as string).replace(/\0/g, "").trim(), xssOptions);
        } else if (typeof value[i] === "object" && value[i] !== null) {
          sanitizeObject(value[i] as Record<string, unknown>);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
}
