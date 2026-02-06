Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'AGENT_MANAGER', 'VIEWER', 'REP');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('ARR', 'DEP', 'EXCURSION', 'ROUND_TRIP', 'ONE_WAY_GOING', 'ONE_WAY_RETURN', 'OVER_DAY', 'TRANSFER', 'CITY_TOUR', 'COLLECTING_ONE_WAY', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB_ASSIGNED', 'JOB_UPDATED', 'GENERAL');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWNED', 'RENTED', 'CONTRACTED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EGP', 'USD', 'EUR', 'GBP', 'SAR');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TAX_CARD', 'COMMERCIAL_REGISTER', 'ID_COPY', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceCycleType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('SALE', 'PURCHASE', 'CASH', 'BANK', 'GENERAL');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('AIRPORT', 'ZONE', 'HOTEL');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('ONLINE', 'B2B');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('TRANSFER', 'DRIVER_TIP');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "refresh_token" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "country_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "airport_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "address" TEXT,
    "stars" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seat_capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate_number" TEXT NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "ownership" "VehicleOwnership" NOT NULL DEFAULT 'OWNED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "license_number" TEXT,
    "attachment_url" TEXT,
    "license_expiry_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicles" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ,

    CONSTRAINT "driver_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reps" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "attachment_url" TEXT,
    "fee_per_flight" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rep_zones" (
    "id" UUID NOT NULL,
    "rep_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,

    CONSTRAINT "rep_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_documents" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_credit_terms" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "credit_limit" DECIMAL(15,2) NOT NULL,
    "credit_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_credit_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_invoice_cycles" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "cycle_type" "InvoiceCycleType" NOT NULL,
    "day_of_week" SMALLINT,
    "day_of_month" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_invoice_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "credit_limit" DECIMAL(15,2),
    "credit_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_price_items" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL DEFAULT 'ARR',
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "transfer_price" DECIMAL(15,2) NOT NULL,
    "driver_tip" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customer_price_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_trip_prices" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "supplier_trip_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_jobs" (
    "id" UUID NOT NULL,
    "internal_ref" TEXT NOT NULL,
    "booking_channel" "BookingChannel" NOT NULL DEFAULT 'ONLINE',
    "agent_id" UUID,
    "agent_ref" TEXT,
    "customer_id" UUID,
    "service_type" "ServiceType" NOT NULL,
    "job_date" DATE NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "adult_count" SMALLINT NOT NULL,
    "child_count" SMALLINT NOT NULL DEFAULT 0,
    "pax_count" SMALLINT NOT NULL,
    "origin_airport_id" UUID,
    "origin_zone_id" UUID,
    "origin_hotel_id" UUID,
    "destination_airport_id" UUID,
    "destination_zone_id" UUID,
    "destination_hotel_id" UUID,
    "from_zone_id" UUID,
    "to_zone_id" UUID,
    "hotel_id" UUID,
    "client_name" TEXT,
    "booster_seat" BOOLEAN NOT NULL DEFAULT false,
    "baby_seat" BOOLEAN NOT NULL DEFAULT false,
    "wheel_chair" BOOLEAN NOT NULL DEFAULT false,
    "pick_up_time" TIMESTAMPTZ,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "traffic_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_flights" (
    "id" UUID NOT NULL,
    "traffic_job_id" UUID NOT NULL,
    "flight_no" TEXT NOT NULL,
    "carrier" TEXT,
    "terminal" TEXT,
    "arrival_time" TIMESTAMPTZ,
    "departure_time" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "traffic_flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_assignments" (
    "id" UUID NOT NULL,
    "traffic_job_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID,
    "rep_id" UUID,
    "assigned_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "traffic_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_trip_fees" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "traffic_job_id" UUID NOT NULL,
    "from_zone_id" UUID NOT NULL,
    "to_zone_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "is_posted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "driver_trip_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rep_fees" (
    "id" UUID NOT NULL,
    "rep_id" UUID NOT NULL,
    "traffic_job_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "is_posted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rep_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_costs" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "traffic_job_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "is_posted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "supplier_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_invoices" (
    "id" UUID NOT NULL,
    "agent_id" UUID,
    "customer_id" UUID,
    "invoice_number" TEXT NOT NULL,
    "invoice_type" "InvoiceType",
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "posted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "traffic_job_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "agent_invoice_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_date" DATE NOT NULL,
    "reference" TEXT,
    "is_posted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "entry_number" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "journal_type" "JournalType" NOT NULL,
    "description" TEXT,
    "is_posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'EGP',
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "partner_type" TEXT,
    "partner_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "primary_color" TEXT NOT NULL DEFAULT '#3b82f6',
    "accent_color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "font_family" TEXT NOT NULL DEFAULT 'Geist',
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL DEFAULT 'iTour TT',
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "report_header_html" TEXT,
    "report_footer_html" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "module" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rep_notifications" (
    "id" UUID NOT NULL,
    "rep_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'GENERAL',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "traffic_job_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rep_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "countries_name_key" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_name_key" ON "vehicle_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "driver_vehicles_driver_id_vehicle_id_key" ON "driver_vehicles"("driver_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "reps_user_id_key" ON "reps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rep_zones_rep_id_zone_id_key" ON "rep_zones"("rep_id", "zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_credit_terms_agent_id_key" ON "agent_credit_terms"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_invoice_cycles_agent_id_key" ON "agent_invoice_cycles"("agent_id");

-- CreateIndex
CREATE INDEX "customer_price_items_customer_id_idx" ON "customer_price_items"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_price_items_customer_id_service_type_from_zone_id__key" ON "customer_price_items"("customer_id", "service_type", "from_zone_id", "to_zone_id", "vehicle_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_jobs_internal_ref_key" ON "traffic_jobs"("internal_ref");

-- CreateIndex
CREATE INDEX "traffic_jobs_job_date_idx" ON "traffic_jobs"("job_date");

-- CreateIndex
CREATE INDEX "traffic_jobs_agent_id_idx" ON "traffic_jobs"("agent_id");

-- CreateIndex
CREATE INDEX "traffic_jobs_customer_id_idx" ON "traffic_jobs"("customer_id");

-- CreateIndex
CREATE INDEX "traffic_jobs_status_idx" ON "traffic_jobs"("status");

-- CreateIndex
CREATE INDEX "traffic_jobs_booking_channel_idx" ON "traffic_jobs"("booking_channel");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_flights_traffic_job_id_key" ON "traffic_flights"("traffic_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_assignments_traffic_job_id_key" ON "traffic_assignments"("traffic_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_invoices_invoice_number_key" ON "agent_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "agent_invoices_agent_id_idx" ON "agent_invoices"("agent_id");

-- CreateIndex
CREATE INDEX "agent_invoices_customer_id_idx" ON "agent_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "agent_invoices_status_idx" ON "agent_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entry_number_key" ON "journal_entries"("entry_number");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_module_key" ON "role_permissions"("role", "module");

-- AddForeignKey
ALTER TABLE "airports" ADD CONSTRAINT "airports_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_airport_id_fkey" FOREIGN KEY ("airport_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicles" ADD CONSTRAINT "driver_vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicles" ADD CONSTRAINT "driver_vehicles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reps" ADD CONSTRAINT "reps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_zones" ADD CONSTRAINT "rep_zones_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_zones" ADD CONSTRAINT "rep_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_documents" ADD CONSTRAINT "agent_documents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_credit_terms" ADD CONSTRAINT "agent_credit_terms_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_invoice_cycles" ADD CONSTRAINT "agent_invoice_cycles_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_items" ADD CONSTRAINT "customer_price_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_items" ADD CONSTRAINT "customer_price_items_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_items" ADD CONSTRAINT "customer_price_items_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_items" ADD CONSTRAINT "customer_price_items_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_trip_prices" ADD CONSTRAINT "supplier_trip_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_trip_prices" ADD CONSTRAINT "supplier_trip_prices_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_trip_prices" ADD CONSTRAINT "supplier_trip_prices_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_trip_prices" ADD CONSTRAINT "supplier_trip_prices_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_origin_airport_id_fkey" FOREIGN KEY ("origin_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_origin_zone_id_fkey" FOREIGN KEY ("origin_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_origin_hotel_id_fkey" FOREIGN KEY ("origin_hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_destination_airport_id_fkey" FOREIGN KEY ("destination_airport_id") REFERENCES "airports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_destination_zone_id_fkey" FOREIGN KEY ("destination_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_destination_hotel_id_fkey" FOREIGN KEY ("destination_hotel_id") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_jobs" ADD CONSTRAINT "traffic_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_flights" ADD CONSTRAINT "traffic_flights_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_assignments" ADD CONSTRAINT "traffic_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_trip_fees" ADD CONSTRAINT "driver_trip_fees_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_trip_fees" ADD CONSTRAINT "driver_trip_fees_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_trip_fees" ADD CONSTRAINT "driver_trip_fees_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_trip_fees" ADD CONSTRAINT "driver_trip_fees_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_fees" ADD CONSTRAINT "rep_fees_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_fees" ADD CONSTRAINT "rep_fees_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_costs" ADD CONSTRAINT "supplier_costs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_costs" ADD CONSTRAINT "supplier_costs_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_invoices" ADD CONSTRAINT "agent_invoices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_invoices" ADD CONSTRAINT "agent_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "agent_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_agent_invoice_id_fkey" FOREIGN KEY ("agent_invoice_id") REFERENCES "agent_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_notifications" ADD CONSTRAINT "rep_notifications_rep_id_fkey" FOREIGN KEY ("rep_id") REFERENCES "reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rep_notifications" ADD CONSTRAINT "rep_notifications_traffic_job_id_fkey" FOREIGN KEY ("traffic_job_id") REFERENCES "traffic_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

