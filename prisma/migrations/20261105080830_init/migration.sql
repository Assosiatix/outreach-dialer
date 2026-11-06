-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'caller');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('online', 'away', 'on_call', 'offline');

-- CreateEnum
CREATE TYPE "ContactStage" AS ENUM ('new', 'researched', 'contacted', 'follow_up', 'won', 'lost');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled', 'voicemail', 'missed');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'caller',
    "status" "MemberStatus" NOT NULL DEFAULT 'offline',
    "last_seen_at" TIMESTAMP(3),
    "alert_phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_digest_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "contact_person" TEXT,
    "website" TEXT,
    "country" TEXT,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "issue_identified" TEXT,
    "research_notes" TEXT,
    "stage" "ContactStage" NOT NULL DEFAULT 'new',
    "last_contacted_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "assigned_to_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT,
    "team_member_id" TEXT,
    "direction" "CallDirection" NOT NULL,
    "from_number" TEXT NOT NULL,
    "to_number" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'initiated',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "recording_url" TEXT,
    "recording_sid" TEXT,
    "recording_duration" INTEGER,
    "notes" TEXT,
    "call_sid" TEXT,
    "child_call_sid" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "alert_sent_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twilio_numbers" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "label" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "voice_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twilio_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT,
    "team_member_id" TEXT,
    "direction" "SmsDirection" NOT NULL,
    "from_number" TEXT NOT NULL,
    "to_number" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "message_sid" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "contacts_phone_number_idx" ON "contacts"("phone_number");

-- CreateIndex
CREATE INDEX "contacts_stage_idx" ON "contacts"("stage");

-- CreateIndex
CREATE INDEX "contacts_next_follow_up_at_idx" ON "contacts"("next_follow_up_at");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_call_sid_key" ON "call_logs"("call_sid");

-- CreateIndex
CREATE INDEX "call_logs_contact_id_idx" ON "call_logs"("contact_id");

-- CreateIndex
CREATE INDEX "call_logs_team_member_id_idx" ON "call_logs"("team_member_id");

-- CreateIndex
CREATE INDEX "call_logs_started_at_idx" ON "call_logs"("started_at");

-- CreateIndex
CREATE INDEX "call_logs_status_idx" ON "call_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "twilio_numbers_phone_number_key" ON "twilio_numbers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_message_sid_key" ON "sms_messages"("message_sid");

-- CreateIndex
CREATE INDEX "sms_messages_contact_id_idx" ON "sms_messages"("contact_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
