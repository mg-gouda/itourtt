-- Add the RETURN service type ("Return" / عودة). It pairs with ONE_WAY_TRANSFER,
-- which is now presented as "Going" / ذهاب.
--
-- TWO_WAY_TRANSFER is intentionally NOT dropped: Postgres cannot remove an enum
-- value that rows still reference, and historical jobs use it. It is removed
-- from every dropdown and from create/update validation instead.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'RETURN';
