BEGIN;
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "MailErrorClass" AS ENUM ('TIMEOUT', 'TEMPORARY', 'PERMANENT', 'EXPIRED');
CREATE TYPE "RateScope" AS ENUM ('LOGIN_PAIR', 'MAIL_RECIPIENT_PURPOSE', 'MAIL_ORIGIN');
CREATE TYPE "RatePhase" AS ENUM ('ADMISSION', 'SMTP');
CREATE TYPE "RateResult" AS ENUM ('RESERVED', 'FAILED', 'ACCEPTED');
CREATE TABLE "MailDelivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenId" uuid REFERENCES "ActionToken"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientKey" text NOT NULL CHECK ("recipientKey" ~ '^[0-9a-f]{64}$'),
  "originKey" text NOT NULL CHECK ("originKey" ~ '^[0-9a-f]{64}$'),
  "encryptedPayload" bytea, "nonce" bytea, "authTag" bytea, "keyId" text,
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 3),
  "nextAttemptAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" timestamptz, "claimId" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" timestamptz, "finishedAt" timestamptz,
  "lastErrorClass" "MailErrorClass",
  CONSTRAINT "MailDelivery_payload_check" CHECK (
    ("status" IN ('PENDING', 'SENDING') AND "tokenId" IS NOT NULL AND "encryptedPayload" IS NOT NULL
      AND octet_length("encryptedPayload") > 0 AND "nonce" IS NOT NULL AND octet_length("nonce") = 12
      AND "authTag" IS NOT NULL AND octet_length("authTag") = 16 AND "keyId" IS NOT NULL AND char_length("keyId") BETWEEN 1 AND 64
      AND "finishedAt" IS NULL) OR
    ("status" IN ('SENT', 'FAILED', 'CANCELLED') AND "encryptedPayload" IS NULL AND "nonce" IS NULL
      AND "authTag" IS NULL AND "keyId" IS NULL AND "finishedAt" IS NOT NULL)),
  CONSTRAINT "MailDelivery_claim_check" CHECK (
    ("status" = 'SENDING' AND "leaseUntil" IS NOT NULL AND "claimId" IS NOT NULL AND "attempts" >= 1) OR
    ("status" <> 'SENDING' AND "leaseUntil" IS NULL AND "claimId" IS NULL)),
  CONSTRAINT "MailDelivery_sent_check" CHECK (("status" = 'SENT') = ("sentAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "MailDelivery_tokenId_key" ON "MailDelivery"("tokenId");
CREATE INDEX "MailDelivery_status_nextAttemptAt_idx" ON "MailDelivery"("status", "nextAttemptAt");
CREATE INDEX "MailDelivery_leaseUntil_idx" ON "MailDelivery"("leaseUntil");
CREATE TABLE "RateBucket" (
  "key" text PRIMARY KEY CHECK ("key" ~ '^[0-9a-f]{64}$'),
  "scope" "RateScope" NOT NULL,
  "phase" "RatePhase" NOT NULL,
  "blockedUntil" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateBucket_phase_check" CHECK ("scope" <> 'LOGIN_PAIR' OR "phase" = 'ADMISSION')
);
CREATE TRIGGER "RateBucket_updated_at" BEFORE UPDATE ON "RateBucket" FOR EACH ROW EXECUTE FUNCTION identity_touch_updated_at();
CREATE TABLE "RateEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bucketKey" text NOT NULL REFERENCES "RateBucket"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurredAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attemptId" uuid,
  "status" "RateResult" NOT NULL,
  "reservationExpiresAt" timestamptz,
  CONSTRAINT "RateEvent_reservation_check" CHECK (
    ("status" = 'RESERVED' AND "reservationExpiresAt" IS NOT NULL AND "reservationExpiresAt" = "occurredAt" + interval '30 seconds') OR
    ("status" <> 'RESERVED' AND "reservationExpiresAt" IS NULL))
);
CREATE INDEX "RateEvent_bucketKey_occurredAt_idx" ON "RateEvent"("bucketKey", "occurredAt");
COMMIT;
