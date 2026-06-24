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

module.exports = router;
