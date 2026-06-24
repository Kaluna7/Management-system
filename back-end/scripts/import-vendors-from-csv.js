/**
 * Import vendors from CSV into table "Vendor".
 *
 * Usage (from back-end folder):
 *   node scripts/import-vendors-from-csv.js path\to\vendors.csv
 *
 * CSV must have a header row. Uses column "CODE" (e.g. S50109), not "Code" (e.g. S).
 * Column "NAME" for vendor name. Other columns are ignored.
 * Comma or semicolon separator (Excel Indonesia often uses ;).
 *
 * Example:
 *   CODE,NAME
 *   V-001,PT. CONTOH
 *   V-002,"PT. ABC, TBK"
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CODE_HEADERS = new Set(["code", "vendor_code", "vendorcode", "kode", "kode_vendor"]);
const NAME_HEADERS = new Set(["name", "vendor_name", "vendorname", "nama", "nama_vendor"]);

function normalizeHeader(cell) {
  return String(cell || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function findCodeColumnIndex(headerCells) {
  const trimmed = headerCells.map((h) => h.trim());
  const idx = trimmed.findIndex((h) => h === "CODE");
  if (idx >= 0) return idx;
  throw new Error(
    'Column header "CODE" not found. Your file has "Code" and "CODE" — only "CODE" (e.g. S50109) is imported.',
  );
}

function findNameColumnIndex(headerCells) {
  const trimmed = headerCells.map((h) => h.trim());
  const idx = trimmed.findIndex((h) => h === "NAME");
  if (idx >= 0) return idx;
  const normalized = headerCells.map(normalizeHeader);
  const fallback = normalized.findIndex((h) => NAME_HEADERS.has(h));
  if (fallback >= 0) return fallback;
  throw new Error('Column header "NAME" not found.');
}

function isSubHeaderOrInvalidRow(code, name) {
  if (!code || !name) return true;
  const c = code.toUpperCase();
  const n = name.trim();
  const nl = n.toLowerCase();
  if (c === "CODE" || nl === "name") return true;
  // Excel baris 2 (judul kolom komisi), bukan nama vendor yang kebetulan ada kata "promotion"
  if (/^margin\s*\(%\)/i.test(n) || /^promotion\s*\(%\)/i.test(n) || /^barcode$/i.test(n))
    return true;
  if (/^komi(si)?$/i.test(code) || /^incoming$/i.test(code)) return true;
  return false;
}

function detectDelimiter(firstLine) {
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

/** Minimal RFC-style CSV row parser (handles quoted fields). */
function parseCsvLine(line, delimiter = ",") {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function readCsvRows(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.");
  }
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = parseCsvLine(lines[0], delimiter);
  const codeIdx = findCodeColumnIndex(headerCells);
  const nameIdx = findNameColumnIndex(headerCells);

  const ignored =
    headerCells.length > 2
      ? headerCells.filter((_, i) => i !== codeIdx && i !== nameIdx)
      : [];
  console.log(
    `Using: "${headerCells[codeIdx]}" → code, "${headerCells[nameIdx]}" → name (delimiter: "${delimiter}")`,
  );
  if (ignored.length > 0) {
    console.log(`Ignored ${ignored.length} other column(s): ${ignored.join(", ")}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const code = String(cells[codeIdx] ?? "").trim();
    const name = String(cells[nameIdx] ?? "").trim();
    if (!code && !name) continue;
    if (isSubHeaderOrInvalidRow(code, name)) continue;
    if (!code || !name) {
      console.warn(`Skipping line ${i + 1}: missing code or name`);
      continue;
    }
    rows.push({ code, name });
  }
  return rows;
}

function createId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 12);
  return `v${t}${r}`;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--clear");
  const clearFirst = process.argv.includes("--clear");
  const fileArg = args[0];
  if (!fileArg) {
    console.error("Usage: node scripts/import-vendors-from-csv.js <path-to.csv> [--clear]");
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const rows = readCsvRows(filePath);
  if (rows.length === 0) {
    console.error("No valid rows to import.");
    process.exit(1);
  }

  if (clearFirst) {
    const deleted = await prisma.vendor.deleteMany({});
    console.log(`Cleared ${deleted.count} existing vendor row(s).`);
  }

  const now = new Date();
  const data = rows.map((row) => ({
    id: createId(),
    code: row.code,
    name: row.name,
    createdAt: now,
    updatedAt: now,
  }));

  const result = await prisma.vendor.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(`File: ${filePath}`);
  console.log(`Rows in CSV: ${rows.length}`);
  console.log(`Inserted: ${result.count}`);
  if (result.count < rows.length) {
    console.log(
      `${rows.length - result.count} row(s) skipped (duplicate code or already in DB).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
