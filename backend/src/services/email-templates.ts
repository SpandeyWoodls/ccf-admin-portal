import { PORTAL_URL } from "./email.js";

// ─── Base template wrapper with CCF branding ───────────────────────────────

function wrapTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin: 0; padding: 0; background: #0a0c10;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1117; color: #e4e7ec; padding: 32px; border: 1px solid #1e2433; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #1e2433;">
      <h1 style="color: #4d8ce8; font-size: 22px; margin: 0; letter-spacing: -0.3px;">Cyber Chakra Forensics</h1>
      <p style="color: #6b7280; font-size: 12px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Admin Portal</p>
    </div>
    ${content}
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #1e2433; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0 0 4px 0;">This is an automated message from CCF Admin Portal</p>
      <p style="margin: 0;">&copy; 2026 Cyber Chakra Digital Forensics</p>
    </div>
  </div>
</body>
</html>`.trim();
}

// ─── CTA button helper ─────────────────────────────────────────────────────

function ctaButton(text: string, url: string): string {
  return `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #4d8ce8; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; letter-spacing: 0.2px;">${text}</a>
    </div>`;
}

// ─── Info box helper ───────────────────────────────────────────────────────

function infoBox(label: string, value: string): string {
  return `
    <div style="background: #161a24; border: 1px solid #1e2433; border-radius: 6px; padding: 12px 16px; margin: 8px 0;">
      <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
      <div style="color: #e4e7ec; font-size: 15px; margin-top: 4px; font-family: 'SF Mono', 'Fira Code', monospace; word-break: break-all;">${value}</div>
    </div>`;
}

// ─── Trial Approved ────────────────────────────────────────────────────────

export function trialApprovedEmail(
  name: string,
  licenseKey: string,
  expiresAt: string,
): { subject: string; html: string } {
  const subject = "Your CCF Trial Has Been Approved";
  const html = wrapTemplate(`
    <h2 style="color: #e4e7ec; font-size: 18px; margin: 0 0 12px 0;">Trial Approved</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      Hello <strong style="color: #e4e7ec;">${name}</strong>,<br /><br />
      Your trial request for Cyber Chakra Forensics has been reviewed and <span style="color: #34d399; font-weight: 600;">approved</span>. Your license key is ready to use.
    </p>
    ${infoBox("License Key", licenseKey)}
    ${infoBox("Valid Until", expiresAt)}
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      Open the CCF desktop application and enter your license key to activate. If you have questions, reach out via the in-app support system.
    </p>
  `);
  return { subject, html };
}

// ─── Trial Rejected ────────────────────────────────────────────────────────

export function trialRejectedEmail(
  name: string,
  reason: string,
): { subject: string; html: string } {
  const subject = "CCF Trial Request Update";
  const html = wrapTemplate(`
    <h2 style="color: #e4e7ec; font-size: 18px; margin: 0 0 12px 0;">Trial Request Update</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      Hello <strong style="color: #e4e7ec;">${name}</strong>,<br /><br />
      Thank you for your interest in Cyber Chakra Forensics. After reviewing your trial request, we were unable to approve it at this time.
    </p>
    ${infoBox("Reason", reason)}
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      If you believe this was in error, or if your circumstances have changed, you are welcome to submit a new trial request. For questions, please contact our team.
    </p>
    ${ctaButton("Contact Support", `mailto:support@cyberchakra.in`)}
  `);
  return { subject, html };
}

// ─── License Expiry Warning ────────────────────────────────────────────────

export function licenseExpiryWarningEmail(
  orgName: string,
  licenseKey: string,
  daysRemaining: number,
): { subject: string; html: string } {
  const urgencyColor = daysRemaining <= 3 ? "#ef4444" : daysRemaining <= 7 ? "#f59e0b" : "#f59e0b";
  const subject = `License Expiring in ${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} - Action Required`;
  const html = wrapTemplate(`
    <h2 style="color: ${urgencyColor}; font-size: 18px; margin: 0 0 12px 0;">License Expiring Soon</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      The license for <strong style="color: #e4e7ec;">${orgName}</strong> will expire in <strong style="color: ${urgencyColor};">${daysRemaining} day${daysRemaining === 1 ? "" : "s"}</strong>. Please renew to avoid any service interruption.
    </p>
    ${infoBox("License Key", licenseKey)}
    ${infoBox("Days Remaining", String(daysRemaining))}
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      Contact your administrator or reach out to the CCF team to renew your license before it expires.
    </p>
    ${ctaButton("Renew License", `${PORTAL_URL}/licenses`)}
  `);
  return { subject, html };
}

// ─── License Expired ───────────────────────────────────────────────────────

export function licenseExpiredEmail(
  orgName: string,
  licenseKey: string,
): { subject: string; html: string } {
  const subject = "License Expired - Immediate Action Required";
  const html = wrapTemplate(`
    <h2 style="color: #ef4444; font-size: 18px; margin: 0 0 12px 0;">License Expired</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      The license for <strong style="color: #e4e7ec;">${orgName}</strong> has expired. The associated CCF installations will no longer be able to perform forensic operations.
    </p>
    ${infoBox("License Key", licenseKey)}
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      To restore access, please renew your license immediately. All existing case data remains intact and will be accessible once the license is renewed.
    </p>
    ${ctaButton("Renew Now", `${PORTAL_URL}/licenses`)}
  `);
  return { subject, html };
}

// ─── New Release ───────────────────────────────────────────────────────────

export function newReleaseEmail(
  version: string,
  title: string,
  releaseNotes: string,
  downloadUrl: string,
): { subject: string; html: string } {
  const subject = `CCF ${version} Released - ${title}`;
  const html = wrapTemplate(`
    <h2 style="color: #e4e7ec; font-size: 18px; margin: 0 0 12px 0;">New Release Available</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      A new version of Cyber Chakra Forensics is available.
    </p>
    ${infoBox("Version", version)}
    ${infoBox("Title", title)}
    <div style="background: #161a24; border: 1px solid #1e2433; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Release Notes</span>
      <div style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin-top: 8px; white-space: pre-line;">${releaseNotes}</div>
    </div>
    ${ctaButton("Download Update", downloadUrl)}
    <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 16px 0 0 0; text-align: center;">
      Updates can also be installed from within the CCF desktop application.
    </p>
  `);
  return { subject, html };
}

// ─── Welcome Email ─────────────────────────────────────────────────────────

export function welcomeEmail(
  name: string,
  orgName: string,
): { subject: string; html: string } {
  const subject = "Welcome to Cyber Chakra Forensics";
  const html = wrapTemplate(`
    <h2 style="color: #e4e7ec; font-size: 18px; margin: 0 0 12px 0;">Welcome Aboard</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      Hello <strong style="color: #e4e7ec;">${name}</strong>,<br /><br />
      Welcome to Cyber Chakra Forensics! Your organization <strong style="color: #4d8ce8;">${orgName}</strong> has been set up successfully.
    </p>
    <div style="background: #161a24; border: 1px solid #1e2433; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="color: #9ca3af; font-size: 13px; line-height: 1.8; margin: 0;">
        <strong style="color: #e4e7ec;">Getting Started:</strong><br />
        1. Install the CCF desktop application<br />
        2. Activate your license key when prompted<br />
        3. Connect your target device via USB<br />
        4. Create a case and begin forensic acquisition
      </p>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      If you need assistance, use the in-app support system to raise a ticket. Our team is here to help.
    </p>
    ${ctaButton("Open Admin Portal", PORTAL_URL)}
  `);
  return { subject, html };
}

// ─── Ticket Reply Notification ─────────────────────────────────────────────

export function ticketReplyEmail(
  ticketNumber: string,
  ticketSubject: string,
  replyMessage: string,
): { subject: string; html: string } {
  const subject = `Re: [${ticketNumber}] ${ticketSubject}`;
  const html = wrapTemplate(`
    <h2 style="color: #e4e7ec; font-size: 18px; margin: 0 0 12px 0;">New Reply on Your Ticket</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      There is a new reply on your support ticket.
    </p>
    ${infoBox("Ticket", `${ticketNumber} - ${ticketSubject}`)}
    <div style="background: #161a24; border-left: 3px solid #4d8ce8; border-radius: 0 6px 6px 0; padding: 16px; margin: 16px 0;">
      <span style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Reply</span>
      <div style="color: #e4e7ec; font-size: 14px; line-height: 1.6; margin-top: 8px; white-space: pre-line;">${replyMessage}</div>
    </div>
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      You can view the full conversation and reply from within the CCF desktop application.
    </p>
  `);
  return { subject, html };
}

// ─── License Revoked Notification ──────────────────────────────────────────

export function licenseRevokedEmail(
  orgName: string,
  licenseKey: string,
  reason: string | null,
): { subject: string; html: string } {
  const subject = "License Revoked - CCF Admin Portal";
  const html = wrapTemplate(`
    <h2 style="color: #ef4444; font-size: 18px; margin: 0 0 12px 0;">License Revoked</h2>
    <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      A license associated with <strong style="color: #e4e7ec;">${orgName}</strong> has been revoked. All active installations using this license have been deactivated.
    </p>
    ${infoBox("License Key", licenseKey)}
    ${reason ? infoBox("Reason", reason) : ""}
    <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
      If you believe this was in error, please contact the CCF administration team immediately.
    </p>
    ${ctaButton("Contact Support", `mailto:support@cyberchakra.in`)}
  `);
  return { subject, html };
}
