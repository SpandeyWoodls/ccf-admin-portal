import dotenv from "dotenv";
import { fileURLToPath as _fu } from "url";
import { dirname as _dn, resolve as _rs } from "path";
import { existsSync as _ex } from "fs";
const _df = _dn(_fu(import.meta.url));
// Try multiple .env locations (first match wins per-variable via dotenv precedence)
dotenv.config({ path: _rs(_df, "../.env") });       // backend/.env
dotenv.config({ path: _rs(_df, "../../.env") });     // root .env
dotenv.config({ path: ".env" });                      // cwd .env
// Hostinger deployment: .builds/config/.env holds hPanel-configured env vars
const _hp = _rs(_df, "../../../public_html/.builds/config/.env");
if (_ex(_hp)) dotenv.config({ path: _hp });
import express from "express";
import cors from "cors";
import helmet from "helmet";

import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { sanitizeInput } from "./middleware/sanitize.js";
import { requestLogger } from "./middleware/logger.js";
import {
  loginLimiter,
  mfaLimiter,
  passwordChangeLimiter,
  adminLimiter,
  publicApiLimiter,
  activationLimiter,
} from "./middleware/rateLimiter.js";
import { csrfProtection } from "./middleware/csrf.js";

// ─── Route imports ──────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import licensePublicRoutes, {
  heartbeatHandler,
  healthHandler,
  announcementsPublicHandler,
  updateCheckHandler,
} from "./routes/license.public.routes.js";
import licenseAdminRoutes from "./routes/license.admin.routes.js";
import orgAdminRoutes from "./routes/org.admin.routes.js";
import releaseAdminRoutes from "./routes/release.admin.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import supportPublicRoutes from "./routes/support.public.routes.js";
import trialPublicRoutes from "./routes/trial.public.routes.js";
import trialAdminRoutes from "./routes/trial.admin.routes.js";
import supportAdminRoutes from "./routes/support.admin.routes.js";
import auditAdminRoutes from "./routes/audit.admin.routes.js";
import announcementAdminRoutes from "./routes/announcement.admin.routes.js";
import rolloutAdminRoutes from "./routes/rollout.admin.routes.js";
import bulkAdminRoutes from "./routes/bulk.admin.routes.js";
import userAdminRoutes from "./routes/user.admin.routes.js";
import settingsAdminRoutes from "./routes/settings.admin.routes.js";
import downloadAdminRoutes, { publicDownloadHandler } from "./routes/download.routes.js";
import releaseWizardRoutes from "./routes/release-wizard.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import cspReportRoutes from "./routes/csp-report.routes.js";
import { startCronJobs } from "./cron/index.js";

// ─── App setup ──────────────────────────────────────────────────────────────

const app = express();

// Trust proxy for accurate IP in rate limiter (when behind nginx/cloudflare)
// Must be set before any middleware that reads client IP (rate limiters, logging).
app.set("trust proxy", 1);

const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── API Documentation (mounted before helmet so Swagger UI loads correctly) ─
// Only expose Swagger UI in non-production environments to prevent API
// enumeration and information disclosure in production.

if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "CCF Admin Portal API Docs",
  }));
  app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));
}

// ─── Global middleware ──────────────────────────────────────────────────────

// ── Content Security Policy ─────────────────────────────────────────────────
// 'unsafe-inline' in styleSrc:
//   Required by Radix UI primitives, Recharts SVG charts, and Sonner toasts
//   which all inject inline style attributes at runtime. Removing this
//   directive breaks dropdown menus, tooltips, chart rendering, and toasts.
//   Risk is mitigated because no user-controlled CSS injection vectors exist.
//
// imgSrc allows data: for inline SVG/base64 icons (Lucide icons).
//   Removed blanket "https:" -- images must come from 'self' or data: URIs.
//
// connectSrc includes cyberchakra.online for production API calls and
//   fonts.googleapis.com for Google Fonts CSS fetches.
//
// fontSrc includes fonts.gstatic.com where Google Fonts serves font files.
//
// reportUri enables server-side CSP violation monitoring.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://cyberchakra.online", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
        reportUri: "/api/v1/csp-report",
      },
    },
    crossOriginEmbedderPolicy: false, // Allow loading cross-origin fonts/images
  }),
);

