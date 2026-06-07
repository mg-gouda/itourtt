-- Register the GetPayIn (Paylink) hosted-checkout gateway as a B2C payment option.
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
-- is not used in the same transaction (it isn't here).
ALTER TYPE "B2CPaymentGateway" ADD VALUE IF NOT EXISTS 'GETPAYIN';
