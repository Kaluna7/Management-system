const fs = require("fs");
const path = require("path");

/** Project root: WHSmith Work/ (parent of back-end/) */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const STORAGE_ROOT =
  process.env.RECORDS_STORAGE_PATH || path.join(PROJECT_ROOT, "storage", "records");

const FILE_KINDS = ["agreement", "formula-form", "stamped-paper"];
const FORMULA_FORM_MAX = 5;
const AGREEMENT_MAX = 5;

function recordDir(recordId) {
  const safe = String(recordId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid record id");
  return path.join(STORAGE_ROOT, safe);
}

function extFromOriginal(originalname, fallback = ".bin") {
  const ext = path.extname(originalname || "");
  return ext && ext.length <= 12 ? ext.toLowerCase() : fallback;
}

function storedFileName(kind, originalname) {
  if (kind === "formula-form") return `formula-form${extFromOriginal(originalname, ".pdf")}`;
  return `${kind}${extFromOriginal(originalname, ".pdf")}`;
}

function storedFormulaFormSlotName(slotIndex, originalname) {
  const slot = String(slotIndex + 1).padStart(2, "0");
  return `formula-form-${slot}${extFromOriginal(originalname, ".pdf")}`;
}

function isFormulaFormStoredName(name) {
  return (
    name === "formula-form.pdf" ||
    /^formula-form-\d{2}\./i.test(name) ||
    (name.startsWith("formula-form.") && name !== "formula-form.pdf")
  );
}

function storedAgreementSlotName(slotIndex, originalname) {
  const slot = String(slotIndex + 1).padStart(2, "0");
  return `agreement-${slot}${extFromOriginal(originalname, ".pdf")}`;
}

function isAgreementStoredName(name) {
  return (
    name === "agreement.pdf" ||
    /^agreement-\d{2}\./i.test(name) ||
    (name.startsWith("agreement.") && name !== "agreement.pdf")
  );
}

function listAgreementFilePaths(recordId) {
  const dir = recordDir(recordId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isAgreementStoredName)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(dir, name));
}

function deleteAllAgreementFiles(recordId) {
  for (const fp of listAgreementFilePaths(recordId)) {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}

/**
 * Replace agreement files with kept slots + new uploads (max 5).
 * @returns {string[]} display names
 */
function mergeAgreementFiles(recordId, keepSlots, newUploads, prevDisplayNames = []) {
  const existingPaths = listAgreementFilePaths(recordId);
  const kept = keepSlots
    .filter((i) => Number.isInteger(i) && i >= 0 && i < existingPaths.length)
    .map((i) => ({
      buffer: fs.readFileSync(existingPaths[i]),
      originalname: String(prevDisplayNames[i] || path.basename(existingPaths[i])).trim(),
    }));

  const uploads = (Array.isArray(newUploads) ? newUploads : [])
    .filter((f) => f?.buffer?.length)
    .map((f) => ({
      buffer: f.buffer,
      originalname: String(f.originalname || "agreement.pdf").trim(),
    }));

  const combined = [...kept, ...uploads];
  if (combined.length === 0) {
    throw new Error("At least one agreement file is required");
  }
  if (combined.length > AGREEMENT_MAX) {
    throw new Error(`Maximum ${AGREEMENT_MAX} agreement files allowed`);
  }

  deleteAllAgreementFiles(recordId);
  const dir = ensureRecordDir(recordId);
  const displayNames = [];
  combined.forEach((file, index) => {
    const storedName = storedAgreementSlotName(index, file.originalname);
    fs.writeFileSync(path.join(dir, storedName), file.buffer);
    displayNames.push(file.originalname || storedName);
  });
  return displayNames;
}

function listFormulaFormFilePaths(recordId) {
  const dir = recordDir(recordId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isFormulaFormStoredName)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(dir, name));
}

