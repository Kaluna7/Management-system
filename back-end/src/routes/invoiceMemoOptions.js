const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

const REBATE_TEMPLATE = "rebate_bonus_tier";

function normalizeForRole(raw) {
  return String(raw ?? "finance").trim().toLowerCase() === "buyers" ? "buyers" : "finance";
}

async function ensureDefaultRebateOption(forRole) {
  const existing = await prisma.invoiceMemoOption.findFirst({
    where: { template: REBATE_TEMPLATE, createdByRole: forRole },
  });
  if (!existing) {
    await prisma.invoiceMemoOption.create({
      data: {
        label: "Rebate Bonus Tier",
        template: REBATE_TEMPLATE,
        sortOrder: 0,
        createdByRole: forRole,
      },
    });
    return;
  }
  if (existing.label !== "Rebate Bonus Tier") {
    await prisma.invoiceMemoOption.update({
      where: { id: existing.id },
      data: { label: "Rebate Bonus Tier", sortOrder: 0 },
    });
  }
}

router.get("/", async (req, res) => {
  const forRole = normalizeForRole(req.query.forRole);
  if (forRole === "finance") {
    await ensureDefaultRebateOption(forRole);
  }
  const rows = await prisma.invoiceMemoOption.findMany({
    where: { createdByRole: forRole },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      template: r.template,
    })),
  );
});

router.post("/", async (req, res) => {
  try {
    const label = String(req.body.label ?? "").trim();
    const forRole = normalizeForRole(req.body.forRole ?? req.query.forRole);
    if (!label) {
      return res.status(400).json({ message: "Memo label is required." });
    }
    const created = await prisma.invoiceMemoOption.create({
      data: { label, template: "custom", sortOrder: 100, createdByRole: forRole },
    });
    res.status(201).json({
      id: created.id,
      label: created.label,
      template: created.template,
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "This memo option already exists." });
    }
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save memo option" });
  }
});

module.exports = router;
