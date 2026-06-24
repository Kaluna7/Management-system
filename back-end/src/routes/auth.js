const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const { sendHtmlMail, smtpConfigured, smtpMissingHint } = require("../lib/mailer");
const {
  findUserByGoogleSub,
  findUserByEmail,
  findUserById,
  insertUserFromGoogle,
  insertUserFromEmail,
  linkGoogleAccount,
} = require("../lib/userSql");
const {
  saveProfileImage,
  findProfileImagePath,
  deleteProfileImage,
} = require("../lib/profileFiles");
const { renderVerificationEmail, renderPasswordResetEmail } = require("../lib/finlyEmailTemplate");

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const VALID_AVATAR_PRESETS = new Set(
  Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0")),
);

const BCRYPT_ROUNDS = 10;
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

const router = Router();

/** Anti-spam: min gap before a *new* code email (ms). Tier 0: 1 min; >3 resends: 30 min; escalated: 1 h. */
const COOLDOWN_MS_TIER0 = 60 * 1000;
const COOLDOWN_MS_TIER1 = 30 * 60 * 1000;
const COOLDOWN_MS_TIER2 = 60 * 60 * 1000;
const RESEND_COUNT_HEAVY = 3; // more than 3 resends → 30 min floor

/** Dev only: ROLE_VERIFY_NO_COOLDOWN=true — skip resend wait; email tetap dikirim. */
const ROLE_VERIFY_NO_COOLDOWN =
  String(process.env.ROLE_VERIFY_NO_COOLDOWN || process.env.ROLE_VERIFY_DEBUG || "")
    .toLowerCase() === "true" ||
  process.env.ROLE_VERIFY_NO_COOLDOWN === "1" ||
  process.env.ROLE_VERIFY_DEBUG === "1";
function cooldownMsForUser(user) {
  const tier = user.roleVerifyCooldownTier ?? 0;
  if (tier >= 2) return COOLDOWN_MS_TIER2;
  if ((user.roleVerifyResendCount ?? 0) > RESEND_COUNT_HEAVY) return COOLDOWN_MS_TIER1;
  return COOLDOWN_MS_TIER0;
}

/** Seconds left until user may request a new code (0 = no wait). Syncs with POST /role/send-code rules. */
function remainingSendCooldownSec(user) {
  if (ROLE_VERIFY_NO_COOLDOWN) return 0;
  if (!user?.roleVerifyLastSentAt) return 0;
  const cooldownMs = cooldownMsForUser(user);
  const elapsed = Date.now() - new Date(user.roleVerifyLastSentAt).getTime();
  if (elapsed >= cooldownMs) return 0;
  return Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
}

function departmentLabel(role) {
  if (role === "buyers") return "Buyers Department";
  if (role === "finance") return "Finance Department";
  if (role === "buyers_admin") return "Buyers Admin";
  if (role === "finance_admin") return "Finance Admin";
  return null;
}

/** Normalize to digits only so pasted OTP matches what was emailed. */
function normalizeRoleCodeDigits(raw) {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

/** JSON may send the code as a string or (rare) number; never trust typeof alone. */
function parseVerificationCodeInput(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return normalizeRoleCodeDigits(String(Math.trunc(Math.abs(raw))));
  }
  if (typeof raw === "string") return normalizeRoleCodeDigits(raw);
  return "";
}

/**
 * JWT + HMAC input must use one canonical form. PostgreSQL UUID strings can differ by case
 * between drivers/raw SQL vs Prisma — that broke verification while the code was correct.
 */
