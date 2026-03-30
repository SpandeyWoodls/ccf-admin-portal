import nodemailer from "nodemailer";

// ─── SMTP Configuration from environment variables ─────────────────────────
// Priority: SMTP credentials > sendmail binary > console-only fallback
//
// NOTE: Transporter is created lazily (on first sendEmail call) because
// ES module imports are hoisted above dotenv.config() in index.ts,
// so process.env is not yet populated at module load time.

let _transporter: nodemailer.Transporter | null | undefined;
let _fromEmail: string | undefined;
let _portalUrl: string | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;

  // Option 1: Full SMTP configuration (Gmail, SES, etc.)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log("[Email] Using SMTP transport");
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return _transporter;
  }

  // Option 2: Local sendmail binary (available on Hostinger VPS)
  if (process.env.USE_SENDMAIL === "true") {
    console.log("[Email] Using sendmail transport");
    _transporter = nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail",
    });
    return _transporter;
  }

  // Option 3: No transport configured -- will log only
  console.log("[Email] No email transport configured (set SMTP_USER/SMTP_PASS or USE_SENDMAIL=true)");
  _transporter = null;
  return null;
}

function getFromEmail(): string {
  if (!_fromEmail) _fromEmail = process.env.SMTP_FROM || "noreply@cyberchakra.online";
  return _fromEmail;
}

export function getPortalUrl(): string {
  if (!_portalUrl) _portalUrl = process.env.PORTAL_URL || "https://cyberchakra.online";
  return _portalUrl;
}

// Keep backward-compatible named export
export const PORTAL_URL = "https://cyberchakra.online"; // default; callers should prefer getPortalUrl()

// ─── Send email utility ────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[Email] No transport configured. Would send to ${to}: ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Cyber Chakra Forensics" <${getFromEmail()}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error);
  }
}
