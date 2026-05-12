const express = require("express");
const cors = require("cors");
const { prisma } = require("./lib/prisma");
const { runDeadlineReminderJob } = require("./services/deadlineReminderEmails");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");

const app = express();

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
  });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

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
  };
}

app.get("/api/records", async (_req, res) => {
  const records = await prisma.buyerRecord.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(records.map(toRecordResponse));
});

app.delete("/api/records", async (_req, res) => {
  const result = await prisma.buyerRecord.deleteMany({});
  res.json({ deleted: result.count });
});

app.post("/api/records", async (req, res) => {
  const body = req.body;
  const created = await prisma.buyerRecord.create({
    data: {
      vendorCode: body.vendorCode,
      vendorName: body.vendorName,
      incomeType: body.incomeType,
      agreementFileName: body.agreementFileName,
      amount: Number(body.amount),
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      description: body.description,
      createdBy: body.createdBy,
      status: "created",
      invoiceReceived: false,
    },
  });
  res.status(201).json(toRecordResponse(created));
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
  res.json(toRecordResponse(updated));
});

app.post("/api/records/:id/invoice", async (req, res) => {
  const { id } = req.params;
  const { invoice, financeName } = req.body;
  const updated = await prisma.buyerRecord.update({
    where: { id },
    data: {
      invoice,
      generatedBy: financeName,
      generatedAt: new Date(),
      status: "document_generated",
    },
  });
  res.json(toRecordResponse(updated));
});

app.post("/api/records/:id/stamped-paper", async (req, res) => {
  const { id } = req.params;
  const updated = await prisma.buyerRecord.update({
    where: { id },
    data: {
      stampedPaperFileName: req.body.fileName,
      status: "archived",
      archivedAt: new Date(),
    },
  });
  res.json(toRecordResponse(updated));
});

app.post("/api/records/:id/publish", async (req, res) => {
  const { id } = req.params;
  const updated = await prisma.buyerRecord.update({
    where: { id },
    data: {
      publishedAt: new Date(),
      status: "history",
    },
  });
  res.json(toRecordResponse(updated));
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
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
