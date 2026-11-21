-- Car Dispatch: each car's fixed card header colour (chosen on the vehicle page)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "card_color" VARCHAR(7);