// ─── Additional security headers ───────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const isProduction = process.env.NODE_ENV !== "development"; // Safe default: treat unset NODE_ENV as production

if (isProduction && (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === "*")) {
  console.error("FATAL: CORS_ORIGIN must be set to specific origins in production (not '*')");
  process.exit(1);
}

const corsOrigins = isProduction
  ? process.env.CORS_ORIGIN!.split(",").map((s) => s.trim())
  : (process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) || ["http://localhost:5173"]);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-License-Key",
      "X-Hardware-Fingerprint",
      "X-App-Channel",
      "X-Requested-With",
      "X-Correlation-Id",
    ],
    exposedHeaders: [
      "X-Request-Id",
      "X-Correlation-Id",
    ],
  }),
);

// ─── Request body size limits ─────────────────────────────────────────────
// Default 1mb is sufficient for most API requests (JSON payloads). The release
// wizard and bulk endpoints may need more, but those are protected by auth +
// role checks. The global 10mb was overly generous and could be used for DoS.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── Request logging ───────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Input sanitization ────────────────────────────────────────────────────
app.use(sanitizeInput);

// Rate limiting is now handled by granular limiters from middleware/rateLimiter.ts
// trust proxy is set earlier (right after app creation) so rate limiters see real IPs.
// Applied per-route below for login, activation, public API, and admin routes.

// ─── BigInt JSON serialization ──────────────────────────────────────────────
// Prisma returns BigInt for autoincrement IDs; Express JSON.stringify chokes
// unless we teach BigInt to serialize.

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// ─── CSP violation reporting endpoint ────────────────────────────────────────
// Browsers send CSP reports with content-type "application/csp-report" (JSON).
// Must be mounted with its own JSON body parser for the non-standard content
// type. No auth required -- browsers send these automatically.
app.use(
  "/api/v1/csp-report",
  express.json({ type: "application/csp-report", limit: "10kb" }),
  cspReportRoutes,
);

// ─── Public routes (desktop app) ────────────────────────────────────────────

app.use("/api/v1/health", healthHandler);
app.use("/api/v1/license/activate", activationLimiter); // tight limit for activation abuse
app.use("/api/v1/license", publicApiLimiter, licensePublicRoutes);
app.use("/api/v1/heartbeat", publicApiLimiter, heartbeatHandler);
app.use("/api/v1/announcements", publicApiLimiter, announcementsPublicHandler);
app.use("/api/v1/update-check", publicApiLimiter, updateCheckHandler);
app.use("/api/v1/support", publicApiLimiter, supportPublicRoutes);
app.use("/api/v1", publicApiLimiter, trialPublicRoutes); // /api/v1/trial-request, /api/v1/trial-request-status

// ─── CSRF protection for admin routes ──────────────────────────────────────
// Requires X-Requested-With: XMLHttpRequest on all mutating requests (POST,
// PUT, PATCH, DELETE) to admin and auth routes. This is defense-in-depth on
// top of JWT Bearer token auth. Public routes and webhooks are exempt because
// they serve the desktop app (non-browser) and CI/CD pipelines respectively.

app.use("/api/v1/auth", csrfProtection);
app.use("/api/v1/admin", csrfProtection);

// ─── Admin auth routes ──────────────────────────────────────────────────────

app.use("/api/v1/auth/login", loginLimiter); // strict brute-force protection
app.use("/api/v1/auth/mfa/verify", mfaLimiter); // strict: 5 attempts/15min (6-digit brute force)
app.use("/api/v1/auth/mfa/verify-setup", mfaLimiter); // strict: same as verify
app.use("/api/v1/auth/mfa/disable", mfaLimiter); // strict: same (requires valid TOTP)
app.use("/api/v1/auth/change-password", passwordChangeLimiter); // 5 attempts/15min
app.use("/api/v1/auth", adminLimiter, authRoutes);

