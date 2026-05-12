/**
 * One-shot seed: create finance_admin + buyers_admin users (bcrypt, same as /api/auth/login).
 *
 * Usage (from back-end folder):
 *   node scripts/seed-admin-users.js
 *
 * Requires DATABASE_URL in .env and PostgreSQL reachable.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const { prisma } = require("../src/lib/prisma");

const BCRYPT_ROUNDS = 10;

/** Dev defaults — ganti setelah production. */
const ADMINS = [
  {
    username: "finance_admin",
    password: "FinanceAdmin2026!",
    role: "finance_admin",
    displayName: "Finance Admin",
    email: "finance.admin@local.dev",
  },
  {
    username: "buyers_admin",
    password: "BuyersAdmin2026!",
    role: "buyers_admin",
    displayName: "Buyers Admin",
    email: "buyers.admin@local.dev",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in back-end/.env");
    process.exit(1);
  }

  for (const spec of ADMINS) {
    const passwordHash = await bcrypt.hash(spec.password, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { username: spec.username } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          role: spec.role,
          displayName: spec.displayName,
          email: spec.email,
        },
      });
      console.log(`Updated admin: ${spec.username} (${spec.role})`);
    } else {
      await prisma.user.create({
        data: {
          username: spec.username,
          passwordHash,
          role: spec.role,
          displayName: spec.displayName,
          email: spec.email,
        },
      });
      console.log(`Created admin: ${spec.username} (${spec.role})`);
    }
  }

  console.log("\nLogin credentials (admin-system):");
  for (const spec of ADMINS) {
    console.log(`  ${spec.role}: username=${spec.username}  password=${spec.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
