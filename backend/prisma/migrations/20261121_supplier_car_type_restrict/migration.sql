-- A supplier car type that jobs use can't be deleted (ON DELETE SET NULL silently cleared the car
-- type on those jobs whenever a supplier's car types were saved). Applied live by hand 2026-11-21.
ALTER TABLE "traffic_assignments" DROP CONSTRAINT IF EXISTS "traffic_assignments_supplier_car_type_id_fkey";
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_supplier_car_type_id_fkey"
  FOREIGN KEY ("supplier_car_type_id") REFERENCES "supplier_car_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
