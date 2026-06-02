-- Managed B2C public-site booking extras catalog.
CREATE TABLE IF NOT EXISTS "b2c_extras" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency"    "Currency"   NOT NULL DEFAULT 'EGP',
    "image_url"   TEXT,
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ  NOT NULL,

    CONSTRAINT "b2c_extras_pkey" PRIMARY KEY ("id")
);
