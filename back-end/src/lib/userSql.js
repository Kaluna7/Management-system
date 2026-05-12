/**
 * Raw SQL helpers for User rows so Google OAuth works even when @prisma/client
 * was generated from an older schema (findUnique({ googleSub }) would throw).
 * Requires DB columns to match prisma/schema.prisma (run `npx prisma db push`).
 */
const { prisma } = require("./prisma");
const { randomUUID } = require("crypto");

function mapUserRow(r) {
  if (!r) return null;
  const expires = r.roleVerifyExpires;
  return {
    id: r.id,
    username: r.username,
    googleSub: r.googleSub ?? null,
    email: r.email ?? null,
    displayName: r.displayName ?? null,
    role: r.role ?? null,
    passwordHash: r.passwordHash ?? null,
    roleVerifyCodeHash: r.roleVerifyCodeHash ?? null,
    roleVerifyExpires: expires instanceof Date ? expires : expires ? new Date(expires) : null,
    roleVerifyLastSentAt:
      r.roleVerifyLastSentAt == null
        ? null
        : r.roleVerifyLastSentAt instanceof Date
          ? r.roleVerifyLastSentAt
          : new Date(r.roleVerifyLastSentAt),
    roleVerifyResendCount: r.roleVerifyResendCount ?? 0,
    roleVerifyCooldownTier: r.roleVerifyCooldownTier ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function findUserByGoogleSub(googleSub) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM "User" WHERE "googleSub" = ${googleSub} LIMIT 1
  `;
  return mapUserRow(rows[0]);
}

async function findUserByEmail(email) {
  if (!email) return null;
  const rows = await prisma.$queryRaw`
    SELECT * FROM "User" WHERE email = ${email} LIMIT 1
  `;
  return mapUserRow(rows[0]);
}

async function findUserById(id) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM "User" WHERE id = ${id} LIMIT 1
  `;
  return mapUserRow(rows[0]);
}

async function insertUserFromGoogle({ username, googleSub, email, displayName }) {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "User" (id, username, "googleSub", email, "displayName", role, "createdAt", "updatedAt")
    VALUES (${id}, ${username}, ${googleSub}, ${email}, ${displayName}, NULL, NOW(), NOW())
  `;
  return findUserById(id);
}

async function linkGoogleAccount({ userId, googleSub, email, displayName }) {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "googleSub" = ${googleSub},
        email = ${email},
        "displayName" = ${displayName},
        "updatedAt" = NOW()
    WHERE id = ${userId}
  `;
  return findUserById(userId);
}

module.exports = {
  findUserByGoogleSub,
  findUserByEmail,
  findUserById,
  insertUserFromGoogle,
  linkGoogleAccount,
};
