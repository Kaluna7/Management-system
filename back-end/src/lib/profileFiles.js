const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const PROFILES_ROOT =
  process.env.PROFILES_STORAGE_PATH || path.join(PROJECT_ROOT, "storage", "profiles");

const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_BYTES = 5 * 1024 * 1024;

function safeUserId(userId) {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) throw new Error("Invalid user id");
  return safe;
}

function profileDir(userId) {
  return path.join(PROFILES_ROOT, safeUserId(userId));
}

function extFromOriginal(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return ALLOWED_IMAGE_EXT.has(ext) ? ext : ".jpg";
}

function ensureProfileDir(userId) {
  const dir = profileDir(userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveProfileImage(userId, file) {
  if (!file?.buffer?.length) throw new Error("Empty file");
  if (file.buffer.length > MAX_BYTES) throw new Error("Image must be 5 MB or smaller.");
  const mime = (file.mimetype || "").toLowerCase();
  if (!mime.startsWith("image/")) throw new Error("File must be an image.");

  const dir = ensureProfileDir(userId);
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("profile.")) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {
        /* ignore */
      }
    }
  }

  const fileName = `profile${extFromOriginal(file.originalname)}`;
  const dest = path.join(dir, fileName);
  fs.writeFileSync(dest, file.buffer);
  return fileName;
}

function findProfileImagePath(userId) {
  const dir = profileDir(userId);
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith("profile."));
  return match ? path.join(dir, match) : null;
}

function deleteProfileImage(userId) {
  const fp = findProfileImagePath(userId);
  if (!fp || !fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

function ensureProfilesRoot() {
  fs.mkdirSync(PROFILES_ROOT, { recursive: true });
}

module.exports = {
  PROFILES_ROOT,
  MAX_BYTES,
  saveProfileImage,
  findProfileImagePath,
  deleteProfileImage,
  ensureProfilesRoot,
};
