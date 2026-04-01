/**
 * CCF Admin Portal - Environment Validation Script
 *
 * Validates that all required environment variables are set and correctly
 * configured for the current NODE_ENV. Run before starting the server to
 * catch misconfiguration early.
 *
 * Usage:
 *   npx tsx src/env-check.ts
 *
 * Automatically invoked via the "prestart" and "predev" npm scripts.
 */

import "dotenv/config";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  /** Returns an error message string, or null if valid. */
  validate?: (value: string) => string | null;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

const checks: EnvCheck[] = [
  {
    name: "NODE_ENV",
    value: process.env.NODE_ENV,
    required: true,
    validate: (v) =>
      ["development", "staging", "production"].includes(v)
        ? null
        : `Must be 'development', 'staging', or 'production' (got '${v}')`,
  },
  {
    name: "DATABASE_URL",
    value: process.env.DATABASE_URL,
    required: true,
    validate: (v) => {
      if (!v.startsWith("mysql://")) return "Must start with mysql://";
      if (
        process.env.NODE_ENV === "production" &&
        (v.includes("root:password@") || v.includes("password@localhost"))
      ) {
        return "Production DATABASE_URL appears to use a default/weak password";
      }
      return null;
    },
  },
  {
    name: "JWT_SECRET",
    value: process.env.JWT_SECRET,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production") {
        if (v.length < 64)
          return "Production JWT_SECRET must be at least 64 characters";
        if (v.includes("dev") || v.includes("change") || v.includes("not-for"))
          return "Production JWT_SECRET appears to be a placeholder value";
      }
      return null;
    },
  },
  {
    name: "JWT_REFRESH_SECRET",
    value: process.env.JWT_REFRESH_SECRET,
    required: true,
    validate: (v) => {
      if (v === process.env.JWT_SECRET)
        return "JWT_REFRESH_SECRET must differ from JWT_SECRET";
      if (process.env.NODE_ENV === "production" && v.length < 64)
        return "Production JWT_REFRESH_SECRET must be at least 64 characters";
      if (process.env.NODE_ENV === "production" && (v.includes("dev") || v.includes("change") || v.includes("not-for")))
        return "Production JWT_REFRESH_SECRET appears to be a placeholder value";
      return null;
    },
  },
  {
    name: "JWT_EXPIRES_IN",
    value: process.env.JWT_EXPIRES_IN,
    required: false,
    validate: (v) => {
      if (!/^\d+[smhd]$/.test(v))
        return "Must be a duration like '1h', '30m', '7d'";
      return null;
    },
  },
  {
    name: "JWT_REFRESH_EXPIRES_IN",
    value: process.env.JWT_REFRESH_EXPIRES_IN,
    required: false,
    validate: (v) => {
      if (!/^\d+[smhd]$/.test(v))
        return "Must be a duration like '7d', '30d'";
      return null;
    },
  },
  {
    name: "CCF_HMAC_SECRET",
    value: process.env.CCF_HMAC_SECRET,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production" && v.length < 32)
        return "Production HMAC secret should be at least 32 characters";
      if (
        process.env.NODE_ENV === "production" &&
        (v.includes("dev") || v.includes("change"))
      )
        return "Production HMAC secret appears to be a placeholder";
      return null;
    },
  },
  {
    name: "PORT",
    value: process.env.PORT,
    required: true,
    validate: (v) => {
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535)
        return "Must be a valid port number (1-65535)";
      return null;
    },
  },
  {
    name: "CORS_ORIGIN",
    value: process.env.CORS_ORIGIN,
    required: true,
    validate: (v) => {
      if (process.env.NODE_ENV === "production") {
        if (v === "*")
          return "Production CORS_ORIGIN cannot be wildcard '*'";
        if (v.includes("localhost"))
          return "Production CORS_ORIGIN must not include localhost";
        const origins = v.split(",").map((s) => s.trim());
        for (const origin of origins) {
          if (!origin.startsWith("https://"))
            return `Production CORS_ORIGIN must use HTTPS (found: '${origin}')`;
        }
      }
      return null;
    },
  },
  {
    name: "SMTP_HOST",
    value: process.env.SMTP_HOST,
    required: false,
  },
  {
    name: "SMTP_PORT",
    value: process.env.SMTP_PORT,
    required: false,
    validate: (v) => {
      const port = parseInt(v, 10);
      if (isNaN(port)) return "Must be a number";
      if (![25, 465, 587, 2525].includes(port))
        return `Unusual SMTP port ${port}. Expected 25, 465, 587, or 2525`;
      return null;
    },
  },
  {
    name: "PORTAL_URL",
    value: process.env.PORTAL_URL,
    required: false,
    validate: (v) => {
      if (
        process.env.NODE_ENV === "production" &&
        !v.startsWith("https://")
      )
        return "Production PORTAL_URL must use HTTPS";
      return null;
    },
  },
  {
    name: "EMAIL_TRANSPORT",
    value: process.env.USE_SENDMAIL || process.env.SMTP_USER || undefined,
    required: false,
    validate: () => {
      if (!process.env.USE_SENDMAIL && !process.env.SMTP_USER) {
        return "Neither USE_SENDMAIL nor SMTP_USER is set - no email transport configured";
      }
      return null;
    },
  },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

function maskValue(name: string, value: string): string {
  const sensitive =
    name.includes("SECRET") ||
    name.includes("PASSWORD") ||
    name.includes("PASS") ||
    name === "DATABASE_URL";

  if (!sensitive) return value;
  if (value.length <= 12) return "***";
  return value.substring(0, 8) + "..." + value.substring(value.length - 4);
}

function run(): void {
  const env = process.env.NODE_ENV || "unknown";

  console.log("");
  console.log("CCF Admin Portal - Environment Validation");
  console.log(`Environment: ${env}`);
  console.log("=".repeat(50));

  let errors = 0;
  let warnings = 0;

  for (const check of checks) {
    if (!check.value || check.value.trim() === "") {
      if (check.required) {
        console.log(`  FAIL  ${check.name}: Missing (required)`);
        errors++;
      } else {
        console.log(`  SKIP  ${check.name}: Not set (optional)`);
      }
      continue;
    }

    if (check.validate) {
      const error = check.validate(check.value);
      if (error) {
        // Treat validation failures on optional vars as warnings
        if (check.required) {
          console.log(`  FAIL  ${check.name}: ${error}`);
          errors++;
        } else {
          console.log(`  WARN  ${check.name}: ${error}`);
          warnings++;
        }
        continue;
      }
    }

    console.log(`  OK    ${check.name}: ${maskValue(check.name, check.value)}`);
  }

  console.log("=".repeat(50));

  if (errors > 0) {
    console.log(
      `\nFAILED: ${errors} error(s)${warnings > 0 ? `, ${warnings} warning(s)` : ""}. Fix before starting the server.\n`
    );
    process.exit(1);
  }

  if (warnings > 0) {
    console.log(`\nPASSED with ${warnings} warning(s).\n`);
  } else {
    console.log("\nPASSED: All environment checks OK.\n");
  }
}

run();