function normalizeStableUserId(id) {
  const s = String(id ?? "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  return s;
}

/** Hash used for new emails (canonical user id). */
function hashRoleCode(userId, plainCode) {
  const uid = normalizeStableUserId(userId);
  const digits = normalizeRoleCodeDigits(plainCode);
  return crypto.createHash("sha256").update(`${uid}:${digits}`, "utf8").digest("hex");
}

/** Same algorithm as older deploys: exact id string from DB (mixed-case UUID bug). */
function hashRoleCodeLegacy(userId, plainCode) {
  const uid = String(userId ?? "").trim();
  const digits = normalizeRoleCodeDigits(plainCode);
  return crypto.createHash("sha256").update(`${uid}:${digits}`, "utf8").digest("hex");
}

function storedRoleCodeMatches(user, codeStr) {
  const stored = user.roleVerifyCodeHash;
  if (!stored || !/^\d{6}$/.test(codeStr)) return false;
  if (roleVerifyHashesEqual(stored, hashRoleCode(user.id, codeStr))) return true;
  if (roleVerifyHashesEqual(stored, hashRoleCodeLegacy(user.id, codeStr))) return true;
  return false;
}

function hashPasswordResetCode(userId, plainCode) {
  const uid = normalizeStableUserId(userId);
  const digits = normalizeRoleCodeDigits(plainCode);
  return crypto.createHash("sha256").update(`pwd-reset:${uid}:${digits}`, "utf8").digest("hex");
}

function passwordResetCooldownMsForUser(user) {
  const tier = user.passwordResetCooldownTier ?? 0;
  if (tier >= 2) return COOLDOWN_MS_TIER2;
  if ((user.passwordResetResendCount ?? 0) > RESEND_COUNT_HEAVY) return COOLDOWN_MS_TIER1;
  return COOLDOWN_MS_TIER0;
}

function remainingPasswordResetCooldownSec(user) {
  if (ROLE_VERIFY_NO_COOLDOWN) return 0;
  if (!user?.passwordResetLastSentAt) return 0;
  const cooldownMs = passwordResetCooldownMsForUser(user);
  const elapsed = Date.now() - new Date(user.passwordResetLastSentAt).getTime();
  if (elapsed >= cooldownMs) return 0;
  return Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
}

function storedPasswordResetCodeMatches(user, codeStr) {
  const stored = user.passwordResetCodeHash;
  if (!stored || !/^\d{6}$/.test(codeStr)) return false;
  return roleVerifyHashesEqual(stored, hashPasswordResetCode(user.id, codeStr));
}

function clearPasswordResetFields() {
  return {
    passwordResetCodeHash: null,
    passwordResetExpires: null,
    passwordResetLastSentAt: null,
    passwordResetResendCount: 0,
    passwordResetCooldownTier: 0,
    passwordResetVerifiedUntil: null,
  };
}

/** Case/whitespace-safe compare of two hex SHA-256 strings. */
function roleVerifyHashesEqual(stored, computed) {
  const a = String(stored ?? "")
    .trim()
    .toLowerCase();
  const b = String(computed ?? "")
    .trim()
    .toLowerCase();
  if (a.length !== 64 || b.length !== 64) return a === b;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function normalizeEmail(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function allocateUsernameFromEmail(email) {
  const usernameBase = email
    .split("@")[0]
    .replace(/[^\w]/g, "_")
    .slice(0, 28);
  let username = (usernameBase || "user").slice(0, 32);
  let attempt = 0;
  while (await prisma.user.findUnique({ where: { username } })) {
    attempt += 1;
    username = `${(usernameBase || "user").slice(0, 24)}_${attempt}`.slice(0, 32);
    if (attempt > 100) {
      throw new Error("Could not allocate username");
    }
  }
  return username;
}

/**
 * Send (or reuse) role onboarding verification email.
 * @returns {{ ok: true, sentTo: string, codeUnchanged?: boolean } | { ok: false, status: number, message: string, retryAfter?: number }}
 */
async function deliverRoleVerificationCode(user, { force = false } = {}) {
  if (!user?.email) {
    return { ok: false, status: 400, message: "No email on this account; cannot send verification code." };
  }
  if (user.role) {
    return { ok: false, status: 400, message: "Role already set" };
  }
  if (!smtpConfigured()) {
    return {
      ok: false,
      status: 503,
      message: smtpMissingHint() || "SMTP is not configured. Cannot send verification email.",
    };
  }

  const now = new Date();
  const hasValidPending =
    user.roleVerifyCodeHash && user.roleVerifyExpires && user.roleVerifyExpires >= now;

  if (!force && hasValidPending && !ROLE_VERIFY_NO_COOLDOWN) {
    console.info(
      `[auth] send-code: pending code still valid for ${user.email} — no Brevo call (click Resend to send a new email)`,
    );
    return { ok: true, sentTo: user.email, codeUnchanged: true };
  }

  const waitSec = remainingSendCooldownSec(user);
  if (waitSec > 0) {
    return {
      ok: false,
      status: 429,
      message: `Please wait ${waitSec}s before requesting another code.`,
      retryAfter: waitSec,
    };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = hashRoleCode(user.id, code);
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      roleVerifyCodeHash: hash,
      roleVerifyExpires: expires,
    },
  });

  console.info(`[auth] send-code: sending verification email to ${user.email}${force ? " (resend)" : ""}`);
  const mail = await sendHtmlMail({
    to: [user.email],
    subject: "[Finly] Verification code — department role",
    html: renderVerificationEmail(user.displayName || user.username, code),
    text: `Your Finly verification code is: ${code}. Valid 15 minutes.`,
  });

  if (!mail.ok) {
    await prisma.user.update({
      where: { id: user.id },
      data: { roleVerifyCodeHash: null, roleVerifyExpires: null },
    });
    return { ok: false, status: 503, message: mail.reason || "Failed to send email" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      roleVerifyLastSentAt: new Date(),
      ...(force && { roleVerifyResendCount: { increment: 1 } }),
    },
  });

  return {
    ok: true,
    sentTo: user.email,
    ...(mail.via && { via: mail.via }),
    ...(mail.messageId != null && mail.messageId !== "" && { messageId: mail.messageId }),
  };
}

