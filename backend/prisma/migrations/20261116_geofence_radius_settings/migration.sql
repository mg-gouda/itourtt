-- Geofence radii (metres) for rep/driver status updates, editable from
-- System Parameters › Locations. Defaults match the values hard-coded before.
ALTER TABLE "company_settings"
  ADD COLUMN "geofence_airport_meters" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN "geofence_other_meters"   INTEGER NOT NULL DEFAULT 600;
