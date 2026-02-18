-- =============================================
-- Schema sync migration: baseline → current
-- Adds all missing enums, tables, columns, indexes, and FKs
-- =============================================

-- ─── NEW ENUMS ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('NEW', 'UPDATED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PortalJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "B2CPaymentMethod" AS ENUM ('ONLINE', 'PAY_ON_ARRIVAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "B2CPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "B2CPaymentGateway" AS ENUM ('STRIPE', 'EGYPT_BANK', 'DUBAI_BANK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GuestBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsappNotificationStatus" AS ENUM ('SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── ALTER EXISTING ENUMS ───────────────────────────

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DRIVER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPLIER';

-- ─── NEW TABLE: roles ───────────────────────────────

CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "roles_slug_key" ON "roles"("slug");

-- ─── NEW TABLE: role_permissions_v2 ─────────────────

CREATE TABLE IF NOT EXISTS "role_permissions_v2" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_v2_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_v2_role_id_permission_key_key" ON "role_permissions_v2"("role_id", "permission_key");
ALTER TABLE "role_permissions_v2" DROP CONSTRAINT IF EXISTS "role_permissions_v2_role_id_fkey";
ALTER TABLE "role_permissions_v2" ADD CONSTRAINT "role_permissions_v2_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── NEW TABLE: suppliers ───────────────────────────

CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_user_id_key" ON "suppliers"("user_id");

-- ─── NEW TABLE: vehicle_compliance ──────────────────

CREATE TABLE IF NOT EXISTS "vehicle_compliance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "license_expiry_date" DATE,
    "license_copy_url" TEXT,
    "has_insurance" BOOLEAN NOT NULL DEFAULT false,
    "insurance_expiry_date" DATE,
    "insurance_doc_url" TEXT,
    "annual_payment" DECIMAL(15,2),
    "annual_payment_currency" "Currency",
    "gps_subscription" DECIMAL(15,2),
    "gps_subscription_currency" "Currency",
    "tourism_support_fund" DECIMAL(15,2),
    "tourism_support_fund_currency" "Currency",
    "registration_fees" DECIMAL(15,2),
    "registration_fees_currency" "Currency",
    "temporary_permit_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_compliance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_compliance_vehicle_id_key" ON "vehicle_compliance"("vehicle_id");

-- ─── NEW TABLE: vehicle_deposit_payments ────────────

CREATE TABLE IF NOT EXISTS "vehicle_deposit_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compliance_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "paid_at" TIMESTAMPTZ NOT NULL,
    "created_by_name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_deposit_payments_pkey" PRIMARY KEY ("id")
);

-- ─── NEW TABLE: agent_price_items ───────────────────

CREATE TABLE IF NOT EXISTS "agent_price_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL DEFAULT 'ARR',
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "driver_tip" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "booster_seat_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "baby_seat_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "wheel_chair_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_price_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "agent_price_items_agent_id_service_type_from_zone_id_to_zon_key" ON "agent_price_items"("agent_id", "service_type", "from_zone_id", "to_zone_id", "vehicle_type_id");
CREATE INDEX IF NOT EXISTS "agent_price_items_agent_id_idx" ON "agent_price_items"("agent_id");

-- ─── NEW TABLE: public_price_items ──────────────────

CREATE TABLE IF NOT EXISTS "public_price_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL DEFAULT 'ARR',
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "driver_tip" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "booster_seat_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "baby_seat_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "wheel_chair_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "public_price_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "public_price_items_service_type_from_zone_id_to_zone_id_veh_key" ON "public_price_items"("service_type", "from_zone_id", "to_zone_id", "vehicle_type_id");

-- ─── NEW TABLE: guest_bookings ──────────────────────

CREATE TABLE IF NOT EXISTS "guest_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_ref" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "guest_phone" TEXT NOT NULL,
    "guest_country" TEXT,
    "service_type" "ServiceType" NOT NULL,
    "job_date" DATE NOT NULL,
    "pickup_time" TIMESTAMPTZ,
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "hotel_id" UUID,
    "origin_airport_id" UUID,
    "destination_airport_id" UUID,
    "flight_no" TEXT,
    "carrier" TEXT,
    "terminal" TEXT,
    "pax_count" SMALLINT NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "extras" JSONB,
    "notes" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "exchange_rate" DECIMAL(15,6) NOT NULL DEFAULT 1,
    "payment_method" "B2CPaymentMethod" NOT NULL DEFAULT 'ONLINE',
    "payment_status" "B2CPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_gateway" "B2CPaymentGateway",
    "payment_reference" TEXT,
    "booking_status" "GuestBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "traffic_job_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_bookings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "guest_bookings_booking_ref_key" ON "guest_bookings"("booking_ref");
CREATE UNIQUE INDEX IF NOT EXISTS "guest_bookings_traffic_job_id_key" ON "guest_bookings"("traffic_job_id");
CREATE INDEX IF NOT EXISTS "guest_bookings_booking_status_idx" ON "guest_bookings"("booking_status");
CREATE INDEX IF NOT EXISTS "guest_bookings_payment_status_idx" ON "guest_bookings"("payment_status");
CREATE INDEX IF NOT EXISTS "guest_bookings_job_date_idx" ON "guest_bookings"("job_date");

-- ─── NEW TABLE: payment_transactions ────────────────

CREATE TABLE IF NOT EXISTS "payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "guest_booking_id" UUID NOT NULL,
    "gateway" "B2CPaymentGateway" NOT NULL,
    "gateway_transaction_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "B2CPaymentStatus" NOT NULL,
    "raw_response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payment_transactions_guest_booking_id_idx" ON "payment_transactions"("guest_booking_id");

-- ─── NEW TABLE: status_change_logs ──────────────────

CREATE TABLE IF NOT EXISTS "status_change_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_by_id" UUID,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "gps_map_link" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_change_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "status_change_logs_assignment_id_idx" ON "status_change_logs"("assignment_id");

-- ─── NEW TABLE: activity_logs ───────────────────────

CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_idx" ON "activity_logs"("user_id");
CREATE INDEX IF NOT EXISTS "activity_logs_entity_idx" ON "activity_logs"("entity");
CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- ─── NEW TABLE: whatsapp_settings ───────────────────

CREATE TABLE IF NOT EXISTS "whatsapp_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "twilio_account_sid" TEXT,
    "twilio_auth_token" TEXT,
    "whatsapp_from" TEXT,
    "message_template" TEXT,
    "media_url" TEXT,
    "send_hour" INTEGER NOT NULL DEFAULT 18,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id")
);

