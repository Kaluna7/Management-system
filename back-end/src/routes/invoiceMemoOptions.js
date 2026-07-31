const express = require("express");
const { prisma } = require("../lib/prisma");
const { cache, TTL, invalidateInvoiceOptionsCache } = require("../lib/memoryCache");

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
    invalidateInvoiceOptionsCache();
    return;
  }
  if (existing.label !== "Rebate Bonus Tier") {
    await prisma.invoiceMemoOption.update({
      where: { id: existing.id },
      data: { label: "Rebate Bonus Tier", sortOrder: 0 },
    });
    invalidateInvoiceOptionsCache();
  }
}

router.get("/", async (req, res) => {
  try {
    const forRole = normalizeForRole(req.query.forRole);
    const cacheKey = `invoice-options:memo:${forRole}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      res.set("Cache-Control", "private, max-age=30");
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    if (forRole === "finance") {
      await ensureDefaultRebateOption(forRole);
    }

    const rows = await prisma.invoiceMemoOption.findMany({
      where: { createdByRole: forRole },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    const payload = rows.map((r) => ({
      id: r.id,
      label: r.label,
      template: r.template,
    }));
    cache.set(cacheKey, payload, TTL.invoiceOptions);
    res.set("Cache-Control", "private, max-age=30");
    res.set("X-Cache", "MISS");
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load memo options" });
  }
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
    invalidateInvoiceOptionsCache();
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
