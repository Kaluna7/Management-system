const { Router } = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const { mergeFormulaFormFiles, storedFileExists, deleteStoredFile } = require("../lib/recordFiles");
const { getFormulaFormFileNames, invoiceWithoutFormulaForm } = require("../lib/invoiceJson");
const { allocateFinanceInvoiceNumber, backfillInvalidFinanceInvoiceNumbers } = require("../lib/invoiceNumber");
const {
  ADMIN_TASK_STATUS,
  adminListWhereForRole,
  canAdminMutateRecord,
  isAdminCreatedRecord,
  isRecordLockedForEdit,
  isRecordVisibleToAdminRole,
} = require("../lib/recordAdminAccess");

const router = Router();

const ADMIN_ROLES = new Set(["finance_admin", "buyers_admin"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function verifyTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  if (!process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(match[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const payload = verifyTokenFromHeader(req);
  if (!payload?.uid) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!ADMIN_ROLES.has(String(payload.role || ""))) {
    return res.status(403).json({ message: "Admin access required" });
  }
  req.auth = {
    userId: String(payload.uid),
    role: String(payload.role),
  };
  next();
}

function toRecordResponse(record) {
  const archivedAt =
    record.status === ADMIN_TASK_STATUS ? null : record.archivedAt ? record.archivedAt.toISOString() : null;
  return {
    ...record,
    amount: Number(record.amount),
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    createdAt: record.createdAt.toISOString(),
    generatedAt: record.generatedAt ? record.generatedAt.toISOString() : null,
    archivedAt,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    buyerDeadlineNotifiedAt: record.buyerDeadlineNotifiedAt
      ? record.buyerDeadlineNotifiedAt.toISOString()
      : null,
    financeDeadlineNotifiedAt: record.financeDeadlineNotifiedAt
      ? record.financeDeadlineNotifiedAt.toISOString()
      : null,
  };
}

function parseDateOrNull(value, keyName) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value for ${keyName}`);
  }
  return d;
}

function adminMutateForbidden(res, reason) {
  const messages = {
    portal: "Record dibuat dari portal — hanya data yang dibuat admin yang bisa diubah.",
    role: "Record ini dibuat departemen lain — tidak bisa diubah.",
    task: "Hanya data yang masih di task (document generated) yang bisa diedit.",
    locked: "Record di archive atau history tidak bisa diedit.",
  };
  return res.status(403).json({ message: messages[reason] || messages.portal });
}

function assertAdminCanMutate(existing, res, adminRole) {
  if (!isRecordVisibleToAdminRole(existing, adminRole)) {
    adminMutateForbidden(res, "role");
    return false;
  }
  if (isRecordLockedForEdit(existing)) {
    adminMutateForbidden(res, "locked");
    return false;
  }
  return true;
}

router.use(requireAdmin);

router.get("/records", async (req, res) => {
  try {
    await backfillInvalidFinanceInvoiceNumbers(prisma);
    const includeFinished =
      req.query.includeFinished === "1" || req.query.includeFinished === "true";
    const records = await prisma.buyerRecord.findMany({
      where: adminListWhereForRole(req.auth.role, includeFinished),
      orderBy: { createdAt: "desc" },
    });
    res.json(records.map(toRecordResponse));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load records" });
  }
});

router.get("/records/:id", async (req, res) => {
  const record = await prisma.buyerRecord.findUnique({
    where: { id: req.params.id },
  });
  if (!record) {
    return res.status(404).json({ message: "Record not found" });
  }
  if (!isRecordVisibleToAdminRole(record, req.auth.role)) {
    return res.status(404).json({ message: "Record not found" });
  }
  res.json(toRecordResponse(record));
});

router.patch("/records/:id", async (req, res) => {
  const body = req.body || {};
  const data = {};
  try {
    if (body.vendorCode !== undefined) data.vendorCode = String(body.vendorCode);
    if (body.vendorName !== undefined) data.vendorName = String(body.vendorName);
    if (body.incomeType !== undefined) data.incomeType = String(body.incomeType);
    if (body.agreementFileName !== undefined) data.agreementFileName = String(body.agreementFileName);
    if (body.agreementFileNames !== undefined) {
      data.agreementFileNames = Array.isArray(body.agreementFileNames) ? body.agreementFileNames : null;
    }
    if (body.amount !== undefined) data.amount = Number(body.amount);
    if (body.periodStart !== undefined) data.periodStart = parseDateOrNull(body.periodStart, "periodStart");
    if (body.periodEnd !== undefined) data.periodEnd = parseDateOrNull(body.periodEnd, "periodEnd");
    if (body.description !== undefined) data.description = String(body.description);
    if (body.status !== undefined) data.status = String(body.status);
    if (body.invoiceReceived !== undefined) data.invoiceReceived = Boolean(body.invoiceReceived);
    if (body.invoice !== undefined) data.invoice = body.invoice;
    if (body.generatedBy !== undefined) data.generatedBy = body.generatedBy == null ? null : String(body.generatedBy);
    if (body.generatedAt !== undefined) data.generatedAt = parseDateOrNull(body.generatedAt, "generatedAt");
    if (body.stampedPaperFileName !== undefined) {
      data.stampedPaperFileName =
        body.stampedPaperFileName == null ? null : String(body.stampedPaperFileName);
    }
    if (body.archivedAt !== undefined) data.archivedAt = parseDateOrNull(body.archivedAt, "archivedAt");
    if (body.publishedAt !== undefined) data.publishedAt = parseDateOrNull(body.publishedAt, "publishedAt");
    if (body.buyerDeadlineNotifiedAt !== undefined) {
      data.buyerDeadlineNotifiedAt = parseDateOrNull(body.buyerDeadlineNotifiedAt, "buyerDeadlineNotifiedAt");
    }
    if (body.financeDeadlineNotifiedAt !== undefined) {
      data.financeDeadlineNotifiedAt = parseDateOrNull(
        body.financeDeadlineNotifiedAt,
        "financeDeadlineNotifiedAt",
      );
    }
  } catch (e) {
    return res.status(400).json({ message: e.message || "Invalid payload" });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  const existing = await prisma.buyerRecord.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }
  if (!assertAdminCanMutate(existing, res, req.auth.role)) return;

  try {
    const updated = await prisma.buyerRecord.update({
      where: { id: req.params.id },
      data,
    });
    res.json(toRecordResponse(updated));
  } catch {
    res.status(404).json({ message: "Record not found" });
  }
});

router.patch("/records/:id/archive", async (req, res) => {
  const archived = req.body?.archived !== false;
  const fileName = req.body?.fileName;
  const existing = await prisma.buyerRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }
  if (!isRecordVisibleToAdminRole(existing, req.auth.role)) {
    return adminMutateForbidden(res, "role");
  }
  if (archived && isRecordLockedForEdit(existing)) {
    return adminMutateForbidden(res, "locked");
  }
  try {
    const updated = await prisma.buyerRecord.update({
      where: { id: req.params.id },
      data: archived
        ? {
            status: "archived",
            archivedAt: new Date(),
            ...(fileName !== undefined && { stampedPaperFileName: String(fileName) }),
          }
        : {
            status: "document_generated",
            archivedAt: null,
          },
    });
    res.json(toRecordResponse(updated));
  } catch {
    res.status(404).json({ message: "Record not found" });
  }
});

router.patch("/records/:id/publish", async (req, res) => {
  const published = req.body?.published !== false;
  const existing = await prisma.buyerRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }
  if (!isRecordVisibleToAdminRole(existing, req.auth.role)) {
    return adminMutateForbidden(res, "role");
  }
  try {
    const updated = await prisma.buyerRecord.update({
      where: { id: req.params.id },
      data: published
        ? {
            status: "history",
            publishedAt: new Date(),
          }
        : {
            publishedAt: null,
            status: "archived",
          },
    });
    res.json(toRecordResponse(updated));
  } catch {
    res.status(404).json({ message: "Record not found" });
  }
});

/** Finance admin: remove stored formula form PDF and clear invoice reference. */
router.delete("/records/:id/files/formula-form", async (req, res) => {
  if (req.auth.role !== "finance_admin") {
    return res.status(403).json({ message: "Finance admin only" });
  }
  try {
    const existing = await prisma.buyerRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (!isRecordVisibleToAdminRole(existing, req.auth.role)) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (!assertAdminCanMutate(existing, res, req.auth.role)) return;

    deleteStoredFile(req.params.id, "formula-form");
    const invoice = invoiceWithoutFormulaForm(existing.invoice);

    const updated = await prisma.buyerRecord.update({
      where: { id: req.params.id },
      data: { invoice },
    });
    res.json(toRecordResponse(updated));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete formula form" });
  }
});

/** Finance admin: save / update invoice (same payload as portal POST /api/records/:id/invoice). */
router.post("/records/:id/invoice", upload.array("formulaFormFiles", 5), async (req, res) => {
  if (req.auth.role !== "finance_admin") {
    return res.status(403).json({ message: "Finance admin only" });
  }
  try {
    const existing = await prisma.buyerRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (!isRecordVisibleToAdminRole(existing, req.auth.role)) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (!assertAdminCanMutate(existing, res, req.auth.role)) return;

    const invoiceRaw = req.body?.invoice;
    const financeName = req.body?.financeName;
    const invoice =
      typeof invoiceRaw === "string" ? JSON.parse(invoiceRaw) : invoiceRaw;
    if (!invoice || typeof invoice !== "object") {
      return res.status(400).json({ message: "Invalid invoice payload" });
    }

    const uploads = Array.isArray(req.files) ? req.files : [];
    const prevNames = getFormulaFormFileNames(existing.invoice);
    const keepSlotsRaw = req.body?.formulaFormKeepSlots;
    const hasKeepSlotsField = keepSlotsRaw != null && String(keepSlotsRaw).trim() !== "";
    let keepSlots = [];
    if (hasKeepSlotsField) {
      try {
        const parsed = typeof keepSlotsRaw === "string" ? JSON.parse(keepSlotsRaw) : keepSlotsRaw;
        if (Array.isArray(parsed)) {
          keepSlots = parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0);
        }
      } catch {
        keepSlots = [];
      }
    }

    if (uploads.length > 0 || hasKeepSlotsField) {
      invoice.formulaFormFileNames = mergeFormulaFormFiles(req.params.id, keepSlots, uploads, prevNames);
    } else if (getFormulaFormFileNames(invoice).length > 0) {
      invoice.formulaFormFileNames = getFormulaFormFileNames(invoice);
    } else if (prevNames.length && storedFileExists(req.params.id, "formula-form")) {
      invoice.formulaFormFileNames = prevNames;
    }
    delete invoice.formulaFormFileName;

    const generatedAt = new Date();
    invoice.number = await allocateFinanceInvoiceNumber(
      prisma,
      req.params.id,
      existing,
      generatedAt,
    );

    const updated = await prisma.buyerRecord.update({
      where: { id: req.params.id },
      data: {
        invoice,
        generatedBy: financeName || existing.generatedBy,
        generatedAt,
        status: ADMIN_TASK_STATUS,
        archivedAt: null,
        publishedAt: null,
      },
    });
    res.json(toRecordResponse(updated));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save invoice" });
  }
});

router.delete("/records/:id", async (req, res) => {
  const existing = await prisma.buyerRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }
  if (!canAdminMutateRecord(existing, req.auth.role)) {
    if (!isRecordVisibleToAdminRole(existing, req.auth.role)) {
      return adminMutateForbidden(res, "role");
    }
    if (req.auth.role === "finance_admin" && existing.status !== ADMIN_TASK_STATUS) {
      return adminMutateForbidden(res, "task");
    }
    if (!isAdminCreatedRecord(existing)) {
      return adminMutateForbidden(res, "portal");
    }
    return adminMutateForbidden(res, "locked");
  }
  try {
    await prisma.buyerRecord.delete({
      where: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ message: "Record not found" });
  }
});

module.exports = router;
