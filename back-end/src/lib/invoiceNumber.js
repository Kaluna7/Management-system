const TASK_STATUSES = ["document_generated", "archived", "history"];

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const FINANCE_INVOICE_NUMBER_PATTERN =
  /^KPU\/FINANCE-INV\/([IVXLC]+)\/(\d{4})\/NO-(\d+)$/i;

function romanMonth(date) {
  return ROMAN_MONTHS[date.getMonth()];
}

/** KPU/FINANCE-INV/{roman month}/{year}/NO-0001 */
function formatFinanceInvoiceNumber(sequence, date = new Date()) {
  const seq = String(Math.max(1, sequence)).padStart(4, "0");
  return `KPU/FINANCE-INV/${romanMonth(date)}/${date.getFullYear()}/NO-${seq}`;
}

function parseFinanceInvoiceSequence(number) {
  const m = String(number ?? "").trim().match(FINANCE_INVOICE_NUMBER_PATTERN);
  return m ? parseInt(m[3], 10) : 0;
}

function invoiceNumberFromRow(row) {
  if (!row?.invoice || typeof row.invoice !== "object" || Array.isArray(row.invoice)) {
    return "";
  }
  return String(row.invoice.number ?? "").trim();
}

/**
 * Next sequence = 1 + highest NO-xxxx among records already invoiced and in task
 * (document_generated / archived / history), excluding current record on re-save.
 */
async function allocateFinanceInvoiceNumber(prisma, recordId, existingRecord, generatedAt = new Date()) {
  const existingNumber = invoiceNumberFromRow(existingRecord);
  if (parseFinanceInvoiceSequence(existingNumber) > 0) {
    return existingNumber;
  }

  const rows = await prisma.buyerRecord.findMany({
    where: { status: { in: TASK_STATUSES } },
    select: { id: true, invoice: true },
  });

  let maxSeq = 0;
  for (const row of rows) {
    if (row.id === recordId) continue;
    maxSeq = Math.max(maxSeq, parseFinanceInvoiceSequence(invoiceNumberFromRow(row)));
  }

  return formatFinanceInvoiceNumber(maxSeq + 1, generatedAt);
}

/**
 * Replace legacy invoice numbers (e.g. V001-001) with KPU/FINANCE-INV/... on existing task records.
 * Processes in generatedAt order so sequences stay stable.
 */
async function backfillInvalidFinanceInvoiceNumbers(prisma) {
  const rows = await prisma.buyerRecord.findMany({
    where: { status: { in: TASK_STATUSES } },
    orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
  });

  let changed = false;
  for (const row of rows) {
    const current = invoiceNumberFromRow(row);
    if (parseFinanceInvoiceSequence(current) > 0) continue;
    if (!row.invoice || typeof row.invoice !== "object" || Array.isArray(row.invoice)) continue;

    const generatedAt = row.generatedAt ?? new Date();
    const newNumber = await allocateFinanceInvoiceNumber(prisma, row.id, row, generatedAt);
    if (newNumber === current) continue;

    await prisma.buyerRecord.update({
      where: { id: row.id },
      data: {
        invoice: { ...row.invoice, number: newNumber },
      },
    });
    changed = true;
  }

  return changed;
}

module.exports = {
  TASK_STATUSES,
  formatFinanceInvoiceNumber,
  parseFinanceInvoiceSequence,
  allocateFinanceInvoiceNumber,
  backfillInvalidFinanceInvoiceNumbers,
};
