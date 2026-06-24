require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.vendor
  .count()
  .then((c) => console.log("Vendor rows in database:", c))
  .finally(() => p.$disconnect());
