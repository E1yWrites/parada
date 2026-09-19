import type { MailMessage } from "./mailer";

/**
 * PARADA transactional mail. Every message ships a plain-text body (what the
 * console/memory transports show, and what tests read the code from) and a
 * matching HTML body for real inboxes. Copy is deliberately short: one code
 * or link, how long it lasts, and what to do if the mail was not expected.
 */
export interface MailBrand {
  /** Product name, e.g. "PARADA". */
  appName: string;
  /** Establishment shown in the footer, e.g. "LPU-Batangas Main Campus". */
  organization: string;
}

const BRAND_BLUE = "#1E5EFF";
const INK = "#0F1B2D";
const MUTED = "#5B6B82";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** Shared HTML shell: brand header, body, footer. Inline styles only (mail clients). */
function layout(brand: MailBrand, title: string, bodyHtml: string, footerNote: string): string {
  const app = escapeHtml(brand.appName);
  const org = escapeHtml(brand.organization);
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#F3F6FB;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F6FB;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E3E9F2;">
        <tr><td style="background:${BRAND_BLUE};padding:20px 28px;">
          <span style="display:inline-block;font-size:20px;font-weight:800;letter-spacing:0.12em;color:#FFFFFF;">${app}</span>
          <span style="display:block;margin-top:4px;font-size:12px;color:rgba(255,255,255,0.85);">Zone-based smart parking · ${org}</span>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:800;color:${INK};">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(footerNote)}</p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${app} for ${org}. This is an automated message — replies are not monitored.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<p style="margin:16px 0;text-align:center;">
    <span style="display:inline-block;padding:14px 22px;border-radius:12px;background:#EEF3FF;color:${BRAND_BLUE};font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:0.28em;">${escapeHtml(code)}</span>
  </p>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${INK};">${text}</p>`;
}

const IGNORE_SUFFIX = "If you did not request this, you can safely ignore this message.";

export function verificationCodeMail(
  brand: MailBrand,
  input: { to: string; name: string; code: string; ttlMs: number }
): MailMessage {
  const ttl = minutes(input.ttlMs);
  const text =
    `Hi ${input.name},\n\n` +
    `Welcome to ${brand.appName}. Enter this code in the app to verify your email address:\n\n` +
    `    ${input.code}\n\n` +
    `The code expires in ${ttl} and can be used once.\n\n` +
    `If you did not create a ${brand.appName} account, ignore this message and the account will stay inactive.\n\n` +
    `— ${brand.appName} · ${brand.organization}`;
  const html = layout(
    brand,
    "Verify your email address",
    paragraph(`Hi ${escapeHtml(input.name)}, welcome to ${escapeHtml(brand.appName)}. Enter this code in the app to activate your account:`) +
      codeBlock(input.code) +
      paragraph(`The code expires in <strong>${ttl}</strong> and can be used once.`),
    `If you did not create a ${brand.appName} account, ignore this message and the account will stay inactive.`
  );
  return { to: input.to, subject: `${brand.appName} verification code`, text, html };
}

export function emailChangeCodeMail(
  brand: MailBrand,
  input: { to: string; name: string; code: string; ttlMs: number; currentEmail: string }
): MailMessage {
  const ttl = minutes(input.ttlMs);
  const text =
    `Hi ${input.name},\n\n` +
    `You asked to move your ${brand.appName} sign-in email from ${input.currentEmail} to this address. ` +
    `Enter this code in the app to confirm:\n\n` +
    `    ${input.code}\n\n` +
    `The code expires in ${ttl} and can be used once. Your current email keeps working until you confirm.\n\n` +
    `${IGNORE_SUFFIX}\n\n` +
    `— ${brand.appName} · ${brand.organization}`;
  const html = layout(
    brand,
    "Confirm your new email address",
    paragraph(`Hi ${escapeHtml(input.name)}, you asked to move your ${escapeHtml(brand.appName)} sign-in email from <strong>${escapeHtml(input.currentEmail)}</strong> to this address. Enter this code in the app to confirm:`) +
      codeBlock(input.code) +
      paragraph(`The code expires in <strong>${ttl}</strong> and can be used once. Your current email keeps working until you confirm.`),
    IGNORE_SUFFIX
  );
  return { to: input.to, subject: `${brand.appName}: confirm your new email`, text, html };
}

export function phoneChangeCodeMail(
  brand: MailBrand,
  input: { to: string; name: string; code: string; ttlMs: number; phone: string }
): MailMessage {
  const ttl = minutes(input.ttlMs);
  const text =
    `Hi ${input.name},\n\n` +
    `You asked to set ${input.phone} as the phone number on your ${brand.appName} account. ` +
    `Enter this code in the app to confirm:\n\n` +
    `    ${input.code}\n\n` +
    `The code expires in ${ttl} and can be used once.\n\n` +
    `If you did not request this change, ignore this message and consider changing your password.\n\n` +
    `— ${brand.appName} · ${brand.organization}`;
  const html = layout(
    brand,
    "Confirm your phone number",
    paragraph(`Hi ${escapeHtml(input.name)}, you asked to set <strong>${escapeHtml(input.phone)}</strong> as the phone number on your ${escapeHtml(brand.appName)} account. Enter this code in the app to confirm:`) +
      codeBlock(input.code) +
      paragraph(`The code expires in <strong>${ttl}</strong> and can be used once.`),
    "If you did not request this change, ignore this message and consider changing your password."
  );
  return { to: input.to, subject: `${brand.appName}: confirm your phone number`, text, html };
}

export function passwordResetMail(
  brand: MailBrand,
  input: { to: string; name: string; token: string; ttlMs: number; scheme: string }
): MailMessage {
  const ttl = minutes(input.ttlMs);
  const link = `${input.scheme}://reset-password?token=${input.token}`;
  const text =
    `Hi ${input.name},\n\n` +
    `We received a request to reset your ${brand.appName} password. Open this link on your phone:\n\n` +
    `    ${link}\n\n` +
    `Or paste this reset code in the app under "I have a reset code":\n\n` +
    `    ${input.token}\n\n` +
    `The link expires in ${ttl} and works once. Every signed-in device is signed out when the password changes.\n\n` +
    `If you did not ask to reset your password, ignore this message — your password is unchanged.\n\n` +
    `— ${brand.appName} · ${brand.organization}`;
  const html = layout(
    brand,
    "Reset your password",
    paragraph(`Hi ${escapeHtml(input.name)}, we received a request to reset your ${escapeHtml(brand.appName)} password.`) +
      `<p style="margin:16px 0;text-align:center;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:${BRAND_BLUE};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">Open ${escapeHtml(brand.appName)} and choose a new password</a></p>` +
      paragraph(`If the button does not open the app, paste this reset code under <em>I have a reset code</em>:`) +
      `<p style="margin:0 0 12px;word-break:break-all;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:${INK};background:#F3F6FB;padding:12px;border-radius:8px;">${escapeHtml(input.token)}</p>` +
      paragraph(`The link expires in <strong>${ttl}</strong> and works once. Every signed-in device is signed out when the password changes.`),
    "If you did not ask to reset your password, ignore this message — your password is unchanged."
  );
  return { to: input.to, subject: `${brand.appName}: reset your password`, text, html };
}