function signToken(userId, role) {
  return jwt.sign({ uid: normalizeStableUserId(userId), role: role ?? null }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

function verifyAppToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requireJwtSecret(res) {
  if (!process.env.JWT_SECRET) {
    res.status(503).json({ message: "JWT_SECRET is not configured on the server" });
    return false;
  }
  return true;
}

router.post("/google", async (req, res) => {
  if (!requireJwtSecret(res)) return;
  const credential = req.body?.credential;
  if (!credential || typeof credential !== "string") {
    return res.status(400).json({ message: "Missing Google credential" });
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ message: "GOOGLE_CLIENT_ID is not configured on the server" });
  }
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const p = ticket.getPayload();
    if (!p?.sub) {
      return res.status(401).json({ message: "Invalid Google token payload" });
    }
    const sub = p.sub;
    const email = p.email || null;
    const name = p.name || (email ? email.split("@")[0] : "User");

    let user = await findUserByGoogleSub(sub);

    if (!user && email) {
      const byEmail = await findUserByEmail(email);
      if (byEmail) {
        if (byEmail.googleSub && byEmail.googleSub !== sub) {
          return res.status(409).json({ message: "Email is already linked to another Google account" });
        }
        user = await linkGoogleAccount({
          userId: byEmail.id,
          googleSub: sub,
          email: email ?? byEmail.email,
          displayName: name || byEmail.displayName || byEmail.username,
        });
      }
    }

    if (!user) {
      const usernameBase = email
        ? email
            .split("@")[0]
            .replace(/[^\w]/g, "_")
            .slice(0, 28)
        : `g_${sub.replace(/[^\w]/g, "").slice(0, 20)}`;
      let username = (usernameBase || `g_${sub.slice(0, 12)}`).slice(0, 36);
      let attempt = 0;
      while (await prisma.user.findUnique({ where: { username } })) {
        attempt += 1;
        username = `${(usernameBase || "g").slice(0, 24)}_${attempt}`.slice(0, 36);
        if (attempt > 100) {
          return res.status(500).json({ message: "Could not allocate username" });
        }
      }
      user = await insertUserFromGoogle({
        username,
        googleSub: sub,
        email,
        displayName: name,
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: email ?? user.email,
          displayName: name || user.displayName,
        },
      });
    }

    const needsRole = !user.role;
    const token = signToken(user.id, user.role);
    res.json({
      token,
      needsRole,
      user: {
        ...portalUserPayload(user),
        name: user.displayName || name,
        email: user.email,
        role: user.role,
        departmentLabel: user.role ? departmentLabel(user.role) : null,
      },
    });
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e || "");
    if (/googleSub|does not exist|42703|42P01/i.test(msg)) {
      return res.status(503).json({
        message:
          "Database is missing Google columns. Run in back-end folder: npx prisma db push (then restart the server).",
      });
    }
    res.status(401).json({ message: msg || "Google sign-in failed" });
  }
});

