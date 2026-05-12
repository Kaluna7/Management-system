const { prisma } = require("../lib/prisma");
const { smtpConfigured, sendHtmlMail } = require("../lib/mailer");

const BUYER_ROLES = ["buyers", "buyer"];
const FINANCE_ROLES = ["finance"];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseEmailList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));
}

function ymdInTimeZone(d, timeZone) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return s;
}

function utcMidnightFromYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

/** Selisih hari kalender (timeZone) antara hari ini dan periodEnd. */
function daysUntilPeriodEnd(periodEnd) {
  const tz = process.env.DEADLINE_REMINDER_TZ || "Asia/Jakarta";
  const endYmd = ymdInTimeZone(new Date(periodEnd), tz);
  const nowYmd = ymdInTimeZone(new Date(), tz);
  const endMs = utcMidnightFromYmd(endYmd);
  const nowMs = utcMidnightFromYmd(nowYmd);
  if (Number.isNaN(endMs) || Number.isNaN(nowMs)) return 999;
  return Math.round((endMs - nowMs) / 86400000);
}

function formatIdr(amount) {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return String(amount);
  }
}

function formatDateIso(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

function recordDataBlock(record) {
  const desc = escapeHtml(record.description || "").slice(0, 2000);
  return `
    <ul>
      <li><strong>Kode vendor:</strong> ${escapeHtml(record.vendorCode)}</li>
      <li><strong>Nama vendor:</strong> ${escapeHtml(record.vendorName)}</li>
      <li><strong>Jenis pendapatan:</strong> ${escapeHtml(record.incomeType)}</li>
      <li><strong>Nominal:</strong> ${escapeHtml(formatIdr(record.amount))}</li>
      <li><strong>Periode:</strong> ${formatDateIso(record.periodStart)} s/d ${formatDateIso(record.periodEnd)}</li>
      <li><strong>Status:</strong> ${escapeHtml(record.status)}</li>
      <li><strong>Deskripsi:</strong> ${desc || "—"}</li>
    </ul>
  `;
}

function recordDataBlockText(record) {
  return [
    `Kode vendor: ${record.vendorCode}`,
    `Nama vendor: ${record.vendorName}`,
    `Jenis pendapatan: ${record.incomeType}`,
    `Nominal: ${formatIdr(record.amount)}`,
    `Periode: ${formatDateIso(record.periodStart)} s/d ${formatDateIso(record.periodEnd)}`,
    `Status: ${record.status}`,
    `Deskripsi: ${(record.description || "").slice(0, 2000) || "—"}`,
  ].join("\n");
}

function emailTitle(record) {
  return `Peringatan end date: ${record.vendorName} (${record.vendorCode})`;
}

function buildBuyerEmail(record) {
  const title = emailTitle(record);
  const subject = `[WHSmith] ${title} — Buyers`;
  const html = `
    <p>Halo Tim Buyers,</p>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p>Berikut ringkasan data:</p>
    ${recordDataBlock(record)}
    <p>Invoice untuk data ini <strong>belum dibuat oleh Finance</strong>. Silakan hubungi tim Finance untuk tindak lanjut.</p>
    <p><small>ID data: ${escapeHtml(record.id)}</small></p>
  `;
  const text = [
    "Halo Tim Buyers,",
    "",
    title,
    "",
    "Berikut ringkasan data:",
    recordDataBlockText(record),
    "",
    "Invoice untuk data ini belum dibuat oleh Finance. Silakan hubungi tim Finance untuk tindak lanjut.",
    "",
    `ID data: ${record.id}`,
  ].join("\n");
  return { subject, html, text };
}

function buildFinanceEmail(record) {
  const title = emailTitle(record);
  const subject = `[WHSmith] ${title} — Finance`;
  const html = `
    <p>Halo Tim Finance,</p>
    <p><strong>${escapeHtml(title)}</strong></p>
    <p>Berikut penjelasan data:</p>
    ${recordDataBlock(record)}
    <p>Segera lakukan tindak lanjut untuk <strong>mengisi form invoice</strong> untuk data di atas.</p>
    <p><small>ID data: ${escapeHtml(record.id)}</small></p>
  `;
  const text = [
    "Halo Tim Finance,",
    "",
    title,
    "",
    "Berikut penjelasan data:",
    recordDataBlockText(record),
    "",
    "Segera lakukan tindak lanjut untuk mengisi form invoice untuk data di atas.",
    "",
    `ID data: ${record.id}`,
  ].join("\n");
  return { subject, html, text };
}

async function resolveEmailsForRole(roleGroup) {
  const envKey = roleGroup === "buyers" ? "NOTIFY_EMAIL_BUYERS" : "NOTIFY_EMAIL_FINANCE";
  const fromEnv = parseEmailList(process.env[envKey]);
  const roles = roleGroup === "buyers" ? BUYER_ROLES : FINANCE_ROLES;
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles },
      email: { not: null },
    },
    select: { email: true },
  });
  const fromDb = users.map((u) => u.email).filter(Boolean);
  return [...new Set([...fromEnv, ...fromDb])];
}

