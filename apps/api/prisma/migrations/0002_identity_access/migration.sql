BEGIN;
CREATE TYPE "TokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
CREATE TYPE "AuditActor" AS ENUM ('ACCOUNT', 'SYSTEM_BOOTSTRAP');
CREATE TYPE "AuditAction" AS ENUM ('ACCOUNT_CREATED', 'BOOTSTRAP_ADMIN_CREATED', 'NAME_CHANGED', 'ROLE_CHANGED', 'STATUS_CHANGED');
CREATE TYPE "AuditResult" AS ENUM ('APPLIED', 'NO_CHANGE');
CREATE TABLE "Session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenHash" bytea NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authVersion" bigint NOT NULL CHECK ("authVersion" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAcceptedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "absoluteExpiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  CONSTRAINT "Session_hash_check" CHECK (octet_length("tokenHash") = 32),
  CONSTRAINT "Session_expiry_check" CHECK ("absoluteExpiresAt" = "createdAt" + interval '8 hours'),
  CONSTRAINT "Session_activity_check" CHECK ("lastAcceptedAt" >= "createdAt" AND "lastAcceptedAt" < "absoluteExpiresAt")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_absoluteExpiresAt_idx" ON "Session"("absoluteExpiresAt");
CREATE TABLE "ActionToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "purpose" "TokenPurpose" NOT NULL,
  "tokenHash" bytea NOT NULL,
  "emailCanonicalSnapshot" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "revokedAt" timestamptz,
  CONSTRAINT "ActionToken_hash_check" CHECK (octet_length("tokenHash") = 32),
  CONSTRAINT "ActionToken_terminal_check" CHECK ("consumedAt" IS NULL OR "revokedAt" IS NULL),
  CONSTRAINT "ActionToken_expiry_check" CHECK ("expiresAt" = "createdAt" + CASE
    WHEN "purpose" = 'VERIFY_EMAIL' THEN interval '24 hours' ELSE interval '30 minutes' END)
);
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");
CREATE UNIQUE INDEX "ActionToken_one_open_per_purpose" ON "ActionToken"("userId", "purpose")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "ActionToken_userId_purpose_idx" ON "ActionToken"("userId", "purpose");
CREATE INDEX "ActionToken_expiresAt_idx" ON "ActionToken"("expiresAt");
CREATE TABLE "AuditEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorKind" "AuditActor" NOT NULL,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetUserId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" "AuditAction" NOT NULL,
  "result" "AuditResult" NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" uuid NOT NULL,
  "oldRole" "Role", "newRole" "Role", "oldStatus" "AccountStatus", "newStatus" "AccountStatus",
  CONSTRAINT "AuditEvent_actor_check" CHECK (
    ("actorKind" = 'ACCOUNT' AND "actorUserId" IS NOT NULL AND "action" <> 'BOOTSTRAP_ADMIN_CREATED') OR
    ("actorKind" = 'SYSTEM_BOOTSTRAP' AND "actorUserId" IS NULL AND "action" = 'BOOTSTRAP_ADMIN_CREATED' AND "result" = 'APPLIED')),
  CONSTRAINT "AuditEvent_changes_check" CHECK (
    ("action" = 'ROLE_CHANGED' AND "result" = 'APPLIED' AND "oldRole" IS NOT NULL AND "newRole" IS NOT NULL
      AND "oldRole" <> "newRole" AND "oldStatus" IS NULL AND "newStatus" IS NULL) OR
    ("action" = 'STATUS_CHANGED' AND "result" = 'APPLIED' AND "oldStatus" IS NOT NULL AND "newStatus" IS NOT NULL
      AND "oldStatus" <> "newStatus" AND "oldRole" IS NULL AND "newRole" IS NULL) OR
    (("action" NOT IN ('ROLE_CHANGED', 'STATUS_CHANGED') OR "result" = 'NO_CHANGE')
      AND "oldRole" IS NULL AND "newRole" IS NULL AND "oldStatus" IS NULL AND "newStatus" IS NULL))
);
CREATE INDEX "AuditEvent_targetUserId_occurredAt_idx" ON "AuditEvent"("targetUserId", "occurredAt");
CREATE TABLE "SystemState" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "bootstrapCompletedAt" timestamptz,
  "firstAdminUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SystemState_marker_check" CHECK (("bootstrapCompletedAt" IS NULL) = ("firstAdminUserId" IS NULL))
);
CREATE UNIQUE INDEX "SystemState_firstAdminUserId_key" ON "SystemState"("firstAdminUserId");
INSERT INTO "SystemState"("id") VALUES (1);
CREATE FUNCTION identity_preserve_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD."bootstrapCompletedAt" IS NOT NULL AND
    (NEW."bootstrapCompletedAt" IS DISTINCT FROM OLD."bootstrapCompletedAt" OR NEW."firstAdminUserId" IS DISTINCT FROM OLD."firstAdminUserId")) THEN
    RAISE EXCEPTION 'Estado de inicialización irreversible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SystemState_preserve_marker" BEFORE UPDATE OR DELETE ON "SystemState"
  FOR EACH ROW EXECUTE FUNCTION identity_preserve_bootstrap();
COMMIT;
