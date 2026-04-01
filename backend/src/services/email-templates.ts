import { getPortalUrl } from "./email.js";

// ─── HTML escape helper (prevents XSS in email templates) ─────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Color constants ──────────────────────────────────────────────────────

const C = {
  blue: "#2563EB",
  darkBg: "#0f1117",
  outerBg: "#0a0c10",
  border: "#1e2433",
  infoBoxBg: "#161a24",
  heading: "#e4e7ec",
  body: "#9ca3af",
  muted: "#6b7280",
  white: "#ffffff",
  green: "#34d399",
  red: "#ef4444",
  amber: "#f59e0b",
} as const;

// Shared font stack (must be inlined on every element for email clients)
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', 'Fira Code', 'Courier New', monospace";

// Logo URL (hosted on the portal)
const LOGO_URL = "https://cyberchakra.online/logo.png";

/** Format ISO date string to human-readable format */
function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

// ─── Base template wrapper (table-based for email-client compatibility) ───

function wrapTemplate(content: string): string {
  const portalUrl = getPortalUrl();
  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Cyber Chakra Forensics</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${C.outerBg}; -webkit-text-size-adjust: none; -ms-text-size-adjust: none;">
  <!-- Outer wrapper for full-width background -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${C.outerBg};">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <!-- Content card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: ${C.darkBg}; border: 1px solid ${C.border}; border-radius: 8px;">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; border-bottom: 2px solid ${C.blue}; text-align: center;">
              <img src="${LOGO_URL}" alt="Cyber Chakra" width="56" height="56" style="display: block; margin: 0 auto 12px auto; border-radius: 12px;" />
              <h1 style="color: ${C.blue}; font-family: ${FONT}; font-size: 22px; margin: 0; letter-spacing: -0.3px; font-weight: 700;">Cyber Chakra Forensics</h1>
              <p style="color: ${C.muted}; font-family: ${FONT}; font-size: 12px; margin: 6px 0 0 0; letter-spacing: 1.5px; text-transform: uppercase;">Data Security is Our Supreme Duty</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px; font-family: ${FONT};">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px 24px 32px; border-top: 1px solid ${C.border}; text-align: center; font-family: ${FONT};">
              <p style="color: ${C.muted}; font-size: 12px; line-height: 1.5; margin: 0 0 4px 0;">This is an automated message from the CCF Admin Portal.</p>
              <p style="color: ${C.muted}; font-size: 12px; line-height: 1.5; margin: 0;">&copy; 2026 Cyber Chakra Technologies | <a href="${portalUrl}" style="color: ${C.blue}; text-decoration: none;">cyberchakra.online</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// ─── CTA button (table-based for Outlook compatibility) ───────────────────

function ctaButton(text: string, url: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="14%" strokecolor="${C.blue}" fillcolor="${C.blue}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">${text}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${url}" target="_blank" style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-family: ${FONT}; font-size: 14px; font-weight: 600; letter-spacing: 0.2px; mso-hide: all;">${text}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>`;
}

// ─── Info box (table-based) ───────────────────────────────────────────────

function infoBox(label: string, value: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.border}; border-radius: 6px; padding: 12px 16px;">
                    <span style="color: ${C.muted}; font-family: ${FONT}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
                    <div style="color: ${C.heading}; font-family: ${MONO}; font-size: 15px; margin-top: 4px; word-break: break-all;">${value}</div>
                  </td>
                </tr>
              </table>`;
}

// ─── Status badge ─────────────────────────────────────────────────────────

function statusBadge(text: string, bgColor: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; background-color: ${bgColor}; color: ${C.white}; font-family: ${FONT}; font-size: 13px; font-weight: 700; padding: 6px 18px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.8px;">${text}</span>
                  </td>
                </tr>
              </table>`;
}

// ─── Large number display ─────────────────────────────────────────────────

function bigNumber(value: string, label: string, color: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td align="center" style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.border}; border-radius: 8px; padding: 20px;">
                    <div style="color: ${color}; font-family: ${FONT}; font-size: 42px; font-weight: 800; line-height: 1;">${value}</div>
                    <div style="color: ${C.muted}; font-family: ${FONT}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px;">${label}</div>
                  </td>
                </tr>
              </table>`;
}

// ─── Quoted reply block ───────────────────────────────────────────────────

function quoteBlock(label: string, text: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border-left: 3px solid ${C.blue}; border-radius: 0 6px 6px 0; padding: 16px;">
                    <span style="color: ${C.muted}; font-family: ${FONT}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
                    <div style="color: ${C.heading}; font-family: ${FONT}; font-size: 14px; line-height: 1.6; margin-top: 8px; white-space: pre-line;">${text}</div>
                  </td>
                </tr>
              </table>`;
}

// ─── Shared paragraph style ───────────────────────────────────────────────

function p(html: string, opts?: { size?: number; color?: string; align?: string; margin?: string }): string {
  const size = opts?.size ?? 14;
  const color = opts?.color ?? C.body;
  const align = opts?.align ?? "left";
  const margin = opts?.margin ?? "0 0 8px 0";
  return `<p style="color: ${color}; font-family: ${FONT}; font-size: ${size}px; line-height: 1.6; margin: ${margin}; text-align: ${align};">${html}</p>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// ─── Trial Approved ────────────────────────────────────────────────────────

export function trialApprovedEmail(
  name: string,
  licenseKey: string,
  expiresAt: string,
): { subject: string; html: string } {
  const subject = "\u{1F389} Trial Approved - Cyber Chakra Forensics";
  const friendlyDate = formatDate(expiresAt);
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">\u{1F389} Trial Approved!</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p(`Great news! Your trial request has been <strong style="color: ${C.green};">approved</strong>. You now have full access to Cyber Chakra Forensics Suite.`, { margin: "0 0 20px 0" })}
              ${statusBadge("\u2713 Approved", C.green)}
              ${infoBox("\u{1F511} Your License Key", licenseKey)}
              ${infoBox("\u{1F4C5} Valid Until", friendlyDate)}

              <!-- Getting Started Steps -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, ${C.infoBoxBg}, ${C.darkBg}); border: 1px solid ${C.border}; border-radius: 8px; padding: 20px;">
                    <p style="color: ${C.heading}; font-family: ${FONT}; font-size: 15px; font-weight: 700; margin: 0 0 16px 0;">\u{1F680} Getting Started</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">1</span>
                          <strong style="color: ${C.heading};">Download</strong> the CCF installer for your platform
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">2</span>
                          <strong style="color: ${C.heading};">Install</strong> and launch Cyber Chakra Forensics
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">3</span>
                          <strong style="color: ${C.heading};">Enter your license key</strong> during the onboarding wizard
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${ctaButton("\u{2B07}\u{FE0F} Download CCF", portalUrl + "/downloads")}

              ${p(`Or copy your license key and enter it in the app:`, { size: 13, color: C.muted, margin: "0 0 4px 0", align: "center" })}
              ${p(`<code style="background: ${C.infoBoxBg}; border: 1px solid ${C.border}; padding: 4px 12px; border-radius: 4px; font-family: ${MONO}; font-size: 14px; color: ${C.heading}; letter-spacing: 1px;">${escapeHtml(licenseKey)}</code>`, { align: "center", margin: "0 0 16px 0" })}

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>

              ${p(`Need help? Reply to this email or contact <a href="mailto:support@cyberchakra.in" style="color: ${C.blue}; text-decoration: none;">support@cyberchakra.in</a>`, { size: 12, color: C.muted, align: "center" })}
  `);
  return { subject, html };
}

// ─── Trial Rejected ────────────────────────────────────────────────────────

export function trialRejectedEmail(
  name: string,
  reason: string,
): { subject: string; html: string } {
  const subject = "Cyber Chakra Forensics - Trial Request Update";
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">Trial Request Update</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p("Thank you for your interest in Cyber Chakra Forensics. After reviewing your trial request, we were unable to approve it at this time.", { margin: "0 0 20px 0" })}
              ${statusBadge("Not Approved", C.red)}
              ${infoBox("Reason", escapeHtml(reason))}
              ${p("This isn't necessarily final! If your circumstances have changed or you believe this was an error, you're welcome to submit a new request from the CCF application.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("\u{2709}\u{FE0F} Contact Support", "mailto:support@cyberchakra.in")}
  `);
  return { subject, html };
}

