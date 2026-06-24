const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

const DEFAULT_ACCOUNT = {
  beneficiaryName: "PT. Karya Prima Unggulan",
  bankName: "PT. Bank Mayapada, Tbk",
  bankBranch: "Mayapada Tower",
  accountNo: "10030022025",
};

function normalizeForRole(raw) {
  return String(raw ?? "finance").trim().toLowerCase() === "buyers" ? "buyers" : "finance";
}

async function ensureDefaultAccount(forRole) {
  const existing = await prisma.invoiceBankAccount.findFirst({
    where: {
      beneficiaryName: DEFAULT_ACCOUNT.beneficiaryName,
      accountNo: DEFAULT_ACCOUNT.accountNo,
      createdByRole: forRole,
    },
  });
  if (!existing) {
    await prisma.invoiceBankAccount.create({
      data: { ...DEFAULT_ACCOUNT, createdByRole: forRole },
    });
  }
}

router.get("/", async (req, res) => {
  const forRole = normalizeForRole(req.query.forRole);
  if (forRole === "finance") {
    await ensureDefaultAccount(forRole);
  }
  const rows = await prisma.invoiceBankAccount.findMany({
    where: { createdByRole: forRole },
    orderBy: [{ beneficiaryName: "asc" }, { bankName: "asc" }],
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      beneficiaryName: r.beneficiaryName,
      bankName: r.bankName,
      bankBranch: r.bankBranch,
      accountNo: r.accountNo,
    })),
  );
});

router.post("/", async (req, res) => {
  try {
    const beneficiaryName = String(req.body.beneficiaryName ?? "").trim();
    const bankName = String(req.body.bankName ?? "").trim();
    const bankBranch = String(req.body.bankBranch ?? "").trim();
    const accountNo = String(req.body.accountNo ?? "").replace(/\D/g, "");
    const forRole = normalizeForRole(req.body.forRole ?? req.query.forRole);
    if (!beneficiaryName || !bankName || !bankBranch || !accountNo) {
      return res.status(400).json({ message: "All bank fields are required." });
    }
    if (!/^\d+$/.test(accountNo)) {
      return res.status(400).json({ message: "Account number must contain digits only." });
    }
    const created = await prisma.invoiceBankAccount.create({
      data: { beneficiaryName, bankName, bankBranch, accountNo, createdByRole: forRole },
    });
    res.status(201).json({
      id: created.id,
      beneficiaryName: created.beneficiaryName,
      bankName: created.bankName,
      bankBranch: created.bankBranch,
      accountNo: created.accountNo,
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "This bank account already exists." });
    }
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save bank account" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.invoiceBankAccount.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Bank account not found." });
    }
    await prisma.invoiceBankAccount.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete bank account" });
  }
});

module.exports = router;