/** Sign in with portal username + password (after onboarding set credentials). */
router.post("/login", async (req, res) => {
  if (!requireJwtSecret(res)) return;
  const usernameRaw = req.body?.username;
  const password = req.body?.password;
  const username =
    typeof usernameRaw === "string" ? usernameRaw.trim().toLowerCase() : "";
  if (!username || typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ message: "Username and password are required." });
  }
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    const allowedRole =
      user?.role === "buyers" ||
      user?.role === "finance" ||
      user?.role === "buyers_admin" ||
      user?.role === "finance_admin";
    if (!user?.passwordHash || !allowedRole) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid username or password." });
    }
    const token = signToken(user.id, user.role);
    res.json({
      token,
      user: {
        ...portalUserPayload(user),
        email: user.email,
        role: user.role,
        departmentLabel: departmentLabel(user.role),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Login failed" });
  }
});

/** Sign up with Outlook / any email — save credentials, then send 6-digit verification code. */
router.post("/email-signup/send-code", async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    const force = req.body?.force === true || req.body?.resend === true;
    const usernameNew =
      typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const passwordNew = req.body?.password;

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!USERNAME_RE.test(usernameNew)) {
      return res.status(400).json({
        message:
          "Username must be 3–32 characters, lowercase letters, numbers, or underscore only.",
      });
    }
    if (typeof passwordNew !== "string" || passwordNew.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    let user = await findUserByEmail(email);
    if (user?.role) {
      return res.status(409).json({
        message: "An account with this email already exists. Please sign in with your username and password.",
      });
    }
    if (user?.googleSub) {
      return res.status(409).json({
        message: "This email is linked to Google sign-in. Continue with Google instead.",
      });
    }

    const usernameTaken = await prisma.user.findFirst({
      where: user
        ? { username: usernameNew, NOT: { id: user.id } }
        : { username: usernameNew },
    });
    if (usernameTaken) {
      return res.status(409).json({ message: "Username is already taken." });
    }

    const passwordHash = await bcrypt.hash(passwordNew, BCRYPT_ROUNDS);
    const displayName = email.split("@")[0];

    if (!user) {
      user = await prisma.user.create({
        data: {
          username: usernameNew,
          email,
          displayName,
          passwordHash,
          role: null,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: usernameNew,
          passwordHash,
          displayName: user.displayName || displayName,
        },
      });
    }

    const result = await deliverRoleVerificationCode(user, { force });
    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
        ...(result.retryAfter != null ? { retryAfter: result.retryAfter } : {}),
      });
    }
    res.json({
      ok: true,
      sentTo: result.sentTo,
      username: user.username,
      ...(result.codeUnchanged === true ? { codeUnchanged: true } : {}),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to send verification code" });
  }
});

/** Verify emailed code for email-only signup — returns JWT for onboarding wizard. */
router.post("/email-signup/verify-code", async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    const codeStr = parseVerificationCodeInput(
      req.body?.verificationCode ?? req.body?.code ?? req.body?.otp,
    );
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ message: "A valid 6-digit verification code is required." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "No signup found for this email. Request a new code." });
    }
    if (user.role) {
      return res.status(400).json({ message: "Account already set up. Please sign in." });
    }
    if (!user.roleVerifyCodeHash || !user.roleVerifyExpires) {
      return res.status(400).json({
        message: "No verification code pending. Request a new code.",
      });
    }
    if (user.roleVerifyExpires < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleVerifyCodeHash: null, roleVerifyExpires: null },
      });
      return res.status(400).json({ message: "Verification code expired. Request a new code." });
    }
    if (!storedRoleCodeMatches(user, codeStr)) {
      if ((user.roleVerifyResendCount ?? 0) > RESEND_COUNT_HEAVY) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleVerifyCooldownTier: 2 },
        });
      }
      return res.status(400).json({ message: "Invalid verification code." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { roleVerifyResendCount: 0, roleVerifyCooldownTier: 0 },
    });

    const token = signToken(user.id, user.role);
    res.json({
      ok: true,
      token,
      needsRole: true,
      user: {
        id: user.id,
        name: user.displayName || user.username,
        email: user.email,
        role: null,
        departmentLabel: null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Verification failed" });
  }
});

