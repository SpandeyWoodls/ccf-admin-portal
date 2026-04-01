import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Slow-request threshold in milliseconds.
 * Requests exceeding this duration are logged at warn level.
 */
const SLOW_REQUEST_THRESHOLD_MS = 5_000;

/**
 * Extend Express Request to carry request-scoped tracing IDs.
 */
declare global {
  namespace Express {
    interface Request {
      /** Unique ID generated per request (UUID v4). */
      requestId?: string;
      /** Correlation ID forwarded from the frontend (links FE errors to BE logs). */
      correlationId?: string;
    }
  }
}

/**
 * Request logging middleware.
 *
 * Per-request behaviour:
 *   1. Generates a UUID v4 request ID and attaches it to `req.requestId`.
 *   2. Reads the optional `X-Correlation-Id` header sent by the frontend
 *      and stores it on `req.correlationId`.
 *   3. Sets `X-Request-Id` and (when present) `X-Correlation-Id` on the
 *      response so callers can correlate responses with logs.
 *   4. On response finish, emits a structured JSON log entry that includes:
 *        - method, path, status, duration, IP
 *        - requestId and correlationId
 *        - authenticated admin email (for /admin/ routes)
 *        - request body size (Content-Length header value)
 *   5. Emits a SLOW_REQUEST warning if duration > 5 000 ms.
 *
 * The health-check endpoint is skipped to reduce noise.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip health check - too noisy
  if (req.path === "/api/v1/health") {
    return next();
  }

  // ── Generate / propagate tracing IDs ──────────────────────────────────
  const requestId = uuidv4();
  req.requestId = requestId;

  // Accept a correlation ID from the frontend so FE errors can be matched
  // to back-end log entries.  Falls back to the request ID itself.
  const correlationId =
    (req.headers["x-correlation-id"] as string | undefined) || requestId;
  req.correlationId = correlationId;

  // Echo both IDs on the response for the caller to capture.
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);

  const start = Date.now();

  // Hook into response finish event
  res.on("finish", () => {
    const duration = Date.now() - start;
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const status = res.statusCode;
    const method = req.method;
    const path = req.originalUrl || req.url;

    // Build structured log entry
    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
      method,
      path,
      status,
      duration_ms: duration,
      ip,
    };

    // Log the request body size (Content-Length), never the body itself
    const contentLength = req.headers["content-length"];
    if (contentLength) {
      logEntry.content_length = parseInt(contentLength, 10);
    }

    // For admin routes, include the authenticated admin email when available
    if (req.path.startsWith("/api/v1/admin") || req.path.startsWith("/api/v1/auth")) {
      if (req.admin?.email) {
        logEntry.admin_email = req.admin.email;
      }
    }

    // Use appropriate log level based on status code
    if (status >= 500) {
      console.error("[REQUEST]", JSON.stringify(logEntry));
    } else if (status >= 400) {
      console.warn("[REQUEST]", JSON.stringify(logEntry));
    } else {
      console.log("[REQUEST]", JSON.stringify(logEntry));
    }

    // Slow-request detection
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(
        "[SLOW_REQUEST]",
        JSON.stringify({
          requestId,
          correlationId,
          method,
          path,
          duration_ms: duration,
          threshold_ms: SLOW_REQUEST_THRESHOLD_MS,
          admin_email: req.admin?.email ?? undefined,
        }),
      );
    }
  });

  next();
}
