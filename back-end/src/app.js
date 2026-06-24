const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const {
  agreementUploadMiddleware,
  formulaFormUploadMiddleware,
} = require("./lib/multipartUpload");
const { prisma } = require("./lib/prisma");
const {
  runDeadlineReminderJob,
  sendDeadlineReminderForRecord,
} = require("./services/deadlineReminderEmails");
const {
  saveRecordFile,
  findStoredFile,
  listFormulaFormFilePaths,
  storedFileExists,
  mergeFormulaFormFiles,
  mergeAgreementFiles,
  ensureStorageRoot,
  STORAGE_ROOT,
  AGREEMENT_MAX,
  listAgreementFilePaths,
} = require("./lib/recordFiles");
const { getFormulaFormFileNames } = require("./lib/invoiceJson");
const {
  getAgreementFileNames,
  applyAgreementFileNamesToRecordData,
} = require("./lib/agreementJson");
const { ensureProfilesRoot } = require("./lib/profileFiles");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const vendorsRouter = require("./routes/vendors");
const invoiceBankAccountsRouter = require("./routes/invoiceBankAccounts");
const invoiceMemoOptionsRouter = require("./routes/invoiceMemoOptions");
const invoiceSignersRouter = require("./routes/invoiceSigners");
const { emitRecordCreated, emitRecordUpdated } = require("./lib/realtime");
const {
  allocateFinanceInvoiceNumber,
  backfillInvalidFinanceInvoiceNumbers,
} = require("./lib/invoiceNumber");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

ensureStorageRoot();
ensureProfilesRoot();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Backend Express.js berjalan",
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "back-end",
    timestamp: new Date().toISOString(),
    recordsStoragePath: STORAGE_ROOT,
  });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/vendors", vendorsRouter);
app.use("/api/invoice-bank-accounts", invoiceBankAccountsRouter);
app.use("/api/invoice-memo-options", invoiceMemoOptionsRouter);
app.use("/api/invoice-signers", invoiceSignersRouter);

function normalizePortalCreatedByRole(raw) {
  const role = String(raw ?? "buyers").trim().toLowerCase();
  if (role === "finance") return "finance";
  if (role === "buyers") return "buyers";
  return "buyers";
}

function toRecordResponse(record) {
  return {
    ...record,
    amount: Number(record.amount),
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    createdAt: record.createdAt.toISOString(),
    generatedAt: record.generatedAt ? record.generatedAt.toISOString() : undefined,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : undefined,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : undefined,
    buyerDeadlineNotifiedAt: record.buyerDeadlineNotifiedAt
      ? record.buyerDeadlineNotifiedAt.toISOString()
      : undefined,
    financeDeadlineNotifiedAt: record.financeDeadlineNotifiedAt
      ? record.financeDeadlineNotifiedAt.toISOString()
      : undefined,
    buyerEditRequestStatus: record.buyerEditRequestStatus ?? undefined,
    buyerEditRequestedAt: record.buyerEditRequestedAt
      ? record.buyerEditRequestedAt.toISOString()
      : undefined,
    buyerEditRequestedBy: record.buyerEditRequestedBy ?? undefined,
    buyerEditResolvedAt: record.buyerEditResolvedAt
      ? record.buyerEditResolvedAt.toISOString()
      : undefined,
    buyerEditResolvedBy: record.buyerEditResolvedBy ?? undefined,
  };
}

app.get("/api/records", async (_req, res) => {
  try {
    await backfillInvalidFinanceInvoiceNumbers(prisma);
    const records = await prisma.buyerRecord.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(records.map(toRecordResponse));
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load records" });
  }
});

app.delete("/api/records", async (_req, res) => {
  const result = await prisma.buyerRecord.deleteMany({});
  res.json({ deleted: result.count });
});