-- ─── NEW TABLE: email_settings ──────────────────────

CREATE TABLE IF NOT EXISTS "email_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "smtp_host" TEXT,
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass" TEXT,
    "from_address" TEXT,
    "notify_dispatch_email" TEXT,
    "notify_traffic_email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- ─── NEW TABLE: whatsapp_notification_logs ──────────

CREATE TABLE IF NOT EXISTS "whatsapp_notification_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "traffic_job_id" UUID NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "message_sid" TEXT,
    "status" "WhatsappNotificationStatus" NOT NULL DEFAULT 'SENT',
    "error_message" TEXT,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_notification_logs_traffic_job_id_recipient_phone_key" ON "whatsapp_notification_logs"("traffic_job_id", "recipient_phone");

-- ─── NEW TABLE: driver_notifications ────────────────

CREATE TABLE IF NOT EXISTS "driver_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'GENERAL',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "traffic_job_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_notifications_pkey" PRIMARY KEY ("id")
);

-- ─── NEW TABLE: user_notifications ──────────────────

CREATE TABLE IF NOT EXISTS "user_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'GENERAL',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "traffic_job_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "user_notifications_user_id_idx" ON "user_notifications"("user_id");

-- ─── NEW TABLE: no_show_evidence ────────────────────

CREATE TABLE IF NOT EXISTS "no_show_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "traffic_job_id" UUID NOT NULL,
    "image_url_1" TEXT,
    "image_url_2" TEXT,
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "gps_map_link" TEXT,
    "submitted_by" TEXT NOT NULL,
    "submitted_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "no_show_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "no_show_evidence_traffic_job_id_submitted_by_key" ON "no_show_evidence"("traffic_job_id", "submitted_by");

