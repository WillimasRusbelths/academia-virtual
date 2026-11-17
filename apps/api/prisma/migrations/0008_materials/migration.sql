BEGIN;
-- Additive private storage. No changes to identity, offering or financial rules.
CREATE TYPE "MaterialState" AS ENUM ('PREPARED', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "MaterialOperation" AS ENUM ('UPLOAD_COMPLETE', 'EDIT', 'PUBLISH', 'WITHDRAW');

CREATE TABLE "Material" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "AcademicGroup"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  state "MaterialState" NOT NULL DEFAULT 'PREPARED',
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  "createdBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "updatedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(6),
  "withdrawnAt" TIMESTAMPTZ(6),
  CONSTRAINT "Material_title_check" CHECK (char_length(title) BETWEEN 1 AND 200
    AND title = identity_trim(title) AND title !~ '[[:cntrl:]]'),
  CONSTRAINT "Material_description_check" CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT "Material_state_times_check" CHECK (
    (state <> 'PREPARED' OR ("publishedAt" IS NULL AND "withdrawnAt" IS NULL))
    AND (state <> 'PUBLISHED' OR "publishedAt" IS NOT NULL)
    AND (state <> 'WITHDRAWN' OR "withdrawnAt" IS NOT NULL))
);

CREATE TABLE "MaterialContent" (
  "materialId" UUID PRIMARY KEY REFERENCES "Material"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  bytes BYTEA NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "mediaType" TEXT NOT NULL,
  "downloadName" TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  CONSTRAINT "MaterialContent_size_check" CHECK ("byteSize" BETWEEN 1 AND 20000000 AND octet_length(bytes) = "byteSize"),
  CONSTRAINT "MaterialContent_hash_check" CHECK (sha256 ~ '^[0-9a-f]{64}$' AND sha256 = encode(sha256(bytes), 'hex')),
  CONSTRAINT "MaterialContent_type_check" CHECK ("mediaType" IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT "MaterialContent_name_check" CHECK (char_length("downloadName") BETWEEN 1 AND 180
    AND "downloadName" = identity_trim("downloadName") AND "downloadName" !~ '[[:cntrl:]]'
    AND position('/' in "downloadName") = 0 AND position(chr(92) in "downloadName") = 0
    AND (("mediaType" = 'application/pdf' AND lower("downloadName") ~ '\.pdf$')
      OR ("mediaType" = 'image/jpeg' AND lower("downloadName") ~ '\.jpe?g$')
      OR ("mediaType" = 'image/png' AND lower("downloadName") ~ '\.png$')))
);

CREATE TABLE "MaterialUpload" (
  "uploadId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "intentionId" UUID NOT NULL,
  "groupId" UUID NOT NULL REFERENCES "AcademicGroup"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  "downloadName" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL CHECK ("byteSize" BETWEEN 1 AND 20000000),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  "payloadDigest" BYTEA NOT NULL CHECK (octet_length("payloadDigest") = 32),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "materialId" UUID UNIQUE REFERENCES "Material"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE ("actorId", "intentionId"),
  CONSTRAINT "MaterialUpload_title_check" CHECK (char_length(title) BETWEEN 1 AND 200
    AND title = identity_trim(title) AND title !~ '[[:cntrl:]]'),
  CONSTRAINT "MaterialUpload_description_check" CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT "MaterialUpload_name_check" CHECK (char_length("downloadName") BETWEEN 1 AND 180
    AND "downloadName" = identity_trim("downloadName") AND "downloadName" !~ '[[:cntrl:]]'
    AND position('/' in "downloadName") = 0 AND position(chr(92) in "downloadName") = 0
    AND (("mediaType" = 'application/pdf' AND lower("downloadName") ~ '\.pdf$')
      OR ("mediaType" = 'image/jpeg' AND lower("downloadName") ~ '\.jpe?g$')
      OR ("mediaType" = 'image/png' AND lower("downloadName") ~ '\.png$')))
);

CREATE TABLE "MaterialCommand" (
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "commandId" UUID NOT NULL,
  "materialId" UUID NOT NULL REFERENCES "Material"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operation "MaterialOperation" NOT NULL CHECK (operation <> 'UPLOAD_COMPLETE'),
  "payloadDigest" BYTEA NOT NULL CHECK (octet_length("payloadDigest") = 32),
  "appliedRevision" BIGINT NOT NULL CHECK ("appliedRevision" > 0),
  result "AuditResult" NOT NULL,
  "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("actorId", "commandId")
);

CREATE TABLE "MaterialAuditEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "groupId" UUID NOT NULL REFERENCES "AcademicGroup"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "materialId" UUID NOT NULL REFERENCES "Material"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "intentionId" UUID,
  "commandId" UUID,
  operation "MaterialOperation" NOT NULL,
  result "AuditResult" NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialAuditEvent_identity_check" CHECK (
    (operation = 'UPLOAD_COMPLETE' AND "intentionId" IS NOT NULL AND "commandId" IS NULL)
    OR (operation <> 'UPLOAD_COMPLETE' AND "intentionId" IS NULL AND "commandId" IS NOT NULL))
);

