import "dotenv/config";
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
  adminLimiter,
  publicApiLimiter,
  activationLimiter,
} from "./middleware/rateLimiter.js";

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
import downloadAdminRoutes, { publicDownloadHandler } from "./routes/download.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { startCronJobs } from "./cron/index.js";

// ─── App setup ──────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ─── API Documentation (mounted before helmet so Swagger UI loads correctly) ─

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "CCF Admin Portal API Docs",
}));
app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

// ─── Global middleware ──────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow loading images
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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-License-Key", "X-Hardware-Fingerprint"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Request logging ───────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Input sanitization ────────────────────────────────────────────────────
app.use(sanitizeInput);

// Trust proxy for accurate IP in rate limiter (when behind nginx/cloudflare)
app.set("trust proxy", 1);

// Rate limiting is now handled by granular limiters from middleware/rateLimiter.ts
// Applied per-route below for login, activation, public API, and admin routes.

// ─── BigInt JSON serialization ──────────────────────────────────────────────
// Prisma returns BigInt for autoincrement IDs; Express JSON.stringify chokes
// unless we teach BigInt to serialize.

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// ─── Public routes (desktop app) ────────────────────────────────────────────

app.use("/api/v1/health", healthHandler);
app.use("/api/v1/license/activate", activationLimiter); // tight limit for activation abuse
app.use("/api/v1/license", publicApiLimiter, licensePublicRoutes);
app.use("/api/v1/heartbeat", publicApiLimiter, heartbeatHandler);
app.use("/api/v1/announcements", publicApiLimiter, announcementsPublicHandler);
app.use("/api/v1/update-check", publicApiLimiter, updateCheckHandler);
app.use("/api/v1/support", publicApiLimiter, supportPublicRoutes);
app.use("/api/v1", publicApiLimiter, trialPublicRoutes); // /api/v1/trial-request, /api/v1/trial-request-status

// ─── Admin auth routes ──────────────────────────────────────────────────────

app.use("/api/v1/auth/login", loginLimiter); // strict brute-force protection
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

// ─── Public authenticated download route ────────────────────────────────────
// Requires either X-License-Key header or admin JWT Bearer token.
app.get("/api/v1/downloads/:assetId", publicApiLimiter, publicDownloadHandler);

// ─── CI/CD Webhook routes (GitHub Actions) ─────────────────────────────────
// These routes use their own Bearer token auth (not JWT) and are rate-limited
// separately. The webhook creates draft releases that admins must publish.
app.use("/api/v1/webhooks", publicApiLimiter, webhookRoutes);

// ─── Legacy PHP compatibility rewrites ──────────────────────────────────────
// The old PHP backend used these paths. Redirect them to the new API.

app.post("/license/activate.php", (req, res) => {
  res.redirect(307, "/api/v1/license/activate");
});
app.post("/license/validate.php", (req, res) => {
  res.redirect(307, "/api/v1/license/validate");
});
app.post("/license/deactivate.php", (req, res) => {
  res.redirect(307, "/api/v1/license/deactivate");
});
app.post("/license/heartbeat.php", (req, res) => {
  res.redirect(307, "/api/v1/heartbeat");
});
app.get("/license/update-check.php", (req, res) => {
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(301, `/api/v1/update-check${qs ? `?${qs}` : ""}`);
});

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