app.post("/api/records", agreementUploadMiddleware, async (req, res) => {
  try {
    const body = req.body;
    const uploads = Array.isArray(req.agreementUploads) ? req.agreementUploads : [];
    if (uploads.length === 0) {
      return res.status(400).json({ message: "Agreement file is required." });
    }
    if (uploads.length > AGREEMENT_MAX) {
      return res.status(400).json({ message: `Maximum ${AGREEMENT_MAX} agreement files allowed.` });
    }
    let agreementFileName = uploads[0].originalname || String(body.agreementFileName || "").trim() || "agreement.pdf";
    const created = await prisma.buyerRecord.create({
      data: {
        vendorCode: body.vendorCode,
        vendorName: body.vendorName,
        incomeType: body.incomeType,
        agreementFileName,
        amount: Number(body.amount),
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        description: body.description,
        createdBy: body.createdBy,
        createdByAdmin: false,
        createdByRole: normalizePortalCreatedByRole(body.createdByRole),
        status: "created",
        invoiceReceived: false,
      },
    });
    const displayNames = mergeAgreementFiles(created.id, [], uploads, []);
    await prisma.buyerRecord.update({
      where: { id: created.id },
      data: applyAgreementFileNamesToRecordData(displayNames),
    });
    const fresh = await prisma.buyerRecord.findUnique({ where: { id: created.id } });
    const response = toRecordResponse(fresh);
    emitRecordCreated(response);
    try {
      await sendDeadlineReminderForRecord(created.id);
    } catch (reminderErr) {
      console.error("[deadline-reminders:create]", reminderErr);
    }
    res.status(201).json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to create record" });
  }
});

const BUYER_PORTAL_LOCKED_STATUSES = new Set(["document_generated", "archived", "history"]);

function assertBuyerPortalRecordEditable(record, res) {
  if (record.createdByAdmin || record.createdByRole !== "buyers") {
    res.status(403).json({ message: "This record cannot be edited from the buyers portal." });
    return false;
  }
  if (
    record.buyerEditRequestStatus === "approved" &&
    record.status === "document_generated"
  ) {
    return true;
  }
  if (BUYER_PORTAL_LOCKED_STATUSES.has(record.status)) {
    res.status(403).json({ message: "Record cannot be edited after finance has processed the invoice." });
    return false;
  }
  return true;
}

app.patch("/api/records/:id", agreementUploadMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (!assertBuyerPortalRecordEditable(existing, res)) return;

    const body = req.body || {};
    const data = {};
    if (body.vendorCode !== undefined) data.vendorCode = String(body.vendorCode);
    if (body.vendorName !== undefined) data.vendorName = String(body.vendorName);
    if (body.incomeType !== undefined) data.incomeType = String(body.incomeType);
    if (body.amount !== undefined) data.amount = Number(body.amount);
    if (body.periodStart !== undefined) data.periodStart = new Date(body.periodStart);
    if (body.periodEnd !== undefined) data.periodEnd = new Date(body.periodEnd);
    if (body.description !== undefined) data.description = String(body.description);

    const uploads = Array.isArray(req.agreementUploads) ? req.agreementUploads : [];
    const prevNames = getAgreementFileNames(existing);
    const keepSlotsRaw = body.agreementKeepSlots;
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
      const existingPaths = listAgreementFilePaths(id);
      const validKeepCount = keepSlots.filter(
        (i) => Number.isInteger(i) && i >= 0 && i < existingPaths.length,
      ).length;
      if (validKeepCount + uploads.length > AGREEMENT_MAX) {
        return res.status(400).json({
          message: `Maximum ${AGREEMENT_MAX} agreement files allowed.`,
        });
      }
      const displayNames = mergeAgreementFiles(id, keepSlots, uploads, prevNames);
      Object.assign(data, applyAgreementFileNamesToRecordData(displayNames));
    }

    if (existing.buyerEditRequestStatus === "approved") {
      data.buyerEditRequestStatus = null;
      data.buyerEditRequestedAt = null;
      data.buyerEditRequestedBy = null;
      data.buyerEditResolvedAt = null;
      data.buyerEditResolvedBy = null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields provided for update" });
    }

    const updated = await prisma.buyerRecord.update({
      where: { id },
      data,
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to update record" });
  }
});

app.patch("/api/records/:id/invoice-received", async (req, res) => {
  const { id } = req.params;
  const invoiceReceived = Boolean(req.body.invoiceReceived);
  const updated = await prisma.buyerRecord.update({
    where: { id },
    data: {
      invoiceReceived,
      status: invoiceReceived ? "invoice_pending" : "created",
    },
  });
  const response = toRecordResponse(updated);
  emitRecordUpdated(response);
  res.json(response);
});

