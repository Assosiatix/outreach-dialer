-- Verified Caller IDs: outbound caller ID only (no inbound, no SMS).
ALTER TABLE "twilio_numbers" ADD COLUMN "verified_only" BOOLEAN NOT NULL DEFAULT false;
