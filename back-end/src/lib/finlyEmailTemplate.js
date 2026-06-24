function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Shared Finly HTML email shell (text branding only, no logo image).
 * @param {{
 *   eyebrow?: string;
 *   title: string;
 *   subtitle?: string;
 *   badgeHtml?: string;
 *   bodyHtml: string;
 *   footerNote?: string;
 * }} opts
 */
function renderFinlyEmailLayout(opts) {
  const eyebrow = opts.eyebrow ? escapeHtml(opts.eyebrow) : "Finly";
  const title = escapeHtml(opts.title);
  const subtitle = opts.subtitle ? escapeHtml(opts.subtitle) : "";
  const footerNote = opts.footerNote
    ? escapeHtml(opts.footerNote)
    : "Automated message from Finly — please do not reply to this email.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef4ff;">
  <div style="margin:0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(79,70,229,0.12);border:1px solid #e0e7ff;">
      <div style="padding:32px 28px 20px;text-align:center;background:#ffffff;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px;color:#312e81;">Finly</div>
        <div style="margin-top:4px;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#6366f1;">${eyebrow}</div>
      </div>
      <div style="padding:22px 28px 26px;background:linear-gradient(135deg,#4f46e5 0%,#3b82f6 50%,#06b6d4 100%);color:#ffffff;text-align:center;">
        <div style="font-size:20px;font-weight:700;line-height:1.4;">${title}</div>
        ${subtitle ? `<div style="margin-top:8px;font-size:14px;opacity:0.92;line-height:1.5;">${subtitle}</div>` : ""}
        ${opts.badgeHtml || ""}
      </div>
      <div style="padding:28px 28px 12px;font-size:15px;line-height:1.7;color:#334155;">
        ${opts.bodyHtml}
      </div>
      <div style="padding:24px 28px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:15px;font-weight:700;color:#4338ca;">Finly</div>
        <div style="margin-top:4px;font-size:12px;color:#64748b;line-height:1.5;">Finance workflow portal</div>
        <div style="margin-top:14px;font-size:11px;color:#94a3b8;line-height:1.5;">${footerNote}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderOtpCodeBox(code) {
  return `
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;min-width:200px;padding:18px 28px;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border:2px solid #93c5fd;border-radius:16px;box-shadow:0 4px 14px rgba(59,130,246,0.15);">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#3b82f6;margin-bottom:8px;">Verification code</div>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1e3a8a;font-family:'Courier New',Courier,monospace;">${escapeHtml(code)}</div>
      </div>
    </div>
  `;
}

function renderPasswordResetEmail(name, code) {
  const safeName = escapeHtml(name || "there");
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 8px;">Use the code below to reset your Finly portal password.</p>
    ${renderOtpCodeBox(code)}
    <p style="margin:0 0 8px;text-align:center;font-size:14px;color:#64748b;">This code expires in <strong style="color:#0f172a;">15 minutes</strong>.</p>
    <p style="margin:16px 0 0;padding:14px 16px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#64748b;line-height:1.55;">
      If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
  `;
  return renderFinlyEmailLayout({
    eyebrow: "Security",
    title: "Reset your password",
    subtitle: "Account settings — verification code",
    bodyHtml,
    footerNote: "Finly security notification — please do not reply.",
  });
}

function renderVerificationEmail(name, code) {
  const safeName = escapeHtml(name || "there");
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 8px;">Use the code below to verify your account and choose your department role in Finly.</p>
    ${renderOtpCodeBox(code)}
    <p style="margin:0 0 8px;text-align:center;font-size:14px;color:#64748b;">This code expires in <strong style="color:#0f172a;">15 minutes</strong>.</p>
    <p style="margin:16px 0 0;padding:14px 16px;background:#f1f5f9;border-radius:12px;font-size:13px;color:#64748b;line-height:1.55;">
      If you did not request this code, you can safely ignore this email. Your account will remain unchanged.
    </p>
  `;
  return renderFinlyEmailLayout({
    eyebrow: "Security",
    title: "Your verification code",
    subtitle: "Sign in and select your department",
    bodyHtml,
    footerNote: "Finly security notification — please do not reply.",
  });
}

function renderInfoCallout(title, text, variant = "amber") {
  const styles =
    variant === "blue"
      ? { bg: "#eff6ff", border: "#93c5fd", title: "#1e40af", text: "#1e3a8a" }
      : { bg: "#fffbeb", border: "#fcd34d", title: "#92400e", text: "#78350f" };
  return `
    <div style="margin:20px 0 8px;padding:16px 18px;background:${styles.bg};border:1px solid ${styles.border};border-radius:14px;">
      <div style="font-size:13px;font-weight:700;color:${styles.title};margin-bottom:6px;">${escapeHtml(title)}</div>
      <p style="margin:0;font-size:14px;line-height:1.65;color:${styles.text};">${text}</p>
    </div>
  `;
}

function renderRecordTable(rows) {
  const trs = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 0;color:#64748b;width:38%;vertical-align:top;font-size:13px;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;vertical-align:top;">${value}</td>
        </tr>`,
    )
    .join("");
  return `
    <div style="margin:18px 0 0;padding:18px 20px;border:1px solid #c7d2fe;background:linear-gradient(180deg,#fafbff 0%,#f5f7ff 100%);border-radius:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#4f46e5;margin-bottom:12px;">Record details</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${trs}</table>
    </div>
  `;
}

function daysLeftBadgeHtml(daysLeft) {
  const label =
    daysLeft <= 0 ? "Ends today" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
  return `
    <div style="display:inline-block;margin-top:14px;padding:8px 18px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.35);border-radius:999px;font-size:13px;font-weight:700;">
      ⏰ ${escapeHtml(label)}
    </div>
  `;
}

module.exports = {
  escapeHtml,
  renderFinlyEmailLayout,
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderInfoCallout,
  renderRecordTable,
  daysLeftBadgeHtml,
};