/**
 * Bootstrap admin users (finance_admin / buyers_admin).
 * Protect this endpoint with ADMIN_SETUP_SECRET and disable after initial setup.
 */
router.post("/admin/bootstrap", async (req, res) => {
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret) {
    return res.status(503).json({ message: "ADMIN_SETUP_SECRET is not configured" });
  }
  const incomingSecret = req.headers["x-admin-setup-secret"];
  if (incomingSecret !== setupSecret) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const usernameRaw = req.body?.username;
  const password = req.body?.password;
  const role = req.body?.role;
  const displayNameRaw = req.body?.displayName;
  const emailRaw = req.body?.email;

  const username = typeof usernameRaw === "string" ? usernameRaw.trim().toLowerCase() : "";
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0
      ? displayNameRaw.trim()
      : username;
  const email = typeof emailRaw === "string" && emailRaw.trim().length > 0 ? emailRaw.trim() : null;

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      message: "Username must be 3-32 chars, lowercase letters, numbers, or underscore only.",
    });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }
  if (role !== "finance_admin" && role !== "buyers_admin") {
    return res.status(400).json({ message: "role must be finance_admin or buyers_admin" });
  }

  try {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return res.status(409).json({ message: "Username is already taken." });
    }
    if (email) {
      const emailExists = await prisma.user.findFirst({ where: { email } });
      if (emailExists) {
        return res.status(409).json({ message: "Email is already used." });
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const created = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role,
        displayName,
        email,
      },
    });
    return res.status(201).json({
      ok: true,
      user: {
        id: created.id,
        username: created.username,
        role: created.role,
        displayName: created.displayName,
        email: created.email,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message || "Failed to create admin user" });
  }
});

function authBearer(req, res, next) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    return res.status(401).json({ message: "Missing Authorization bearer token" });
  }
  try {
    const payload = verifyAppToken(m[1]);
    if (payload.uid == null || payload.uid === "") {
      return res.status(401).json({ message: "Invalid token payload" });
    }
    req.authUserId = normalizeStableUserId(payload.uid);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/** Restore portal session from JWT (management-system reload). */
router.get("/session", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user =
      (await findUserById(req.authUserId)) ||
      (await prisma.user.findUnique({ where: { id: String(req.authUserId) } }));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const needsRole = !user.role;
    const portalRole =
      user.role === "buyers" || user.role === "finance" ? user.role : null;
    res.json({
      needsRole,
      user: {
        ...portalUserPayload(user),
        email: user.email,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load session" });
  }
});

/** Remaining resend cooldown from DB — survives page reload (same rules as POST /role/send-code). */
router.get("/role/send-cooldown", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role) {
      return res.json({ retryAfterSeconds: 0, canSendNow: true });
    }
    const retryAfterSeconds = remainingSendCooldownSec(user);
    res.json({
      retryAfterSeconds,
      canSendNow: retryAfterSeconds <= 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to read send cooldown" });
  }
});

/** Kirim kode 6 digit ke email user sebelum memilih peran (SMTP harus aktif). */
router.post("/role/send-code", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const force = req.body?.force === true || req.body?.resend === true;
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const result = await deliverRoleVerificationCode(user, { force });
    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
        ...(result.retryAfter != null ? { retryAfter: result.retryAfter } : {}),
      });
    }
    res.json({
      ok: true,
      sentTo: result.sentTo,
      ...(result.codeUnchanged === true ? { codeUnchanged: true } : {}),
      ...(result.via && { via: result.via }),
      ...(result.messageId != null && result.messageId !== "" && { messageId: result.messageId }),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to send verification code" });
  }
});

