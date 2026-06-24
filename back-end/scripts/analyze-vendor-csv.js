/**
 * Report why CSV line count differs from importable vendor rows.
 * Usage: node scripts/analyze-vendor-csv.js path\to.csv
 */
const fs = require("fs");
const path = require("path");

function detectDelimiter(firstLine) {
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

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
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function isSubHeaderOrInvalidRow(code, name) {
  if (!code || !name) return "empty CODE or NAME";
  const c = code.toUpperCase();
  const n = name.toLowerCase();
  if (c === "CODE" || n === "name") return "sub-header row (baris 2 Excel)";
  if (/^margin\s*\(%\)/i.test(name) || /^promotion\s*\(%\)/i.test(name) || /^barcode$/i.test(name))
    return "sub-header komisi";
  if (/^komi(si)?$/i.test(code) || /^incoming$/i.test(code)) return "sub-header";
  return null;
}

function main() {
  const filePath = path.resolve(process.cwd(), process.argv[2]);
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = parseCsvLine(lines[0], delimiter);
  const codeIdx = headerCells.findIndex((h) => h.trim() === "CODE");
  const nameIdx = headerCells.findIndex((h) => h.trim() === "NAME");

  const skipped = [];
  const valid = [];
  const codeCount = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const code = String(cells[codeIdx] ?? "").trim();
    const name = String(cells[nameIdx] ?? "").trim();
    const why = isSubHeaderOrInvalidRow(code, name);
    if (why) {
      skipped.push({ excelLine: i + 1, why, code, name: name.slice(0, 50) });
      continue;
    }
    const prev = codeCount.get(code) || 0;
    codeCount.set(code, prev + 1);
    if (prev > 0) {
      skipped.push({ excelLine: i + 1, why: `duplicate CODE "${code}"`, code, name: name.slice(0, 50) });
    }
    valid.push({ excelLine: i + 1, code, name });
  }

  const uniqueCodes = codeCount.size;
  const dupInFile = [...codeCount.entries()].filter(([, n]) => n > 1);

  console.log("=== Analisis CSV vendor ===\n");
  console.log(`Total baris di file (termasuk kosong dihapus): ${lines.length}`);
  console.log(`Baris 1 = header`);
  console.log(`Baris data (2–${lines.length}): ${lines.length - 1}`);
  console.log(`\nYang bisa di-import (unik CODE + NAME): ${uniqueCodes}`);
  console.log(`Baris dilewati saat import: ${skipped.length}`);
  console.log(`\nSelisih ${lines.length} baris file vs ${uniqueCodes} vendor:`);
  console.log(`  • 1 baris header`);
  console.log(`  • ${skipped.length} baris bukan data vendor / duplikat`);

  if (skipped.length > 0) {
    console.log("\n--- Baris yang dilewati ---");
    for (const s of skipped.slice(0, 20)) {
      console.log(`  Baris ${s.excelLine}: ${s.why} | CODE="${s.code}" NAME="${s.name}"`);
    }
    if (skipped.length > 20) console.log(`  ... dan ${skipped.length - 20} lainnya`);
  }

  if (dupInFile.length > 0) {
    console.log(`\n--- Kode CODE duplikat di file (${dupInFile.length} kode) ---`);
    for (const [code, n] of dupInFile.slice(0, 10)) {
      console.log(`  ${code}: muncul ${n}x (hanya 1 yang masuk DB)`);
    }
  }
}

main();
