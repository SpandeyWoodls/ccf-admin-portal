import nodemailer from "nodemailer";

// ─── SMTP Configuration from environment variables ─────────────────────────
// Priority: SMTP credentials > sendmail binary > console-only fallback

function createTransporter(): nodemailer.Transporter {
  // Option 1: Full SMTP configuration (Gmail, SES, etc.)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log("[Email] Using SMTP transport");
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Option 2: Local sendmail binary (available on Hostinger VPS)
  if (process.env.USE_SENDMAIL === "true") {
    console.log("[Email] Using sendmail transport");
    return nodemailer.createTransport({
      sendmail: true,
      newline: "unix",
      path: process.env.SENDMAIL_PATH || "/usr/sbin/sendmail",
    });
  }

  // Option 3: No transport configured -- will log only
  console.log("[Email] No email transport configured (set SMTP_USER/SMTP_PASS or USE_SENDMAIL=true)");
  return null as unknown as nodemailer.Transporter;
}

const transporter = createTransporter();

const FROM_EMAIL = process.env.SMTP_FROM || "noreply@cyberchakra.online";
const PORTAL_URL = process.env.PORTAL_URL || "https://cyberchakra.online";

// ─── Send email utility ────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.log(`[Email] No transport configured. Would send to ${to}: ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Cyber Chakra Forensics" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error);
  }
}

export { PORTAL_URL };
