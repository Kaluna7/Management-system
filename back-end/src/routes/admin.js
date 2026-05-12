const { Router } = require("express");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");

const router = Router();

const ADMIN_ROLES = new Set(["finance_admin", "buyers_admin"]);

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
  return {
    ...record,
    amount: Number(record.amount),
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    createdAt: record.createdAt.toISOString(),
    generatedAt: record.generatedAt ? record.generatedAt.toISOString() : null,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
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

router.use(requireAdmin);

router.get("/records", async (_req, res) => {
  const records = await prisma.buyerRecord.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(records.map(toRecordResponse));
});

router.get("/records/:id", async (req, res) => {
  const record = await prisma.buyerRecord.findUnique({
    where: { id: req.params.id },
  });
  if (!record) {
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
    if (body.amount !== undefined) data.amount = Number(body.amount);
    if (body.periodStart !== undefined) data.periodStart = parseDateOrNull(body.periodStart, "periodStart");
    if (body.periodEnd !== undefined) data.periodEnd = parseDateOrNull(body.periodEnd, "periodEnd");
    if (body.description !== undefined) data.description = String(body.description);
    if (body.createdBy !== undefined) data.createdBy = String(body.createdBy);
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

router.delete("/records/:id", async (req, res) => {
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