-- ─── ALTER TABLE: users ─────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- ─── ALTER TABLE: vehicles ──────────────────────────

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "car_brand" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "car_model" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "make_year" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "luggage_capacity" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "supplier_id" UUID;

-- ─── ALTER TABLE: drivers ───────────────────────────

ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "supplier_id" UUID;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "user_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_user_id_key" ON "drivers"("user_id");

-- ─── ALTER TABLE: agents ────────────────────────────

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "ref_pattern" TEXT;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "ref_example" TEXT;

-- ─── ALTER TABLE: supplier_trip_prices ──────────────

ALTER TABLE "supplier_trip_prices" ADD COLUMN IF NOT EXISTS "service_type" "ServiceType" NOT NULL DEFAULT 'ARR';
ALTER TABLE "supplier_trip_prices" ADD COLUMN IF NOT EXISTS "driver_tip" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- ─── ALTER TABLE: traffic_jobs ──────────────────────

ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "booking_status" "BookingStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "client_mobile" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "booster_seat_qty" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "baby_seat_qty" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "wheel_chair_qty" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "print_sign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_amount" DECIMAL(15,2);
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_currency" "Currency" NOT NULL DEFAULT 'EGP';
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_collected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_collected_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_receipt_no" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "collection_liquidated_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "cust_rep_name" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "cust_rep_mobile" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "cust_rep_meeting_point" TEXT;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "cust_rep_meeting_time" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "dispatch_unlocked_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "dispatch_unlocked_by_id" UUID;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "driver_unlocked_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "driver_unlocked_by_id" UUID;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "rep_unlocked_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "rep_unlocked_by_id" UUID;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "supplier_unlocked_at" TIMESTAMPTZ;
ALTER TABLE "traffic_jobs" ADD COLUMN IF NOT EXISTS "supplier_unlocked_by_id" UUID;

-- ─── ALTER TABLE: traffic_assignments ───────────────

ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "driver_status" "PortalJobStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "rep_status" "PortalJobStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "supplier_status" "PortalJobStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "supplier_notes" TEXT;
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "external_driver_name" TEXT;
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "external_driver_phone" TEXT;
ALTER TABLE "traffic_assignments" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

-- ─── FOREIGN KEY CONSTRAINTS ────────────────────────