app.post("/api/records/:id/invoice", formulaFormUploadMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Record not found" });
    }
    if (existing.buyerEditRequestStatus === "approved") {
      return res.status(409).json({
        message: "Buyer is editing this record. Finance actions are paused until the buyer saves.",
      });
    }
    const invoiceRaw = req.body?.invoice;
    const financeName = req.body?.financeName;
    const invoice =
      typeof invoiceRaw === "string"
        ? JSON.parse(invoiceRaw)
        : invoiceRaw;
    if (!invoice || typeof invoice !== "object") {
      return res.status(400).json({ message: "Invalid invoice payload" });
    }

    const uploads = Array.isArray(req.formulaFormUploads) ? req.formulaFormUploads : [];
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
      invoice.formulaFormFileNames = mergeFormulaFormFiles(id, keepSlots, uploads, prevNames);
    } else if (getFormulaFormFileNames(invoice).length > 0) {
      invoice.formulaFormFileNames = getFormulaFormFileNames(invoice);
    } else if (prevNames.length && storedFileExists(id, "formula-form")) {
      invoice.formulaFormFileNames = prevNames;
    }
    delete invoice.formulaFormFileName;

    const generatedAt = new Date();
    invoice.number = await allocateFinanceInvoiceNumber(prisma, id, existing, generatedAt);
    const updated = await prisma.buyerRecord.update({
      where: { id },
      data: {
        invoice,
        generatedBy: financeName,
        generatedAt,
        status: "document_generated",
        archivedAt: null,
        publishedAt: null,
      },
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save invoice" });
  }
});

app.post("/api/records/:id/stamped-paper", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Record not found" });
    if (existing.buyerEditRequestStatus === "approved") {
      return res.status(409).json({
        message: "Buyer is editing this record. Finance actions are paused until the buyer saves.",
      });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Stamped paper file is required." });
    }
    const saved = saveRecordFile(id, "stamped-paper", req.file);
    const updated = await prisma.buyerRecord.update({
      where: { id },
      data: {
        stampedPaperFileName: saved.fileName,
      },
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to upload stamped paper" });
  }
});

/** Download stored agreement file by index (0-based). */
app.get("/api/records/:id/files/agreement/:index", async (req, res) => {
  try {
    const { id } = req.params;
    const index = Number.parseInt(req.params.index, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: "Invalid file index" });
    }
    const record = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ message: "Record not found" });

    const filePath = findStoredFile(id, "agreement", index);
    if (!filePath) {
      return res.status(404).json({ message: "File not found on server" });
    }

    const names = getAgreementFileNames(record);
    const downloadName = names[index] || path.basename(filePath);
    res.download(filePath, downloadName);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Download failed" });
  }
});

/** Download stored document: agreement | formula-form | stamped-paper */
app.get("/api/records/:id/files/formula-form/:index", async (req, res) => {
  try {
    const { id } = req.params;
    const index = Number.parseInt(req.params.index, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: "Invalid file index" });
    }
    const record = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ message: "Record not found" });

    const paths = listFormulaFormFilePaths(id);
    const filePath = paths[index];
    if (!filePath) {
      return res.status(404).json({ message: "File not found on server" });
    }

    const names = getFormulaFormFileNames(record.invoice);
    const downloadName = names[index] || path.basename(filePath);
    res.download(filePath, downloadName);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Download failed" });
  }
});

/** Download stored document: agreement | formula-form | stamped-paper */
app.get("/api/records/:id/files/:kind", async (req, res) => {
  try {
    const { id, kind } = req.params;
    const allowed = ["agreement", "formula-form", "stamped-paper"];
    if (!allowed.includes(kind)) {
      return res.status(400).json({ message: "Invalid file kind" });
    }
    const record = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ message: "Record not found" });

    const filePath = findStoredFile(id, kind, 0);
    if (!filePath) {
      return res.status(404).json({ message: "File not found on server" });
    }

    let downloadName = path.basename(filePath);
    if (kind === "agreement") downloadName = record.agreementFileName || downloadName;
    if (kind === "stamped-paper") downloadName = record.stampedPaperFileName || downloadName;
    if (kind === "agreement") {
      const names = getAgreementFileNames(record);
      downloadName = names[0] || downloadName;
    }
    if (kind === "formula-form") {
      const names = getFormulaFormFileNames(record.invoice);
      downloadName = names[0] || downloadName;
    }

    res.download(filePath, downloadName);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Download failed" });
  }
});

