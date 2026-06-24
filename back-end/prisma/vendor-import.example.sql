-- Prefer CSV import via: npm run import:vendors -- path\to\vendors.csv
-- See scripts/import-vendors-from-csv.js

-- Manual single rows:
INSERT INTO "Vendor" ("id", "code", "name", "createdAt", "updatedAt")
VALUES
  ('vmanual001', 'V-001', 'PT. CONTOH SATU', NOW(), NOW());
