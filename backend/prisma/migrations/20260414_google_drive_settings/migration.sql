-- CreateTable
CREATE TABLE "google_drive_settings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "service_account_json" TEXT,
    "root_folder_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_settings_pkey" PRIMARY KEY ("id")
);