/** Buyer asks finance to revert task record so buyer can fix wrong input. */
app.post("/api/records/:id/buyer-edit-request", async (req, res) => {
  try {
    const { id } = req.params;
    const buyerName = String(req.body?.buyerName ?? "").trim();
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Record not found" });
    if (existing.createdByAdmin || existing.createdByRole !== "buyers") {
      return res.status(403).json({ message: "This record cannot request edits from the buyers portal." });
    }
    if (existing.status !== "document_generated") {
      return res.status(400).json({ message: "Edit permission can only be requested while finance is processing this record." });
    }
    if (existing.buyerEditRequestStatus === "pending") {
      return res.status(409).json({ message: "An edit request is already pending for this record." });
    }
    const now = new Date();
    const updated = await prisma.buyerRecord.update({
      where: { id },
      data: {
        buyerEditRequestStatus: "pending",
        buyerEditRequestedAt: now,
        buyerEditRequestedBy: buyerName || existing.createdBy,
        buyerEditResolvedAt: null,
        buyerEditResolvedBy: null,
      },
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to request edit permission" });
  }
});

/** Finance approves or denies a buyer edit request on a task record. */
app.patch("/api/records/:id/buyer-edit-request", async (req, res) => {
  try {
    const { id } = req.params;
    const decision = String(req.body?.decision ?? "").trim().toLowerCase();
    const financeName = String(req.body?.financeName ?? "").trim();
    if (decision !== "approve" && decision !== "deny") {
      return res.status(400).json({ message: 'decision must be "approve" or "deny"' });
    }
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Record not found" });
    if (existing.status !== "document_generated") {
      return res.status(400).json({ message: "This record is not in the finance task queue." });
    }
    if (existing.buyerEditRequestStatus !== "pending") {
      return res.status(400).json({ message: "No pending buyer edit request for this record." });
    }
    const now = new Date();
    if (decision === "deny") {
      const updated = await prisma.buyerRecord.update({
        where: { id },
        data: {
          buyerEditRequestStatus: "denied",
          buyerEditResolvedAt: now,
          buyerEditResolvedBy: financeName || null,
        },
      });
      const response = toRecordResponse(updated);
      emitRecordUpdated(response);
      return res.json(response);
    }
    const updated = await prisma.buyerRecord.update({
      where: { id },
      data: {
        buyerEditRequestStatus: "approved",
        buyerEditResolvedAt: now,
        buyerEditResolvedBy: financeName || null,
      },
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to resolve edit request" });
  }
});

app.post("/api/records/:id/publish", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.buyerRecord.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Record not found" });
    if (existing.buyerEditRequestStatus === "approved") {
      return res.status(409).json({
        message: "Buyer is editing this record. Finance actions are paused until the buyer saves.",
      });
    }
    if (!existing.stampedPaperFileName) {
      return res.status(400).json({ message: "Upload stamped paper before publishing." });
    }
    const now = new Date();
    const updated = await prisma.buyerRecord.update({
      where: { id },
      data: {
        publishedAt: now,
        status: "history",
        archivedAt: existing.archivedAt ?? now,
      },
    });
    const response = toRecordResponse(updated);
    emitRecordUpdated(response);
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to publish" });
  }
});

/** Manual / external cron: kirim email peringatan end date (Buyers vs Finance, isi berbeda). */
app.post("/api/notifications/run-deadline-reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const result = await runDeadlineReminderJob();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Job failed" });
  }
});

app.use((err, _req, res, _next) => {
  if (err && err.name === "MulterError") {
    const maxHint =
      err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT"
        ? "Too many files in this upload."
        : err.message;
    return res.status(400).json({ message: maxHint || "Upload failed." });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