function ensureRecordDir(recordId) {
  const dir = recordDir(recordId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveRecordFile(recordId, kind, file) {
  if (!FILE_KINDS.includes(kind)) throw new Error(`Unknown file kind: ${kind}`);
  if (!file?.buffer?.length) throw new Error("Empty file");
  const dir = ensureRecordDir(recordId);
  const name = storedFileName(kind, file.originalname);
  const dest = path.join(dir, name);
  fs.writeFileSync(dest, file.buffer);
  return { relativePath: path.join("storage", "records", path.basename(dir), name), fileName: name };
}

function deleteAllFormulaFormFiles(recordId) {
  for (const fp of listFormulaFormFilePaths(recordId)) {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}

/**
 * Replace formula-form files with kept slots + new uploads (max 5).
 * @returns {string[]} display names for invoice JSON
 */
function mergeFormulaFormFiles(recordId, keepSlots, newUploads, prevDisplayNames = []) {
  const existingPaths = listFormulaFormFilePaths(recordId);
  const kept = keepSlots
    .filter((i) => Number.isInteger(i) && i >= 0 && i < existingPaths.length)
    .map((i) => ({
      buffer: fs.readFileSync(existingPaths[i]),
      originalname: String(prevDisplayNames[i] || path.basename(existingPaths[i])).trim(),
    }));

  const uploads = (Array.isArray(newUploads) ? newUploads : [])
    .filter((f) => f?.buffer?.length)
    .map((f) => ({
      buffer: f.buffer,
      originalname: String(f.originalname || "document.pdf").trim(),
    }));

  const combined = [...kept, ...uploads];
  if (combined.length === 0) {
    throw new Error("At least one additional document is required");
  }
  if (combined.length > FORMULA_FORM_MAX) {
    throw new Error(`Maximum ${FORMULA_FORM_MAX} additional documents allowed`);
  }

  deleteAllFormulaFormFiles(recordId);
  const dir = ensureRecordDir(recordId);
  const displayNames = [];
  combined.forEach((file, index) => {
    const storedName = storedFormulaFormSlotName(index, file.originalname);
    fs.writeFileSync(path.join(dir, storedName), file.buffer);
    displayNames.push(file.originalname || storedName);
  });
  return displayNames;
}

function findStoredFile(recordId, kind, index = 0) {
  if (!FILE_KINDS.includes(kind)) return null;
  if (kind === "formula-form") {
    const paths = listFormulaFormFilePaths(recordId);
    return paths[index] ?? null;
  }
  if (kind === "agreement") {
    const paths = listAgreementFilePaths(recordId);
    return paths[index] ?? null;
  }
  const dir = recordDir(recordId);
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f === kind || f.startsWith(`${kind}.`));
  return match ? path.join(dir, match) : null;
}

function storedFileExists(recordId, kind) {
  if (kind === "formula-form") return listFormulaFormFilePaths(recordId).length > 0;
  if (kind === "agreement") return listAgreementFilePaths(recordId).length > 0;
  const fp = findStoredFile(recordId, kind);
  return fp != null && fs.existsSync(fp);
}

function deleteStoredFile(recordId, kind) {
  if (!FILE_KINDS.includes(kind)) return false;
  if (kind === "formula-form") {
    const before = listFormulaFormFilePaths(recordId).length;
    deleteAllFormulaFormFiles(recordId);
    return before > 0;
  }
  if (kind === "agreement") {
    const before = listAgreementFilePaths(recordId).length;
    deleteAllAgreementFiles(recordId);
    return before > 0;
  }
  const fp = findStoredFile(recordId, kind);
  if (!fp || !fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

function deleteRecordFolder(recordId) {
  const dir = recordDir(recordId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function ensureStorageRoot() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

module.exports = {
  STORAGE_ROOT,
  PROJECT_ROOT,
  FILE_KINDS,
  FORMULA_FORM_MAX,
  AGREEMENT_MAX,
  recordDir,
  saveRecordFile,
  findStoredFile,
  listFormulaFormFilePaths,
  listAgreementFilePaths,
  storedFileExists,
  deleteStoredFile,
  deleteAllFormulaFormFiles,
  deleteAllAgreementFiles,
  mergeFormulaFormFiles,
  mergeAgreementFiles,
  deleteRecordFolder,
  ensureStorageRoot,
  storedFileName,
};
