/**
 * Task rows (document_generated) must not carry archivedAt — fixes false "sudah di archive" lock.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { prisma } = require("../src/lib/prisma");

async function main() {
  const r = await prisma.buyerRecord.updateMany({
    where: {
      status: "document_generated",
      archivedAt: { not: null },
    },
    data: { archivedAt: null },
  });
  console.log(`Cleared stale archivedAt on task records: ${r.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
