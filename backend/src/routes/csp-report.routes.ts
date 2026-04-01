import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * POST /api/v1/csp-report
 *
 * Receives Content-Security-Policy violation reports sent by the browser
 * when a CSP directive is violated. The browser sends these automatically
 * when the CSP header includes a report-uri directive.
 *
 * Reports are logged as structured JSON for monitoring and alerting.
 * In a future iteration these could be persisted to the database or
 * forwarded to an external monitoring service (e.g., Sentry).
 *
 * The request body uses content-type "application/csp-report" which is
 * a JSON payload with a "csp-report" wrapper object.
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const report = req.body?.["csp-report"] || req.body;

    if (report) {
      console.warn(
        "[CSP_VIOLATION]",
        JSON.stringify({
          timestamp: new Date().toISOString(),
          blockedUri: report["blocked-uri"] || report.blockedURI,
          violatedDirective: report["violated-directive"] || report.violatedDirective,
          documentUri: report["document-uri"] || report.documentURI,
          originalPolicy: report["original-policy"] || report.originalPolicy,
          sourceFile: report["source-file"] || report.sourceFile,
          lineNumber: report["line-number"] || report.lineNumber,
          columnNumber: report["column-number"] || report.columnNumber,
          ip: req.ip || req.socket.remoteAddress || "unknown",
        }),
      );
    }
  } catch {
    // Silently drop malformed CSP reports -- never fail on monitoring input
  }

  // Always respond 204 No Content -- browser expects a successful response
  res.status(204).end();
});

export default router;