// ─── Admin protected routes ─────────────────────────────────────────────────

app.use("/api/v1/admin/dashboard", adminLimiter, dashboardRoutes);
app.use("/api/v1/admin/licenses", adminLimiter, licenseAdminRoutes);
app.use("/api/v1/admin/organizations", adminLimiter, orgAdminRoutes);
app.use("/api/v1/admin/releases", adminLimiter, releaseAdminRoutes);
app.use("/api/v1/admin/trials", adminLimiter, trialAdminRoutes);
app.use("/api/v1/admin/tickets", adminLimiter, supportAdminRoutes);
app.use("/api/v1/admin/audit", adminLimiter, auditAdminRoutes);
app.use("/api/v1/admin/announcements", adminLimiter, announcementAdminRoutes);
app.use("/api/v1/admin/downloads", adminLimiter, downloadAdminRoutes);
app.use("/api/v1/admin", adminLimiter, rolloutAdminRoutes);
app.use("/api/v1/admin/bulk", adminLimiter, bulkAdminRoutes);
app.use("/api/v1/admin/users", adminLimiter, userAdminRoutes);
app.use("/api/v1/admin/settings", adminLimiter, settingsAdminRoutes);
app.use("/api/v1/admin/release-wizard", adminLimiter, releaseWizardRoutes);

// ─── Public authenticated download route ────────────────────────────────────
// Requires either X-License-Key header or admin JWT Bearer token.
app.get("/api/v1/downloads/:assetId", publicApiLimiter, publicDownloadHandler);

// ─── CI/CD Webhook routes (GitHub Actions) ─────────────────────────────────
// These routes use their own Bearer token auth (not JWT) and are rate-limited
// separately. The webhook creates draft releases that admins must publish.
app.use("/api/v1/webhooks", publicApiLimiter, webhookRoutes);

// ─── Legacy PHP compatibility rewrites ──────────────────────────────────────
// The old PHP backend used these paths. Redirect them to the new API.

app.post("/license/activate.php", publicApiLimiter, (req, res) => {
  res.redirect(307, "/api/v1/license/activate");
});
app.post("/license/validate.php", publicApiLimiter, (req, res) => {
  res.redirect(307, "/api/v1/license/validate");
});
app.post("/license/deactivate.php", publicApiLimiter, (req, res) => {
  res.redirect(307, "/api/v1/license/deactivate");
});
app.post("/license/heartbeat.php", publicApiLimiter, (req, res) => {
  res.redirect(307, "/api/v1/heartbeat");
});
app.get("/license/update-check.php", publicApiLimiter, (req, res) => {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(301, `/api/v1/update-check${qs ? `?${qs}` : ""}`);
});

// ─── Serve uploaded ticket attachments ──────────────────────────────────────

import { TICKET_UPLOADS_DIR } from "./lib/upload.js";

app.use("/uploads/tickets", express.static(TICKET_UPLOADS_DIR));

// ─── Serve frontend static files (production) ─────────────────────────────

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(express.static(frontendDist));

// SPA fallback: serve index.html for all non-API routes
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      next();
    }
  });
});

// ─── 404 catch-all (only for API routes now) ────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: "NOT_FOUND",
    message: "The requested endpoint does not exist",
    requestId: _req.requestId ?? "unknown",
  });
});

// ─── Global error handler (must be last) ────────────────────────────────────

app.use(errorHandler);

// ─── Start server ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   CCF Admin Portal API                          ║
  ║   Running on http://localhost:${PORT}              ║
  ║   Environment: ${process.env.NODE_ENV || "development"}                 ║
  ╚══════════════════════════════════════════════════╝
  `);

  // Start background scheduled tasks after the server is listening
  startCronJobs();
});

export default app;