function inDeadlineWindow(record) {
  const d = daysUntilPeriodEnd(record.periodEnd);
  return d >= 0 && d <= 5;
}

function shouldSendBuyer(record) {
  if (!inDeadlineWindow(record)) return false;
  if (record.buyerDeadlineNotifiedAt) return false;
  if (["document_generated", "archived", "history"].includes(record.status)) return false;
  return (
    record.status === "created" ||
    record.status === "invoice_pending" ||
    record.status === "invoice_created"
  );
}

function shouldSendFinance(record) {
  if (!inDeadlineWindow(record)) return false;
  if (record.financeDeadlineNotifiedAt) return false;
  return record.status === "invoice_pending";
}

/**
 * Sends role-specific deadline reminder emails (once per record per audience).
 * @returns {Promise<{ buyerSent: number; financeSent: number; skipped?: string; errors: string[] }>}
 */
async function runDeadlineReminderJob() {
  const errors = [];
  if (!smtpConfigured()) {
    return { buyerSent: 0, financeSent: 0, skipped: "smtp", errors };
  }

  const buyerTo = await resolveEmailsForRole("buyers");
  const financeTo = await resolveEmailsForRole("finance");

  const records = await prisma.buyerRecord.findMany({
    where: {
      NOT: { status: { in: ["archived", "history"] } },
    },
  });

  let buyerSent = 0;
  let financeSent = 0;

  if (buyerTo.length === 0) {
    errors.push(
      "Daftar email Buyers kosong: isi NOTIFY_EMAIL_BUYERS (pisahkan koma) atau isi field email pada User dengan role buyers."
    );
  }
  if (financeTo.length === 0) {
    errors.push(
      "Daftar email Finance kosong: isi NOTIFY_EMAIL_FINANCE atau isi field email pada User dengan role finance."
    );
  }

  for (const record of records) {
    if (shouldSendBuyer(record)) {
      if (buyerTo.length === 0) {
        /* already reported */
      } else {
        try {
          const { subject, html, text } = buildBuyerEmail(record);
          const r = await sendHtmlMail({ to: buyerTo, subject, html, text });
          if (r.skipped) {
            errors.push(`Buyer mail skipped for ${record.id}: ${r.reason}`);
          } else {
            await prisma.buyerRecord.update({
              where: { id: record.id },
              data: { buyerDeadlineNotifiedAt: new Date() },
            });
            buyerSent += 1;
          }
        } catch (e) {
          errors.push(`Buyer mail failed ${record.id}: ${e.message}`);
        }
      }
    }

    if (shouldSendFinance(record)) {
      if (financeTo.length === 0) {
        /* already reported */
      } else {
        try {
          const { subject, html, text } = buildFinanceEmail(record);
          const r = await sendHtmlMail({ to: financeTo, subject, html, text });
          if (r.skipped) {
            errors.push(`Finance mail skipped for ${record.id}: ${r.reason}`);
          } else {
            await prisma.buyerRecord.update({
              where: { id: record.id },
              data: { financeDeadlineNotifiedAt: new Date() },
            });
            financeSent += 1;
          }
        } catch (e) {
          errors.push(`Finance mail failed ${record.id}: ${e.message}`);
        }
      }
    }
  }

  return { buyerSent, financeSent, errors };
}

module.exports = {
  runDeadlineReminderJob,
  daysUntilPeriodEnd,
  shouldSendBuyer,
  shouldSendFinance,
};
