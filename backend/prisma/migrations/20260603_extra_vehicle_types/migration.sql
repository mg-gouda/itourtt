-- Restricts a catalog extra to specific vehicle types (cargo-space requirement).
CREATE TABLE IF NOT EXISTS "b2c_extra_vehicle_types" (
    "extra_id"        UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,

    CONSTRAINT "b2c_extra_vehicle_types_pkey" PRIMARY KEY ("extra_id", "vehicle_type_id")
);

CREATE INDEX IF NOT EXISTS "b2c_extra_vehicle_types_vehicle_type_id_idx"
    ON "b2c_extra_vehicle_types" ("vehicle_type_id");

ALTER TABLE "b2c_extra_vehicle_types"
    ADD CONSTRAINT "b2c_extra_vehicle_types_extra_id_fkey"
    FOREIGN KEY ("extra_id") REFERENCES "b2c_extras" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "b2c_extra_vehicle_types"
    ADD CONSTRAINT "b2c_extra_vehicle_types_vehicle_type_id_fkey"
    FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
