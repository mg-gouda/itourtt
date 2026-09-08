-- Complaint tracking — enums only.
-- Kept in its own migration because `ALTER TYPE ... ADD VALUE` cannot be used in the
-- same transaction that later references the new value.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintStage" AS ENUM ('BEFORE_JOB', 'DURING_JOB', 'AFTER_JOB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintSource" AS ENUM ('AGENT', 'GUEST', 'DRIVER', 'REP', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'REPLIED', 'ESCALATED', 'WON', 'PARTIALLY_LOST', 'LOST', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintParty" AS ENUM ('DRIVER', 'REP', 'SUPPLIER', 'OFFICE', 'AGENT', 'CLIENT', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintAttachmentKind" AS ENUM ('COMPLAINT_DOC', 'REPLY_DOC', 'EVIDENCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ComplaintChargeStatus" AS ENUM ('PENDING', 'APPROVED', 'POSTED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgentAdjustmentStatus" AS ENUM ('PENDING', 'ON_INVOICE', 'ISSUED_CREDIT_NOTE', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum: credit notes are AgentInvoices exported to Odoo as out_refund
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE';
