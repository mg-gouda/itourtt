-- Zone "counts as (for routes)": route lookup treats a zone as another one (5.7.0).
ALTER TABLE "zones" ADD COLUMN "route_zone_id" TEXT;
ALTER TABLE "zones" ADD CONSTRAINT "zones_route_zone_id_fkey"
  FOREIGN KEY ("route_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
