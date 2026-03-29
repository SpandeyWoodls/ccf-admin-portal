import type { Request, Response, NextFunction } from "express";

/**
 * Request logging middleware.
 * Logs every request with: method, path, status code, response time, IP.
 * Excludes health check endpoint to reduce noise.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip health check - too noisy
  if (req.path === "/api/v1/health") {
    return next();
  }

  const start = Date.now();

  // Hook into response finish event
  res.on("finish", () => {
    const duration = Date.now() - start;
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const status = res.statusCode;
    const method = req.method;
    const path = req.originalUrl || req.url;

    const logEntry = {
      timestamp: new Date().toISOString(),
      method,
      path,
      status,
      duration_ms: duration,
      ip,
    };

    // Use warn level for server errors, info for everything else
    if (status >= 500) {
      console.error("[REQUEST]", JSON.stringify(logEntry));
    } else if (status >= 400) {
      console.warn("[REQUEST]", JSON.stringify(logEntry));
    } else {
      console.log("[REQUEST]", JSON.stringify(logEntry));
    }
  });

  next();
}