/** Change verification email during Google onboarding (Outlook, etc.). */
router.patch("/role/email", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role) {
      return res.status(400).json({ message: "Role already set" });
    }

    const existing = await findUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ message: "This email is already used by another account." });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        roleVerifyCodeHash: null,
        roleVerifyExpires: null,
        roleVerifyLastSentAt: null,
        roleVerifyResendCount: 0,
        roleVerifyCooldownTier: 0,
      },
    });

    const result = await deliverRoleVerificationCode(updated, { force: true });
    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
        ...(result.retryAfter != null ? { retryAfter: result.retryAfter } : {}),
      });
    }

    res.json({
      ok: true,
      email: updated.email,
      sentTo: result.sentTo,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to update email" });
  }
});

/** Cek kode 6 digit tanpa menghapus hash (untuk wizard langkah 1 → 2). */
router.post("/role/verify-code", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const raw =
      req.body?.verificationCode ??
      req.body?.code ??
      req.body?.verification_code ??
      req.body?.otp;
    const codeStr = parseVerificationCodeInput(raw);
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role) {
      return res.status(400).json({ message: "Role already set" });
    }
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ message: "A valid 6-digit verification code is required." });
    }
    if (!user.roleVerifyCodeHash || !user.roleVerifyExpires) {
      return res.status(400).json({
        message: "No verification code pending. Request a new code from the role page.",
      });
    }
    if (user.roleVerifyExpires < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleVerifyCodeHash: null, roleVerifyExpires: null },
      });
      return res.status(400).json({ message: "Verification code expired. Request a new code." });
    }
    if (!storedRoleCodeMatches(user, codeStr)) {
      if ((user.roleVerifyResendCount ?? 0) > RESEND_COUNT_HEAVY) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleVerifyCooldownTier: 2 },
        });
      }
      return res.status(400).json({ message: "Invalid verification code." });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { roleVerifyResendCount: 0, roleVerifyCooldownTier: 0 },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Verification failed" });
  }
});

/** Forgot password — resend cooldown (account settings). */
router.get("/password-reset/send-cooldown", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    const retryAfterSeconds = remainingPasswordResetCooldownSec(user);
    res.json({ retryAfterSeconds, canSendNow: retryAfterSeconds <= 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to read send cooldown" });
  }
});

/** Send 6-digit code to account email before resetting password. */
router.post("/password-reset/send-code", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const force = req.body?.force === true || req.body?.resend === true;
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.email) {
      return res.status(400).json({ message: "No email on this account; cannot send verification code." });
    }
    if (!user.passwordHash) {
      return res.status(400).json({ message: "Set a password during onboarding before using forgot password." });
    }
    if (!smtpConfigured()) {
      return res.status(503).json({
        message: smtpMissingHint() || "SMTP is not configured. Cannot send verification email.",
      });
    }

    const now = new Date();
    const hasValidPending =
      user.passwordResetCodeHash &&
      user.passwordResetExpires &&
      user.passwordResetExpires >= now;

    if (!force && hasValidPending && !ROLE_VERIFY_NO_COOLDOWN) {
      return res.json({ ok: true, sentTo: user.email, codeUnchanged: true });
    }

    const waitSec = remainingPasswordResetCooldownSec(user);
    if (waitSec > 0) {
      return res.status(429).json({
        message: `Please wait ${waitSec}s before requesting another code.`,
        retryAfter: waitSec,
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = hashPasswordResetCode(user.id, code);
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCodeHash: hash,
        passwordResetExpires: expires,
        passwordResetVerifiedUntil: null,
      },
    });

    const mail = await sendHtmlMail({
      to: [user.email],
      subject: "[Finly] Password reset verification code",
      html: renderPasswordResetEmail(user.displayName || user.username, code),
      text: `Your Finly password reset code is: ${code}. Valid 15 minutes.`,
    });

    if (!mail.ok) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetCodeHash: null, passwordResetExpires: null },
      });
      return res.status(503).json({ message: mail.reason || "Failed to send email" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetLastSentAt: new Date(),
        ...(force && { passwordResetResendCount: { increment: 1 } }),
      },
    });

    res.json({
      ok: true,
      sentTo: user.email,
      ...(mail.via && { via: mail.via }),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to send verification code" });
  }
});

