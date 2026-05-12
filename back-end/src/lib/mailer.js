const nodemailer = require("nodemailer");

const BREVO_DEFAULT_HOST = "smtp-relay.brevo.com";
/** Transaksi satu-per-satu (kode OTP, dll.). Bukan Email Campaigns API (/emailCampaigns). */
const BREVO_TRANSACTIONAL_URL = "https://api.brevo.com/v3/smtp/email";

function trimEnv(v) {
  if (v == null || typeof v !== "string") return "";
  return v.trim();
}

/** v3 API key (xkeysib-…) — sama key untuk REST; bukan xsmtpsib (SMTP). */
function getBrevoApiKey() {
  return (
    trimEnv(process.env.BREVO_API_KEY) ||
    trimEnv(process.env.SIB_API_KEY) ||
    trimEnv(process.env.BREVO_API_KEY_V3) ||
    trimEnv(process.env.BREVO_MCP_KEY)
  );
}

/**
 * Resolve SMTP settings (fallback when API key not used).
 */
function resolveSmtpConfig() {
  const user =
    trimEnv(process.env.SMTP_USER) ||
    trimEnv(process.env.BREVO_SMTP_LOGIN) ||
    trimEnv(process.env.BREVO_LOGIN);
  const pass =
    trimEnv(process.env.SMTP_PASS) ||
    trimEnv(process.env.BREVO_SMTP_KEY) ||
    trimEnv(process.env.BREVO_SMTP_PASSWORD);
  let host = trimEnv(process.env.SMTP_HOST);
  if (!host && user && pass) {
    host = BREVO_DEFAULT_HOST;
  }
  const from = trimEnv(process.env.SMTP_FROM);
  const port = Number(trimEnv(String(process.env.SMTP_PORT))) || 587;
  const secure =
    trimEnv(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465;
  return { host, from, user, pass, port, secure };
}

/** Verified sender for API: SMTP_FROM "Name <email>" atau BREVO_SENDER_EMAIL saja */
function getSenderFromEnv() {
  const combined = trimEnv(process.env.SMTP_FROM);
  const emailOnly = trimEnv(process.env.BREVO_SENDER_EMAIL);
  const raw = combined || emailOnly;
  if (!raw) return null;
  const m = /^(.+?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, "").trim() || "WHSmith";
    return { name, email: m[2].trim() };
  }
  if (raw.includes("@")) {
    const local = raw.split("@")[0];
    return { name: local || "WHSmith", email: raw };
  }
  return null;
}

function brevoApiConfigured() {
  const key = getBrevoApiKey();
  const sender = getSenderFromEnv();
  return Boolean(key && sender?.email);
}

function smtpTransportConfigured() {
  const { host, from, user, pass } = resolveSmtpConfig();
  if (!host || !from) return false;
  if (user || pass) return Boolean(user && pass);
  return true;
}

/** True jika bisa kirim email (REST API Brevo atau SMTP lengkap). */
function emailConfigured() {
  return brevoApiConfigured() || smtpTransportConfigured();
}

/** Back-compat: route lain masih memanggil smtpConfigured */
function smtpConfigured() {
  return emailConfigured();
}

function smtpFromLooksLikeBrevoLogin(email) {
  if (!email || typeof email !== "string") return false;
  return email.toLowerCase().includes("@smtp-brevo.com");
}

function emailMissingHint() {
  if (emailConfigured()) return null;
  if (!getBrevoApiKey()) {
    return (
      "Email not configured. Recommended (tanpa blokir IP SMTP): set BREVO_API_KEY (API key v3 dari Brevo → Settings → API keys) dan SMTP_FROM atau BREVO_SENDER_EMAIL. " +
      "Alternatif: lengkapi SMTP_* seperti di .env.example."
    );
  }
  if (!getSenderFromEnv()) {
    return "Set SMTP_FROM or BREVO_SENDER_EMAIL to a Brevo-verified sender address.";
  }
  const { host, from, user, pass } = resolveSmtpConfig();
  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!from) missing.push("SMTP_FROM");
  if (user && !pass) missing.push("SMTP_PASS");
  if (!user && pass) missing.push("SMTP_USER");
  if (!user && !pass) missing.push("SMTP_USER + SMTP_PASS");
  if (missing.length === 0) return null;
  return `SMTP incomplete: ${missing.join("; ")}. See .env.example.`;
}