-- Users → Roles
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vehicles → Suppliers
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_supplier_id_fkey";
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VehicleCompliance → Vehicles
ALTER TABLE "vehicle_compliance" DROP CONSTRAINT IF EXISTS "vehicle_compliance_vehicle_id_fkey";
ALTER TABLE "vehicle_compliance" ADD CONSTRAINT "vehicle_compliance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VehicleDepositPayments → VehicleCompliance
ALTER TABLE "vehicle_deposit_payments" DROP CONSTRAINT IF EXISTS "vehicle_deposit_payments_compliance_id_fkey";
ALTER TABLE "vehicle_deposit_payments" ADD CONSTRAINT "vehicle_deposit_payments_compliance_id_fkey" FOREIGN KEY ("compliance_id") REFERENCES "vehicle_compliance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drivers → Suppliers
ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_supplier_id_fkey";
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drivers → Users
ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_user_id_fkey";
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Suppliers → Users
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_user_id_fkey";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AgentPriceItems
ALTER TABLE "agent_price_items" DROP CONSTRAINT IF EXISTS "agent_price_items_agent_id_fkey";
ALTER TABLE "agent_price_items" ADD CONSTRAINT "agent_price_items_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_price_items" DROP CONSTRAINT IF EXISTS "agent_price_items_from_zone_id_fkey";
ALTER TABLE "agent_price_items" ADD CONSTRAINT "agent_price_items_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_price_items" DROP CONSTRAINT IF EXISTS "agent_price_items_to_zone_id_fkey";
ALTER TABLE "agent_price_items" ADD CONSTRAINT "agent_price_items_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_price_items" DROP CONSTRAINT IF EXISTS "agent_price_items_vehicle_type_id_fkey";
ALTER TABLE "agent_price_items" ADD CONSTRAINT "agent_price_items_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PublicPriceItems
ALTER TABLE "public_price_items" DROP CONSTRAINT IF EXISTS "public_price_items_from_zone_id_fkey";
ALTER TABLE "public_price_items" ADD CONSTRAINT "public_price_items_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_price_items" DROP CONSTRAINT IF EXISTS "public_price_items_to_zone_id_fkey";
ALTER TABLE "public_price_items" ADD CONSTRAINT "public_price_items_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_price_items" DROP CONSTRAINT IF EXISTS "public_price_items_vehicle_type_id_fkey";
ALTER TABLE "public_price_items" ADD CONSTRAINT "public_price_items_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GuestBookings
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_from_zone_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_to_zone_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_hotel_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_origin_airport_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_origin_airport_id_fkey" FOREIGN KEY ("origin_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_destination_airport_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_destination_airport_id_fkey" FOREIGN KEY ("destination_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_vehicle_type_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_bookings" DROP CONSTRAINT IF EXISTS "guest_bookings_traffic_job_id_fkey";
ALTER TABLE "guest_bookings" ADD CONSTRAINT "guest_bookings_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PaymentTransactions
ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "payment_transactions_guest_booking_id_fkey";
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_guest_booking_id_fkey" FOREIGN KEY ("guest_booking_id") REFERENCES "guest_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TrafficJobs unlock FKs
ALTER TABLE "traffic_jobs" DROP CONSTRAINT IF EXISTS "traffic_jobs_dispatch_unlocked_by_id_fkey";
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_dispatch_unlocked_by_id_fkey" FOREIGN KEY ("dispatch_unlocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traffic_jobs" DROP CONSTRAINT IF EXISTS "traffic_jobs_driver_unlocked_by_id_fkey";
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_driver_unlocked_by_id_fkey" FOREIGN KEY ("driver_unlocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traffic_jobs" DROP CONSTRAINT IF EXISTS "traffic_jobs_rep_unlocked_by_id_fkey";
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_rep_unlocked_by_id_fkey" FOREIGN KEY ("rep_unlocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "traffic_jobs" DROP CONSTRAINT IF EXISTS "traffic_jobs_supplier_unlocked_by_id_fkey";
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_supplier_unlocked_by_id_fkey" FOREIGN KEY ("supplier_unlocked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StatusChangeLogs
ALTER TABLE "status_change_logs" DROP CONSTRAINT IF EXISTS "status_change_logs_assignment_id_fkey";
ALTER TABLE "status_change_logs" ADD CONSTRAINT "status_change_logs_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "traffic_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ActivityLogs
ALTER TABLE "activity_logs" DROP CONSTRAINT IF EXISTS "activity_logs_user_id_fkey";
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WhatsappNotificationLogs
ALTER TABLE "whatsapp_notification_logs" DROP CONSTRAINT IF EXISTS "whatsapp_notification_logs_traffic_job_id_fkey";
ALTER TABLE "whatsapp_notification_logs" ADD CONSTRAINT "whatsapp_notification_logs_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DriverNotifications
ALTER TABLE "driver_notifications" DROP CONSTRAINT IF EXISTS "driver_notifications_driver_id_fkey";
ALTER TABLE "driver_notifications" ADD CONSTRAINT "driver_notifications_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_notifications" DROP CONSTRAINT IF EXISTS "driver_notifications_traffic_job_id_fkey";
ALTER TABLE "driver_notifications" ADD CONSTRAINT "driver_notifications_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UserNotifications
ALTER TABLE "user_notifications" DROP CONSTRAINT IF EXISTS "user_notifications_user_id_fkey";
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_notifications" DROP CONSTRAINT IF EXISTS "user_notifications_traffic_job_id_fkey";
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NoShowEvidence
ALTER TABLE "no_show_evidence" DROP CONSTRAINT IF EXISTS "no_show_evidence_traffic_job_id_fkey";
ALTER TABLE "no_show_evidence" ADD CONSTRAINT "no_show_evidence_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
