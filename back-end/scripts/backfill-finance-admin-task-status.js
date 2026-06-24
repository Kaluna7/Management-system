/**
 * Move finance_admin records into task queue (document_generated) so they appear in admin list.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { prisma } = require("../src/lib/prisma");

async function main() {
  const r = await prisma.buyerRecord.updateMany({
    where: {
      OR: [
        { createdByRole: "finance_admin" },
        { createdByAdmin: true, createdByRole: null },
      ],
      status: { not: "document_generated" },
      archivedAt: null,
      publishedAt: null,
    },
    data: {
      status: "document_generated",
      createdByRole: "finance_admin",
    },
  });
  console.log(`Records moved to task (document_generated): ${r.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