/** Back-compat */
function smtpMissingHint() {
  return emailMissingHint();
}

function getTransport() {
  const { host, user, pass, port, secure } = resolveSmtpConfig();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    requireTLS: !secure && port === 587,
    tls: { minVersion: "TLSv1.2" },
  });
}

let loggedMissingApiKey = false;

/**
 * Kirim lewat Brevo REST API
 * @param {{ to: string[]; subject: string; html: string; text: string }} opts
 */
async function sendViaBrevoApi(opts) {
  const sender = getSenderFromEnv();
  if (!sender?.email) {
    return { ok: false, skipped: true, reason: "Missing SMTP_FROM / BREVO_SENDER_EMAIL for API sender" };
  }
  const to = opts.to.filter(Boolean);
  const res = await fetch(BREVO_TRANSACTIONAL_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": getBrevoApiKey(),
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: to.map((email) => ({ email })),
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error("[mailer] Brevo API HTTP", res.status, raw.slice(0, 800));
    let hint = "";
    try {
      const j = JSON.parse(raw);
      const msg = String(j.message || j.error || "");
      const low = msg.toLowerCase();
      const ipBlock =
        res.status === 401 ||
        res.status === 403 ||
        low.includes("ip") ||
        low.includes("authorized") ||
        low.includes("not allowed");
      if (ipBlock) {
        hint =
          " Brevo API IP restriction: di dashboard Brevo buka Security / Authorized IPs (API) dan tambahkan IP publik mesin yang menjalankan backend ini " +
          "(atau matikan pemblokiran IP untuk API saat development). Lihat https://account.brevo.com/security/authorised_ips";
      }
    } catch {
      /* body bukan JSON */
    }
    return {
      ok: false,
      skipped: false,
      reason: `Brevo API ${res.status}: ${raw.slice(0, 320)}${hint}`,
    };
  }
  let messageId = null;
  try {
    const j = JSON.parse(raw);
    messageId = j.messageId != null ? String(j.messageId) : null;
    const dest = to.join(", ");
    if (messageId) {
      console.info("[mailer] Brevo API sent OK, messageId=", messageId, "→ to:", dest);
    } else {
      console.info("[mailer] Brevo API sent OK (no messageId in body) → to:", dest);
    }
  } catch {
    console.info("[mailer] Brevo API sent OK (non-JSON body) → to:", to.join(", "));
  }
  return { ok: true, via: "brevo-api", messageId };
}

/**
 * @param {{ to: string[]; subject: string; html: string; text: string }} opts
 */