// ─── Trial Submitted (Confirmation to User) ──────────────────────────────

export function trialSubmittedEmail(
  name: string,
  organization: string,
  email: string,
): { subject: string; html: string } {
  const subject = "We've received your trial request - Cyber Chakra Forensics";
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">Trial Request Received</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p("Thank you for your interest in Cyber Chakra Forensics! We've received your trial request and our team is currently reviewing it.", { margin: "0 0 20px 0" })}
              ${infoBox("Organization", escapeHtml(organization))}

              <!-- What happens next -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, ${C.infoBoxBg}, ${C.darkBg}); border: 1px solid ${C.border}; border-radius: 8px; padding: 20px;">
                    <p style="color: ${C.heading}; font-family: ${FONT}; font-size: 15px; font-weight: 700; margin: 0 0 16px 0;">What happens next?</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">1</span>
                          <strong style="color: ${C.heading};">We review your request</strong> (typically 24&ndash;48 hours)
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">2</span>
                          <strong style="color: ${C.heading};">You'll receive an email</strong> with the decision
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">3</span>
                          <strong style="color: ${C.heading};">If approved,</strong> you'll get a license key + download link
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${p("Sit tight! We'll be in touch soon.", { size: 14, color: C.heading, margin: "0 0 16px 0" })}
              ${ctaButton("Check Status", portalUrl)}

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>

              ${p(`Questions? Reach out to <a href="mailto:support@cyberchakra.in" style="color: ${C.blue}; text-decoration: none;">support@cyberchakra.in</a>`, { size: 12, color: C.muted, align: "center" })}
  `);
  return { subject, html };
}

// ─── License Expiry Warning ────────────────────────────────────────────────

export function licenseExpiryWarningEmail(
  orgName: string,
  licenseKey: string,
  daysRemaining: number,
): { subject: string; html: string } {
  const urgencyColor = daysRemaining <= 3 ? C.red : C.amber;
  const subject = `\u{23F0} License Expiring in ${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} - Cyber Chakra Forensics`;
  const html = wrapTemplate(`
              <h2 style="color: ${urgencyColor}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">License Expiring Soon</h2>
              ${p(`The license for <strong style="color: ${C.heading};">${escapeHtml(orgName)}</strong> will expire soon. Please renew to avoid any service interruption.`, { margin: "0 0 20px 0" })}
              ${bigNumber(String(daysRemaining), `day${daysRemaining === 1 ? "" : "s"} remaining`, urgencyColor)}
              ${infoBox("License Key", licenseKey)}
              ${p("Contact your administrator or reach out to the CCF team to renew your license before it expires.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("Renew License", `${getPortalUrl()}/licenses`)}
  `);
  return { subject, html };
}

// ─── License Expired ───────────────────────────────────────────────────────

export function licenseExpiredEmail(
  orgName: string,
  licenseKey: string,
): { subject: string; html: string } {
  const subject = "\u{1F6A8} License Expired - Action Required - Cyber Chakra Forensics";
  const html = wrapTemplate(`
              <h2 style="color: ${C.red}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">License Expired</h2>
              ${p(`The license for <strong style="color: ${C.heading};">${escapeHtml(orgName)}</strong> has <strong style="color: ${C.red};">expired</strong>. The associated CCF installations will no longer be able to perform forensic operations.`, { margin: "0 0 20px 0" })}
              ${statusBadge("Expired", C.red)}
              ${infoBox("License Key", licenseKey)}
              ${p("To restore access, please renew your license immediately. All existing case data remains intact and will be accessible once the license is renewed.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("Renew Now", `${getPortalUrl()}/licenses`)}
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
  const subject = `Cyber Chakra Forensics ${version} - ${title}`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">New Release Available</h2>
              ${p("A new version of Cyber Chakra Forensics is available for download.", { margin: "0 0 20px 0" })}
              ${statusBadge(`v${version}`, C.blue)}
              ${infoBox("Version", version)}
              ${infoBox("Release Title", title)}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.border}; border-radius: 6px; padding: 16px;">
                    <span style="color: ${C.muted}; font-family: ${FONT}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Release Notes</span>
                    <div style="color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6; margin-top: 8px; white-space: pre-line;">${releaseNotes}</div>
                  </td>
                </tr>
              </table>
              ${ctaButton("Download Update", downloadUrl)}
              ${p("Updates can also be installed from within the CCF desktop application.", { size: 12, color: C.muted, align: "center", margin: "8px 0 0 0" })}
  `);
  return { subject, html };
}

// ─── Welcome Email ─────────────────────────────────────────────────────────

export function welcomeEmail(
  name: string,
  orgName: string,
): { subject: string; html: string } {
  const subject = "\u{1F44B} Welcome to Cyber Chakra Forensics";
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">\u{1F44B} Welcome Aboard!</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p(`Welcome to Cyber Chakra Forensics! Your organization <strong style="color: ${C.blue};">${escapeHtml(orgName)}</strong> has been set up successfully.`, { margin: "0 0 20px 0" })}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.border}; border-radius: 6px; padding: 16px;">
                    <p style="color: ${C.heading}; font-family: ${FONT}; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">Getting Started</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr><td style="padding: 6px 0; color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6;"><strong style="color: ${C.blue};">1.</strong>&nbsp; Install the CCF desktop application</td></tr>
                      <tr><td style="padding: 6px 0; color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6;"><strong style="color: ${C.blue};">2.</strong>&nbsp; Activate your license key when prompted</td></tr>
                      <tr><td style="padding: 6px 0; color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6;"><strong style="color: ${C.blue};">3.</strong>&nbsp; Connect your target device via USB</td></tr>
                      <tr><td style="padding: 6px 0; color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6;"><strong style="color: ${C.blue};">4.</strong>&nbsp; Create a case and begin forensic acquisition</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              ${p("If you need assistance, use the in-app support system to raise a ticket. Our team is here to help.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("Visit Portal", getPortalUrl())}
  `);
  return { subject, html };
}

// ─── Ticket Reply Notification ─────────────────────────────────────────────

export function ticketReplyEmail(
  ticketNumber: string,
  ticketSubject: string,
  replyMessage: string,
): { subject: string; html: string } {
  const previewLimit = 500;
  const truncatedReply =
    replyMessage.length > previewLimit
      ? replyMessage.substring(0, previewLimit) + "..."
      : replyMessage;

  const subject = `Re: [${ticketNumber}] ${ticketSubject}`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">New Reply on Your Ticket</h2>
              ${p("There is a new reply on your support ticket.", { margin: "0 0 20px 0" })}
              ${infoBox("Ticket", `${ticketNumber} &mdash; ${ticketSubject}`)}
              ${quoteBlock("Reply Preview", truncatedReply)}
              ${p("View the full conversation and reply from the portal or the CCF desktop application.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("View Ticket", `${getPortalUrl()}/tickets`)}
  `);
  return { subject, html };
}

// ─── License Activated Alert (Admin) ───────────────────────────────────────

export function licenseActivatedAlertEmail(
  licenseKey: string,
  machineName: string,
  osInfo: string,
): { subject: string; html: string } {
  const subject = `Cyber Chakra Forensics - License Activated: ${licenseKey.substring(0, 12)}...`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.green}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">License Activated</h2>
              ${p("A license has just been activated on a new machine.", { margin: "0 0 20px 0" })}
              ${statusBadge("Activated", C.green)}
              ${infoBox("License Key", licenseKey)}
              ${infoBox("Machine Name", machineName)}
              ${infoBox("Operating System", osInfo)}
              ${p("This is an automated notification. No action is required unless this activation is unexpected.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("View Licenses", `${getPortalUrl()}/licenses`)}
  `);
  return { subject, html };
}

// ─── License Suspended Notification ────────────────────────────────────────

export function licenseSuspendedEmail(
  orgName: string,
  licenseKey: string,
  reason: string | null,
): { subject: string; html: string } {
  const subject = `Cyber Chakra Forensics - License Suspended: ${licenseKey.substring(0, 12)}...`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.amber}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">License Suspended</h2>
              ${p(`A license associated with <strong style="color: ${C.heading};">${escapeHtml(orgName)}</strong> has been <strong style="color: ${C.amber};">suspended</strong>. Active installations using this license may be unable to perform forensic operations until the suspension is lifted.`, { margin: "0 0 20px 0" })}
              ${statusBadge("Suspended", C.amber)}
              ${infoBox("License Key", licenseKey)}
              ${reason ? infoBox("Reason", escapeHtml(reason)) : ""}
              ${p("If you believe this was in error, please contact the CCF administration team for assistance.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("Contact Support", "mailto:support@cyberchakra.in")}
  `);
  return { subject, html };
}

// ─── Ticket Confirmation (User) ────────────────────────────────────────────

export function ticketConfirmationEmail(
  ticketNumber: string,
  subject: string,
): { subject: string; html: string } {
  const emailSubject = `Cyber Chakra Forensics - Ticket Created: ${ticketNumber}`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">Ticket Created</h2>
              ${p("Your support ticket has been created successfully. Our team will review it and respond as soon as possible.", { margin: "0 0 20px 0" })}
              ${statusBadge("Open", C.blue)}
              ${infoBox("Ticket Number", ticketNumber)}
              ${infoBox("Subject", subject)}
              ${p("You can check the status of your ticket and view replies from the portal or the CCF desktop application.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("View Ticket", `${getPortalUrl()}/tickets`)}
  `);
  return { subject: emailSubject, html };
}

// ─── Ticket Reply Notification (User) ──────────────────────────────────────

export function ticketReplyNotificationEmail(
  ticketNumber: string,
  replyPreview: string,
): { subject: string; html: string } {
  const previewLimit = 300;
  const truncated =
    replyPreview.length > previewLimit
      ? replyPreview.substring(0, previewLimit) + "..."
      : replyPreview;

  const subject = `Cyber Chakra Forensics - New Reply on Ticket ${ticketNumber}`;
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">You Have a New Reply</h2>
              ${p(`The support team has replied to your ticket <strong style="color: ${C.blue};">${ticketNumber}</strong>.`, { margin: "0 0 20px 0" })}
              ${quoteBlock("Reply Preview", truncated)}
              ${p("Open the portal or the CCF desktop application to view the full reply and respond.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("View Ticket", `${getPortalUrl()}/tickets`)}
  `);
  return { subject, html };
}

// ─── License Renewed Confirmation ─────────────────────────────────────────

export function licenseRenewedEmail(
  orgName: string,
  licenseKey: string,
  newExpiresAt: string,
): { subject: string; html: string } {
  const subject = "License Renewed - Cyber Chakra Forensics";
  const friendlyDate = formatDate(newExpiresAt);
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.green}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">License Renewed Successfully!</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(orgName)}</strong>,`)}
              ${p(`Great news! Your Cyber Chakra Forensics license has been <strong style="color: ${C.green};">renewed</strong>. You can continue using the full suite of forensic tools without interruption.`, { margin: "0 0 20px 0" })}
              ${statusBadge("\u2713 Renewed", C.green)}
              ${infoBox("\u{1F511} License Key", licenseKey)}
              ${infoBox("\u{1F4C5} New Expiry Date", friendlyDate)}
              ${p("Thank you for continuing to trust Cyber Chakra Forensics for your digital forensic needs. Your existing case data and configurations remain fully intact.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("View License", `${portalUrl}/licenses`)}

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>

              ${p(`Need help? Reply to this email or contact <a href="mailto:support@cyberchakra.in" style="color: ${C.blue}; text-decoration: none;">support@cyberchakra.in</a>`, { size: 12, color: C.muted, align: "center" })}
  `);
  return { subject, html };
}

// ─── Password Changed Confirmation ────────────────────────────────────────

export function passwordChangedEmail(
  name: string,
  ipAddress: string,
): { subject: string; html: string } {
  const subject = "Password Changed - Cyber Chakra Admin Portal";
  const timestamp = new Date().toLocaleString("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">Password Changed</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p("Your admin portal password has been changed successfully.", { margin: "0 0 20px 0" })}
              ${statusBadge("Password Updated", C.green)}
              ${infoBox("IP Address", escapeHtml(ipAddress))}
              ${infoBox("Changed At", timestamp)}
              ${p(`All active sessions have been invalidated for your security. You will need to log in again with your new password.`, { size: 13, margin: "16px 0 0 0" })}

              <!-- Security Warning -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border-left: 3px solid ${C.red}; border-radius: 0 6px 6px 0; padding: 16px;">
                    <p style="color: ${C.red}; font-family: ${FONT}; font-size: 13px; font-weight: 700; margin: 0 0 4px 0;">Security Notice</p>
                    <p style="color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6; margin: 0;">If you didn't make this change, contact support immediately at <a href="mailto:support@cyberchakra.in" style="color: ${C.blue}; text-decoration: none;">support@cyberchakra.in</a></p>
                  </td>
                </tr>
              </table>

              ${ctaButton("Log In", portalUrl)}
  `);
  return { subject, html };
}

// ─── Admin Welcome Email ──────────────────────────────────────────────────

export function adminWelcomeEmail(
  name: string,
  email: string,
  role: string,
  tempPassword: string,
): { subject: string; html: string } {
  const subject = "Welcome to Cyber Chakra Admin Portal";
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.heading}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">Welcome to the Admin Portal</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p("Your admin account has been created on the Cyber Chakra Admin Portal. You can now log in and start managing the platform.", { margin: "0 0 20px 0" })}
              ${statusBadge(escapeHtml(role.replace(/_/g, " ")), C.blue)}
              ${infoBox("Login Email", escapeHtml(email))}
              ${infoBox("Temporary Password", escapeHtml(tempPassword))}

              <!-- Warning -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 12px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.amber}; border-radius: 6px; padding: 12px 16px;">
                    <span style="color: ${C.amber}; font-family: ${FONT}; font-size: 13px; font-weight: 700;">&#9888; Important:</span>
                    <span style="color: ${C.body}; font-family: ${FONT}; font-size: 13px;"> Change your password immediately after your first login.</span>
                  </td>
                </tr>
              </table>

              <!-- Getting Started Steps -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, ${C.infoBoxBg}, ${C.darkBg}); border: 1px solid ${C.border}; border-radius: 8px; padding: 20px;">
                    <p style="color: ${C.heading}; font-family: ${FONT}; font-size: 15px; font-weight: 700; margin: 0 0 16px 0;">Getting Started</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">1</span>
                          <strong style="color: ${C.heading};">Log in</strong> at the admin portal using your credentials above
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">2</span>
                          <strong style="color: ${C.heading};">Change your password</strong> from your account settings
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${C.body}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">
                          <span style="display: inline-block; background-color: ${C.blue}; color: ${C.white}; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-size: 12px; font-weight: 700; margin-right: 10px;">3</span>
                          <strong style="color: ${C.heading};">Enable MFA</strong> for additional account security
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>
              ${p(`<strong style="color: ${C.amber};">Security Notice:</strong> Change your password on first login. Do not share your credentials with anyone.`, { size: 13, color: C.muted, align: "center" })}

              ${ctaButton("Log In Now", portalUrl)}
  `);
  return { subject, html };
}

// ─── MFA Enabled Notification ─────────────────────────────────────────────

export function mfaEnabledEmail(
  name: string,
): { subject: string; html: string } {
  const subject = "MFA Enabled - Cyber Chakra Admin Portal";
  const html = wrapTemplate(`
              <h2 style="color: ${C.green}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">&#x1F6E1;&#xFE0F; MFA Enabled</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p(`Multi-factor authentication has been <strong style="color: ${C.green};">enabled</strong> on your Cyber Chakra Admin Portal account.`, { margin: "0 0 20px 0" })}
              ${statusBadge("\u2713 MFA Active", C.green)}

              <!-- Recovery codes reminder -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td style="background-color: ${C.infoBoxBg}; border: 1px solid ${C.border}; border-radius: 8px; padding: 20px;">
                    <p style="color: ${C.heading}; font-family: ${FONT}; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">&#x1F511; Keep Your Recovery Codes Safe</p>
                    <p style="color: ${C.body}; font-family: ${FONT}; font-size: 13px; line-height: 1.6; margin: 0;">If you saved recovery codes during setup, store them in a secure location. You will need them to access your account if you lose your authenticator device.</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>

              ${p(`<strong style="color: ${C.red};">Didn't enable this?</strong> If you did not make this change, contact support immediately &mdash; your account may be compromised.`, { size: 13, margin: "0 0 8px 0" })}
              ${ctaButton("\u2709\uFE0F Contact Support", "mailto:support@cyberchakra.in")}
  `);
  return { subject, html };
}

// ─── MFA Disabled Notification ────────────────────────────────────────────

export function mfaDisabledEmail(
  name: string,
  ipAddress: string,
): { subject: string; html: string } {
  const subject = "\u26A0\uFE0F MFA Disabled - Cyber Chakra Admin Portal";
  const portalUrl = getPortalUrl();
  const html = wrapTemplate(`
              <h2 style="color: ${C.amber}; font-family: ${FONT}; font-size: 20px; margin: 0 0 12px 0; text-align: center;">\u26A0\uFE0F MFA Disabled</h2>
              ${p(`Hello <strong style="color: ${C.heading};">${escapeHtml(name)}</strong>,`)}
              ${p(`Multi-factor authentication has been <strong style="color: ${C.amber};">disabled</strong> on your Cyber Chakra Admin Portal account. Your account is now protected by password only.`, { margin: "0 0 20px 0" })}
              ${statusBadge("MFA Removed", C.amber)}
              ${infoBox("IP Address", escapeHtml(ipAddress))}

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 16px 0;"><tr><td style="border-top: 1px solid ${C.border};"></td></tr></table>

              ${p(`<strong style="color: ${C.red};">Didn't disable this?</strong> Your account may be compromised. Change your password immediately and re-enable MFA.`, { size: 13, margin: "0 0 8px 0" })}
              ${ctaButton("Change Password", portalUrl + "/settings")}

              ${p(`If you need further assistance, contact <a href="mailto:support@cyberchakra.in" style="color: ${C.blue}; text-decoration: none;">support@cyberchakra.in</a>`, { size: 12, color: C.muted, align: "center" })}
  `);
  return { subject, html };
}

// ─── License Revoked Notification ──────────────────────────────────────────

export function licenseRevokedEmail(
  orgName: string,
  licenseKey: string,
  reason: string | null,
): { subject: string; html: string } {
  const subject = "Cyber Chakra Forensics - License Revoked";
  const html = wrapTemplate(`
              <h2 style="color: ${C.red}; font-family: ${FONT}; font-size: 18px; margin: 0 0 12px 0;">License Revoked</h2>
              ${p(`A license associated with <strong style="color: ${C.heading};">${escapeHtml(orgName)}</strong> has been <strong style="color: ${C.red};">revoked</strong>. All active installations using this license have been deactivated.`, { margin: "0 0 20px 0" })}
              ${statusBadge("Revoked", C.red)}
              ${infoBox("License Key", licenseKey)}
              ${reason ? infoBox("Reason", escapeHtml(reason)) : ""}
              ${p("If you believe this was in error, please contact the CCF administration team immediately.", { size: 13, margin: "16px 0 0 0" })}
              ${ctaButton("Contact Support", "mailto:support@cyberchakra.in")}
  `);
  return { subject, html };
}
