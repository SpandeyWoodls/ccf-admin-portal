import { ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
      return;
    }
    req.body = result.data; // Use parsed data (strips unknown fields)
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ success: false, error: "Invalid query parameters" });
      return;
    }
    next();
  };
}
