const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { prisma } = require("../src/lib/prisma");

async function main() {
  const memo = await prisma.invoiceMemoOption.updateMany({
    where: { createdByRole: undefined },
    data: { createdByRole: "finance" },
  });
  const bank = await prisma.invoiceBankAccount.updateMany({
    where: { createdByRole: undefined },
    data: { createdByRole: "finance" },
  });
  console.log(`Memo options tagged finance: ${memo.count}`);
  console.log(`Bank accounts tagged finance: ${bank.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