async function sendViaSmtpMail(opts) {
  const to = opts.to.filter(Boolean);
  if (to.length === 0) {
    return { ok: false, skipped: true, reason: "No recipients" };
  }
  const { from } = resolveSmtpConfig();
  const sender = getSenderFromEnv();
  if (sender?.email && smtpFromLooksLikeBrevoLogin(sender.email)) {
    console.warn(
      "[mailer] SMTP_FROM pakai alamat @smtp-brevo.com — Brevo menyarankan \"From\" memakai sender/domain yang terverifikasi (Campaigns → Senders), bukan login SMTP saja. Kalau email tidak sampai, tambahkan sender terverifikasi dan set SMTP_FROM / BREVO_SENDER_EMAIL ke email itu.",
    );
  }
  try {
    const transport = getTransport();
    await transport.sendMail({
      from,
      to: to.join(", "),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.info("[mailer] SMTP sent OK →", to.join(", "));
    return { ok: true, via: "smtp", messageId: null };
  } catch (e) {
    console.error("[mailer] SMTP sendMail failed:", e);
    let reason = e?.message || String(e);
    const responseCode = e?.responseCode;
    const response = e?.response;
    if (response) reason = `${reason} | ${String(response).slice(0, 500)}`;
    const low = reason.toLowerCase();
    if (
      responseCode === 525 ||
      low.includes("525") ||
      low.includes("unauthorized ip") ||
      low.includes("not authorized") ||
      low.includes("access denied")
    ) {
      reason +=
        " — SMTP relay diblokir oleh IP: tambahkan IP publik server ini di Brevo (SMTP authorized IPs) atau kirim lewat REST API dengan BREVO_API_KEY + whitelist IP untuk API.";
    }
    return {
      ok: false,
      skipped: false,
      reason,
    };
  }
}

function wantSmtpFirst() {
  return trimEnv(process.env.BREVO_TRY_SMTP_FIRST).toLowerCase() === "true";
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRecipients(emails) {
  const bad = emails.filter((e) => !SIMPLE_EMAIL.test(String(e).trim()));
  if (bad.length > 0) {
    return `Invalid recipient email address(es): ${bad.join(", ")}`;
  }
  return null;
}

/**
 * @param {{ to: string[]; subject: string; html: string; text: string }} opts
 * @returns {Promise<
 *   | { ok: true; via: "brevo-api" | "smtp"; messageId: string | null }
 *   | { ok: false; skipped?: boolean; reason?: string }
 * >}
 */
async function sendHtmlMail(opts) {
  const to = opts.to.filter(Boolean);
  if (to.length === 0) {
    return { ok: false, skipped: true, reason: "No recipients" };
  }
  const invalid = validateRecipients(to);
  if (invalid) {
    return { ok: false, skipped: false, reason: invalid };
  }

  if (!emailConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: emailMissingHint() || "Email not configured",
    };
  }

  if (!getBrevoApiKey() && smtpTransportConfigured() && !loggedMissingApiKey) {
    loggedMissingApiKey = true;
    console.warn(
      "[mailer] BREVO_API_KEY kosong — hanya SMTP yang dipakai. Isi BREVO_API_KEY (xkeysib-…) + Authorized IPs untuk API; atau pastikan SMTP tidak error 525/IP.",
    );
  }

  const apiReady = brevoApiConfigured();
  const smtpReady = smtpTransportConfigured();

  if (wantSmtpFirst() && smtpReady) {
    const smtpFirst = await sendViaSmtpMail(opts);
    if (smtpFirst.ok) return smtpFirst;
    console.warn("[mailer] SMTP failed first:", smtpFirst.reason);
    if (apiReady) {
      try {
        const apiSecond = await sendViaBrevoApi({ ...opts, to });
        if (apiSecond.ok) return apiSecond;
        return apiSecond;
      } catch (e) {
        console.error("[mailer] Brevo API exception after SMTP:", e);
        return { ok: false, reason: e?.message || String(e) };
      }
    }
    return smtpFirst;
  }

  if (apiReady) {
    try {
      const apiOut = await sendViaBrevoApi({ ...opts, to });
      if (apiOut.ok) return apiOut;
      if (smtpReady) {
        console.warn("[mailer] Brevo API failed, falling back to SMTP:", apiOut.reason);
        const smtpOut = await sendViaSmtpMail(opts);
        if (smtpOut.ok) return smtpOut;
        return {
          ok: false,
          reason: `API: ${apiOut.reason}; SMTP fallback: ${smtpOut.reason || "failed"}`,
        };
      }
      return apiOut;
    } catch (e) {
      console.error("[mailer] Brevo API exception:", e);
      if (smtpReady) {
        console.warn("[mailer] Falling back to SMTP after API error");
        const smtpOut = await sendViaSmtpMail(opts);
        if (smtpOut.ok) return smtpOut;
        return { ok: false, reason: e?.message || String(e) };
      }
      return { ok: false, reason: e?.message || String(e) };
    }
  }

  if (smtpReady) {
    return sendViaSmtpMail(opts);
  }

  return {
    ok: false,
    skipped: true,
    reason: emailMissingHint() || "SMTP not configured for fallback",
  };
}

module.exports = {
  smtpConfigured,
  smtpMissingHint,
  sendHtmlMail,
};
