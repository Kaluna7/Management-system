const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

router.get("/", async (_req, res) => {
  const vendors = await prisma.vendor.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true },
  });
  res.json(vendors);
});

router.post("/", async (req, res) => {
  try {
    const code = String(req.body?.code ?? "").trim();
    const name = String(req.body?.name ?? "").trim();
    if (!code || !name) {
      return res.status(400).json({ message: "Vendor code and name are required." });
    }
    const created = await prisma.vendor.create({
      data: { code, name },
      select: { code: true, name: true },
    });
    res.status(201).json(created);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return res.status(409).json({ message: "Vendor code already exists." });
    }
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to create vendor" });
  }
});

router.delete("/:code", async (req, res) => {
  try {
    const code = decodeURIComponent(String(req.params.code ?? "")).trim();
    if (!code) {
      return res.status(400).json({ message: "Vendor code is required." });
    }
    const existing = await prisma.vendor.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Vendor not found." });
    }
    const recordCount = await prisma.buyerRecord.count({ where: { vendorCode: code } });
    if (recordCount > 0) {
      return res.status(409).json({
        message: `Cannot delete vendor: ${recordCount} record(s) still use this code.`,
      });
    }
    await prisma.vendor.delete({ where: { code } });
    res.json({ ok: true, code });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete vendor" });
  }
});

module.exports = router;
