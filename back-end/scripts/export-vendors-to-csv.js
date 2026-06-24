require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function escCsv(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const outArg = process.argv[2];
  const outPath = path.resolve(process.cwd(), outArg || "../vendors.csv");
  const vendors = await prisma.vendor.findMany({ orderBy: { code: "asc" } });
  const lines = ["CODE,NAME", ...vendors.map((v) => `${v.code},${escCsv(v.name)}`)];
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Exported ${vendors.length} vendor(s) to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
