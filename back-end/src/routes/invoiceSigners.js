const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

const SIGNER_TITLES = ["Finance Manager", "Head of Finance", "Controller"];

const DEFAULT_SIGNERS = [
  { title: "Finance Manager", name: "Christine Mariana" },
];

function normalizeForRole(raw) {
  return String(raw ?? "finance").trim().toLowerCase() === "buyers" ? "buyers" : "finance";
}

async function ensureDefaultSigners(forRole) {
  for (const row of DEFAULT_SIGNERS) {
    const existing = await prisma.invoiceSigner.findFirst({
      where: {
        title: row.title,
        name: row.name,
        createdByRole: forRole,
      },
    });
    if (!existing) {
      await prisma.invoiceSigner.create({
        data: { ...row, createdByRole: forRole },
      });
    }
  }
}

router.get("/", async (req, res) => {
  const forRole = normalizeForRole(req.query.forRole);
  if (forRole === "finance") {
    await ensureDefaultSigners(forRole);
  }
  const rows = await prisma.invoiceSigner.findMany({
    where: { createdByRole: forRole },
    orderBy: [{ title: "asc" }, { name: "asc" }],
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      name: r.name,
    })),
  );
});

router.get("/titles", (_req, res) => {
  res.json(SIGNER_TITLES);
});

router.post("/", async (req, res) => {
  try {
    const title = String(req.body.title ?? "").trim();
    const name = String(req.body.name ?? "").trim();
    const forRole = normalizeForRole(req.body.forRole ?? req.query.forRole);
    if (!title || !name) {
      return res.status(400).json({ message: "Title and name are required." });
    }
    const created = await prisma.invoiceSigner.create({
      data: { title, name, createdByRole: forRole },
    });
    res.status(201).json({
      id: created.id,
      title: created.title,
      name: created.name,
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "This signatory already exists." });
    }
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save signatory" });
  }
});

/** Delete all signatories under a position/title for this role. */
router.delete("/by-title", async (req, res) => {
  try {
    const title = String(req.query.title ?? "").trim();
    const forRole = normalizeForRole(req.query.forRole);
    if (!title) {
      return res.status(400).json({ message: "Title is required." });
    }
    const result = await prisma.invoiceSigner.deleteMany({
      where: { title, createdByRole: forRole },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: "No signatories found for this title." });
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete signatories" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.invoiceSigner.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ message: "Signatory not found." });
    }
    await prisma.invoiceSigner.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete signatory" });
  }
});

module.exports = router;
