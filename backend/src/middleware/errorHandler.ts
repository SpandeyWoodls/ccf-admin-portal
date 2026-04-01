import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

/**
 * Typed application error with HTTP status code and machine-readable code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, code = "INTERNAL_ERROR", isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global Express error handler.
 *
 * Every error response includes `requestId` so the caller can reference
 * the exact server-side log entry when reporting issues.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = _req.requestId ?? "unknown";

  // Zod validation errors
  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      data: null,
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: formatted,
      requestId,
    });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data: null,
      error: err.code,
      message: err.message,
      requestId,
    });
    return;
  }

  // Prisma known errors
  if ((err as any).code === "P2002") {
    res.status(409).json({
      success: false,
      data: null,
      error: "DUPLICATE_ENTRY",
      message: "A record with that value already exists",
      requestId,
    });
    return;
  }

  if ((err as any).code === "P2025") {
    res.status(404).json({
      success: false,
      data: null,
      error: "NOT_FOUND",
      message: "Record not found",
      requestId,
    });
    return;
  }

  // Unexpected errors — always hide details from clients.
  // Stack traces, file paths, and internal error messages must never
  // reach the response body regardless of NODE_ENV.
  console.error("[UNHANDLED ERROR]", { requestId, error: err });
  res.status(500).json({
    success: false,
    data: null,
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    requestId,
  });
}
