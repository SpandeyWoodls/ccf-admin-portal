import type { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler.js";

/**
 * CSRF protection middleware for SPA + JWT architecture (defense-in-depth).
 *
 * Since the admin portal uses JWT Bearer tokens (not cookies), it is already
 * inherently resistant to CSRF attacks -- browsers never auto-attach custom
 * Authorization headers on cross-origin requests. However, for defense-in-depth
 * this middleware enforces an additional custom header requirement on all
 * state-mutating requests (POST, PUT, PATCH, DELETE).
 *
 * How it works:
 *   - Mutating requests must include `X-Requested-With: XMLHttpRequest`.
 *   - Browsers block cross-origin requests with custom headers unless the
 *     server's CORS policy explicitly allows them AND the preflight passes.
 *   - Even if an attacker tricks a browser into submitting a form or using
 *     `<img>` / `<script>` tags, those mechanisms cannot set custom headers,
 *     so the request is rejected.
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt because they must not cause
 * side effects per HTTP semantics.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_HEADER = "x-requested-with";
const REQUIRED_VALUE = "XMLHttpRequest";

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  // Allow safe (non-mutating) methods through without checks
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const headerValue = req.headers[REQUIRED_HEADER];

  if (!headerValue || headerValue !== REQUIRED_VALUE) {
    return next(
      new AppError(
        403,
        "Missing or invalid X-Requested-With header",
        "CSRF_HEADER_MISSING",
      ),
    );
  }

  next();
}
