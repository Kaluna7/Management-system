const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { prisma } = require("../src/lib/prisma");

async function main() {
  const portal = await prisma.buyerRecord.updateMany({
    where: { createdByRole: null, createdByAdmin: false },
    data: { createdByRole: "buyers" },
  });
  console.log(`Portal records tagged buyers: ${portal.count}`);

  const task = await prisma.buyerRecord.updateMany({
    where: { status: "document_generated", archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  console.log(`Task records cleared stale archivedAt: ${task.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
