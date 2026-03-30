import nodemailer from "nodemailer";

// ─── SMTP Configuration from environment variables ─────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = process.env.SMTP_FROM || "noreply@cyberchakra.in";
const PORTAL_URL = process.env.PORTAL_URL || "https://cyberchakra.online";

// ─── Send email utility ────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.SMTP_USER) {
    console.log(`[Email] SMTP not configured. Would send to ${to}: ${subject}`);
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
