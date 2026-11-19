-- GPS pin check for hotels (locations/pin-verifier.service.ts)
ALTER TABLE "hotels" ADD COLUMN "pin_status" TEXT;
ALTER TABLE "hotels" ADD COLUMN "pin_note" TEXT;
ALTER TABLE "hotels" ADD COLUMN "pin_checked_at" TIMESTAMP(3);