CREATE INDEX "Material_groupId_state_createdAt_id_idx" ON "Material"("groupId",state,"createdAt",id);
CREATE INDEX "MaterialUpload_groupId_idx" ON "MaterialUpload"("groupId");
CREATE INDEX "MaterialCommand_materialId_idx" ON "MaterialCommand"("materialId");
CREATE INDEX "MaterialAuditEvent_materialId_occurredAt_id_idx" ON "MaterialAuditEvent"("materialId","occurredAt",id);

CREATE FUNCTION materials_normalize_description() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF identity_trim(NEW.description) = '' THEN NEW.description := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Material_normalize_description" BEFORE INSERT OR UPDATE ON "Material"
  FOR EACH ROW EXECUTE FUNCTION materials_normalize_description();
CREATE TRIGGER "MaterialUpload_normalize_description" BEFORE INSERT OR UPDATE ON "MaterialUpload"
  FOR EACH ROW EXECUTE FUNCTION materials_normalize_description();

CREATE FUNCTION materials_guard_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 OR NEW.state <> 'PREPARED' THEN
      RAISE EXCEPTION 'Material initial state invalid' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW."groupId" IS DISTINCT FROM OLD."groupId"
    OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Material identity immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Material_identity_guard" BEFORE INSERT OR UPDATE ON "Material"
  FOR EACH ROW EXECUTE FUNCTION materials_guard_material();

CREATE FUNCTION materials_guard_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Material content immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Material content immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MaterialContent_immutable" BEFORE UPDATE OR DELETE ON "MaterialContent"
  FOR EACH ROW EXECUTE FUNCTION materials_guard_content();

-- A material and its content must be committed together, even for direct runtime SQL.
-- Reverse completeness check is defense in depth; the immediate guard forbids
-- DELETE+INSERT replacement under the same material identity.
CREATE FUNCTION materials_require_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
  IF TG_TABLE_NAME = 'Material' THEN target := NEW.id; ELSE target := OLD."materialId"; END IF;
  IF EXISTS (SELECT 1 FROM "Material" WHERE id = target)
    AND NOT EXISTS (SELECT 1 FROM "MaterialContent" WHERE "materialId" = target) THEN
    RAISE EXCEPTION 'Material requires complete content' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Material_complete_content" AFTER INSERT OR UPDATE ON "Material"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION materials_require_content();
CREATE CONSTRAINT TRIGGER "MaterialContent_preserve_complete" AFTER DELETE ON "MaterialContent"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION materials_require_content();

CREATE FUNCTION materials_guard_upload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'materialId') IS DISTINCT FROM (to_jsonb(OLD) - 'materialId')
    OR (OLD."materialId" IS NOT NULL AND NEW."materialId" IS DISTINCT FROM OLD."materialId") THEN
    RAISE EXCEPTION 'Material upload intention immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MaterialUpload_immutable" BEFORE UPDATE ON "MaterialUpload"
  FOR EACH ROW EXECUTE FUNCTION materials_guard_upload();

CREATE FUNCTION materials_guard_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Material history immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "MaterialCommand_immutable" BEFORE UPDATE OR DELETE ON "MaterialCommand"
  FOR EACH ROW EXECUTE FUNCTION materials_guard_history();
CREATE TRIGGER "MaterialAuditEvent_immutable" BEFORE UPDATE OR DELETE ON "MaterialAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION materials_guard_history();
COMMIT;
