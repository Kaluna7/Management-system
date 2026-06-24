const { prisma } = require("../lib/prisma");
const { smtpConfigured, sendHtmlMail } = require("../lib/mailer");
const {
  escapeHtml,
  renderFinlyEmailLayout,
  renderInfoCallout,
  renderRecordTable,
  daysLeftBadgeHtml,
} = require("../lib/finlyEmailTemplate");

const BUYER_ROLES = ["buyers", "buyers_admin", "buyer"];
const FINANCE_ROLES = ["finance", "finance_admin"];

function parseEmailList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));
}

function ymdInTimeZone(d, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function utcMidnightFromYmd(ymd) {
  const [y, m, day] = ymd.split("-").map(Number);
  if (!y || !m || !day) return NaN;
  return Date.UTC(y, m - 1, day);
}

/** Calendar-day difference (timeZone) between today and periodEnd. */
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

function formatDateLong(d) {
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: process.env.DEADLINE_REMINDER_TZ || "Asia/Jakarta",
    });
  } catch {
    return formatDateIso(d);
  }
}

function formatDateIso(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

function daysLeftLabel(daysLeft) {
  if (daysLeft <= 0) return "Ends today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

function recordDataBlock(record, daysLeft) {
  const desc = escapeHtml(record.description || "").slice(0, 2000) || "—";
  const endDate = escapeHtml(formatDateLong(record.periodEnd));
  return renderRecordTable([
    ["Vendor code", `<strong>${escapeHtml(record.vendorCode)}</strong>`],
    ["Vendor name", `<strong>${escapeHtml(record.vendorName)}</strong>`],
    ["Income type", escapeHtml(record.incomeType)],
    ["Amount", `<strong style="color:#4338ca;">${escapeHtml(formatIdr(record.amount))}</strong>`],
    ["Period", `${formatDateIso(record.periodStart)} — ${formatDateIso(record.periodEnd)}`],
    [
      "End date",
      `<strong style="color:#c2410c;">${endDate}</strong><br /><span style="font-size:12px;color:#64748b;">(${escapeHtml(daysLeftLabel(daysLeft))})</span>`,
    ],
    ["Status", escapeHtml(String(record.status).replaceAll("_", " "))],
    ["Description", desc],
  ]);
}

function recordDataBlockText(record, daysLeft) {
  return [
    "Record details:",
    `Vendor code: ${record.vendorCode}`,
    `Vendor name: ${record.vendorName}`,
    `Income type: ${record.incomeType}`,
    `Amount: ${formatIdr(record.amount)}`,
    `Period: ${formatDateIso(record.periodStart)} to ${formatDateIso(record.periodEnd)}`,
    `End date: ${formatDateLong(record.periodEnd)} (${daysLeftLabel(daysLeft)})`,
    `Status: ${record.status}`,
    `Description: ${(record.description || "").slice(0, 2000) || "—"}`,
  ].join("\n");
}

function emailTitle(record) {
  return `${record.vendorName} · ${record.vendorCode}`;
}

function buildBuyerEmail(record) {
  const daysLeft = daysUntilPeriodEnd(record.periodEnd);
  const title = `End date reminder — ${emailTitle(record)}`;
  const subject = `[Finly] ${title} (${daysLeftLabel(daysLeft)})`;
  const html = renderFinlyEmailLayout({
    eyebrow: "Deadline reminder",
    title,
    subtitle: "A buyer record is approaching its end date",
    badgeHtml: daysLeftBadgeHtml(daysLeft),
    bodyHtml: `
      <p style="margin:0 0 12px;">Hello <strong>Buyers team</strong>,</p>
      <p style="margin:0 0 8px;">
        The record below is <strong>approaching its end date</strong> (within 5 days). Please
        <strong>coordinate with Finance</strong> so it is actioned before the period ends.
      </p>
      ${recordDataBlock(record, daysLeft)}
      ${renderInfoCallout(
        "Recommended action",
        "Make sure Finance is aware of this record and processes it in the Finly portal. If the invoice has not been created yet, follow up with Finance today.",
        "amber",
      )}
      <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Record ID: ${escapeHtml(record.id)}</p>
    `,
    footerNote: "Finly deadline reminder — please do not reply.",
  });
  const text = [
    "Hello Buyers team,",
    "",
    subject,
    "",
    "The record below is approaching its end date (within 5 days). Please coordinate with Finance so it is actioned before the period ends.",
    "",
    recordDataBlockText(record, daysLeft),
    "",
    "Recommended action: Ensure Finance is aware and processes this record in the Finly portal.",
    "",
    `Record ID: ${record.id}`,
    "",
    "— Finly",
  ].join("\n");
  return { subject, html, text };
}

function buildFinanceEmail(record) {
  const daysLeft = daysUntilPeriodEnd(record.periodEnd);
  const title = `Action required — ${emailTitle(record)}`;
  const subject = `[Finly] ${title} (${daysLeftLabel(daysLeft)})`;
  const html = renderFinlyEmailLayout({
    eyebrow: "Deadline reminder",
    title,
    subtitle: "Review and process this record in Finly",
    badgeHtml: daysLeftBadgeHtml(daysLeft),
    bodyHtml: `
      <p style="margin:0 0 12px;">Hello <strong>Finance team</strong>,</p>
      <p style="margin:0 0 8px;">
        The record below <strong>ends in ${escapeHtml(daysLeftLabel(daysLeft).toLowerCase())}</strong>.
        Please <strong>review and process</strong> it in the Finly portal before the end date.
      </p>
      ${recordDataBlock(record, daysLeft)}
      ${renderInfoCallout(
        "Recommended action",
        "Open the Finly portal → review the record on Dashboard / Task → complete the invoice form if needed, then continue with stamped paper upload & publish as per workflow.",
        "blue",
      )}
      <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Record ID: ${escapeHtml(record.id)}</p>
    `,
    footerNote: "Finly deadline reminder — please do not reply.",
  });
  const text = [
    "Hello Finance team,",
    "",
    subject,
    "",
    `The record below ends ${daysLeftLabel(daysLeft).toLowerCase()}. Please review and process it in the Finly portal.`,
    "",
    recordDataBlockText(record, daysLeft),
    "",
    "Recommended action: Open Finly, review the record, complete the invoice form if needed, then continue the stamped paper workflow.",
    "",
    `Record ID: ${record.id}`,
    "",
    "— Finly",
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
  if (["archived", "history"].includes(record.status)) return false;
  return (
    record.status === "created" ||
    record.status === "invoice_pending" ||
    record.status === "invoice_created" ||
    record.status === "document_generated"
  );
}

async function sendDeadlineReminderForRecord(recordId) {
  if (!smtpConfigured()) {
    return { buyerSent: 0, financeSent: 0, skipped: "smtp", errors: [] };
  }
  const record = await prisma.buyerRecord.findUnique({ where: { id: String(recordId) } });
  if (!record) return { buyerSent: 0, financeSent: 0, skipped: "not_found", errors: [] };

  const buyerTo = await resolveEmailsForRole("buyers");
  const financeTo = await resolveEmailsForRole("finance");
  let buyerSent = 0;
  let financeSent = 0;
  const errors = [];

  if (shouldSendBuyer(record)) {
    if (buyerTo.length === 0) {
      errors.push(
        "Buyers email list is empty: set NOTIFY_EMAIL_BUYERS (comma-separated) or add email on User records with role buyers."
      );
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
      errors.push(
        "Finance email list is empty: set NOTIFY_EMAIL_FINANCE or add email on User records with role finance."
      );
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

  return { buyerSent, financeSent, errors };
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
      "Buyers email list is empty: set NOTIFY_EMAIL_BUYERS (comma-separated) or add email on User records with role buyers."
    );
  }
  if (financeTo.length === 0) {
    errors.push(
      "Finance email list is empty: set NOTIFY_EMAIL_FINANCE or add email on User records with role finance."
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
  sendDeadlineReminderForRecord,
  daysUntilPeriodEnd,
  shouldSendBuyer,
  shouldSendFinance,
};
