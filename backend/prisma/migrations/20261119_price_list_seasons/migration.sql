-- Supplier price lists get a validity (season) and suppliers a dated list history.
ALTER TABLE "supplier_price_lists" ADD COLUMN "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "supplier_price_lists" ADD COLUMN "valid_to" DATE;
-- Existing lists have priced jobs since the 2026 sheets: start them on 2026-01-01.
UPDATE "supplier_price_lists" SET "valid_from" = DATE '2026-01-01';

CREATE TABLE "supplier_price_list_assignments" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "price_list_id" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_price_list_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_price_list_assignments_supplier_id_valid_from_idx" ON "supplier_price_list_assignments"("supplier_id", "valid_from");
ALTER TABLE "supplier_price_list_assignments" ADD CONSTRAINT "supplier_price_list_assignments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_price_list_assignments" ADD CONSTRAINT "supplier_price_list_assignments_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "supplier_price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_price_list_assignments" ADD CONSTRAINT "supplier_price_list_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every supplier's current list becomes its first period, from the list's start.
INSERT INTO "supplier_price_list_assignments" ("id", "supplier_id", "price_list_id", "valid_from")
SELECT gen_random_uuid()::text, s."id", s."price_list_id", DATE '2026-01-01'
FROM "suppliers" s WHERE s."price_list_id" IS NOT NULL;