/** Verify emailed code before showing new-password step. */
router.post("/password-reset/verify-code", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const codeStr = parseVerificationCodeInput(
      req.body?.verificationCode ?? req.body?.code ?? req.body?.otp,
    );
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ message: "A valid 6-digit verification code is required." });
    }
    if (!user.passwordResetCodeHash || !user.passwordResetExpires) {
      return res.status(400).json({
        message: "No verification code pending. Request a new code from account settings.",
      });
    }
    if (user.passwordResetExpires < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetCodeHash: null, passwordResetExpires: null },
      });
      return res.status(400).json({ message: "Verification code expired. Request a new code." });
    }
    if (!storedPasswordResetCodeMatches(user, codeStr)) {
      if ((user.passwordResetResendCount ?? 0) > RESEND_COUNT_HEAVY) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordResetCooldownTier: 2 },
        });
      }
      return res.status(400).json({ message: "Invalid verification code." });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetVerifiedUntil: new Date(Date.now() + 15 * 60 * 1000),
        passwordResetResendCount: 0,
        passwordResetCooldownTier: 0,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Verification failed" });
  }
});

/** Set new password after verify-code (no current password required). */
router.post("/password-reset/confirm", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const newPassword = req.body?.newPassword;
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.passwordResetVerifiedUntil || user.passwordResetVerifiedUntil < new Date()) {
      return res.status(400).json({
        message: "Verification expired. Request a new code and verify again.",
      });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters." });
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...clearPasswordResetFields(),
      },
    });
    res.json({ ok: true, user: portalUserPayload(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to reset password" });
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.patch("/role", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  const role = req.body?.role;
  const usernameNew = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const passwordNew = req.body?.password;

  if (role !== "buyers" && role !== "finance") {
    return res.status(400).json({ message: "role must be buyers or finance" });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role) {
      const token = signToken(user.id, user.role);
      return res.json({
        token,
        needsRole: false,
        user: {
          ...portalUserPayload(user),
          email: user.email,
          role: user.role,
          departmentLabel: departmentLabel(user.role),
        },
      });
    }

    const codeStr = parseVerificationCodeInput(
      req.body?.verificationCode ??
        req.body?.code ??
        req.body?.verification_code ??
        req.body?.otp,
    );
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ message: "A valid 6-digit verification code is required." });
    }
    const usernameFinal = USERNAME_RE.test(usernameNew) ? usernameNew : user.username;
    if (!USERNAME_RE.test(usernameFinal)) {
      return res.status(400).json({
        message:
          "Username must be 3–32 characters, lowercase letters, numbers, or underscore only.",
      });
    }
    let passwordHash;
    if (typeof passwordNew === "string" && passwordNew.length >= 8) {
      passwordHash = await bcrypt.hash(passwordNew, BCRYPT_ROUNDS);
    } else if (user.passwordHash) {
      passwordHash = user.passwordHash;
    } else {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    if (!user.roleVerifyCodeHash || !user.roleVerifyExpires) {
      return res.status(400).json({ message: "No verification code pending. Request a new code from the role page." });
    }
    if (user.roleVerifyExpires < new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleVerifyCodeHash: null, roleVerifyExpires: null },
      });
      return res.status(400).json({ message: "Verification code expired. Request a new code." });
    }
    if (!storedRoleCodeMatches(user, codeStr)) {
      if ((user.roleVerifyResendCount ?? 0) > RESEND_COUNT_HEAVY) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleVerifyCooldownTier: 2 },
        });
      }
      return res.status(400).json({ message: "Invalid verification code." });
    }

    const taken = await prisma.user.findFirst({
      where: { username: usernameFinal, NOT: { id: user.id } },
    });
    if (taken) {
      return res.status(409).json({ message: "Username is already taken." });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: usernameFinal,
        passwordHash,
        role,
        roleVerifyCodeHash: null,
        roleVerifyExpires: null,
        roleVerifyLastSentAt: null,
        roleVerifyResendCount: 0,
        roleVerifyCooldownTier: 0,
      },
    });
    const token = signToken(updated.id, updated.role);
    res.json({
      token,
      needsRole: false,
      user: {
        ...portalUserPayload(updated),
        email: updated.email,
        role: updated.role,
        departmentLabel: departmentLabel(updated.role),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to save role" });
  }
});

