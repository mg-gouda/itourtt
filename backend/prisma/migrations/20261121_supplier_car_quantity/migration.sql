-- Supplier car types: agreed number of cars; assignments remember which car (Car Dispatch card)
ALTER TABLE "supplier_car_types" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "supplier_car_no" INTEGER;
