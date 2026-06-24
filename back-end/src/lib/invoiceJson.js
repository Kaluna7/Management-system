/** Normalize Prisma / API invoice JSON to a plain object. */
function normalizeInvoiceJson(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ...parsed };
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
  return {};
}

function getFormulaFormFileNames(rawInvoice) {
  const inv = normalizeInvoiceJson(rawInvoice);
  if (Array.isArray(inv.formulaFormFileNames)) {
    return inv.formulaFormFileNames.map((n) => String(n).trim()).filter(Boolean);
  }
  const name = inv.formulaFormFileName;
  if (name != null && String(name).trim()) return [String(name).trim()];
  return [];
}

function getFormulaFormFileName(rawInvoice) {
  const names = getFormulaFormFileNames(rawInvoice);
  return names[0] ?? "";
}

function invoiceWithoutFormulaForm(rawInvoice) {
  const inv = normalizeInvoiceJson(rawInvoice);
  delete inv.formulaFormFileName;
  delete inv.formulaFormFileNames;
  return inv;
}

module.exports = {
  normalizeInvoiceJson,
  getFormulaFormFileName,
  getFormulaFormFileNames,
  invoiceWithoutFormulaForm,
};