function portalUserPayload(user) {
  const portalRole =
    user.role === "buyers" || user.role === "finance" ? user.role : null;
  return {
    id: user.id,
    name: user.displayName || user.username,
    email: user.email,
    role: portalRole,
    departmentLabel: portalRole ? departmentLabel(portalRole) : null,
    avatarPreset: user.avatarPreset ?? null,
    hasProfileImage: Boolean(user.profileImageFileName),
  };
}

/** Update display name and/or password for portal users (buyers / finance). */
router.patch("/profile", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const portalRole =
      user.role === "buyers" || user.role === "finance" ? user.role : null;
    if (!portalRole) {
      return res.status(403).json({ message: "Profile update is not available for this account." });
    }

    const displayNameRaw = req.body?.displayName;
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    const avatarPresetRaw = req.body?.avatarPreset;

    const data = {};
    if (avatarPresetRaw !== undefined) {
      if (avatarPresetRaw === null || avatarPresetRaw === "") {
        data.avatarPreset = null;
      } else {
        const preset = String(avatarPresetRaw).padStart(2, "0");
        if (!VALID_AVATAR_PRESETS.has(preset)) {
          return res.status(400).json({ message: "Invalid avatar selection." });
        }
        data.avatarPreset = preset;
        data.profileImageFileName = null;
        deleteProfileImage(user.id);
      }
    }
    if (displayNameRaw !== undefined) {
      const displayName =
        typeof displayNameRaw === "string" ? displayNameRaw.trim() : "";
      if (!displayName) {
        return res.status(400).json({ message: "Display name is required." });
      }
      data.displayName = displayName;
    }

    if (newPassword !== undefined && newPassword !== null && newPassword !== "") {
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters." });
      }
      if (!user.passwordHash) {
        return res.status(400).json({ message: "Set a password during onboarding before changing it here." });
      }
      if (typeof currentPassword !== "string" || currentPassword.length === 0) {
        return res.status(400).json({ message: "Current password is required to set a new password." });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
      data.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    res.json({ user: portalUserPayload(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to update profile" });
  }
});

/** Upload custom profile photo (replaces preset). */
router.post("/profile/photo", authBearer, profileUpload.single("photo"), async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    const portalRole =
      user.role === "buyers" || user.role === "finance" ? user.role : null;
    if (!portalRole) {
      return res.status(403).json({ message: "Profile update is not available for this account." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Choose an image file to upload." });
    }
    const fileName = saveProfileImage(user.id, req.file);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { profileImageFileName: fileName, avatarPreset: null },
    });
    res.json({ user: portalUserPayload(updated) });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message || "Failed to upload profile photo" });
  }
});

/** Remove custom profile photo. */
router.delete("/profile/photo", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    deleteProfileImage(user.id);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { profileImageFileName: null },
    });
    res.json({ user: portalUserPayload(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to remove profile photo" });
  }
});

/** Serve own profile photo (Bearer required). */
router.get("/profile/photo", authBearer, async (req, res) => {
  try {
    const fp = findProfileImagePath(req.authUserId);
    if (!fp) return res.status(404).json({ message: "No profile photo" });
    res.sendFile(fp);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to load profile photo" });
  }
});

/** Permanently delete the signed-in portal account (buyers / finance). */
router.delete("/account", authBearer, async (req, res) => {
  if (!requireJwtSecret(res)) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.authUserId) } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const portalRole =
      user.role === "buyers" || user.role === "finance" ? user.role : null;
    if (!portalRole) {
      return res.status(403).json({ message: "Account deletion is not available for this account." });
    }

    const currentPassword = req.body?.currentPassword;
    if (!user.passwordHash) {
      return res.status(400).json({
        message: "This account cannot be deleted from the portal. Contact an administrator.",
      });
    }
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      return res.status(400).json({ message: "Current password is required to delete your account." });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    deleteProfileImage(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Failed to delete account" });
  }
});

module.exports = router;
