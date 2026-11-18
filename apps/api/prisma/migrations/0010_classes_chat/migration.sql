BEGIN;
-- Solo datos privados de clases. No altera tablas/reglas financieras o migraciones previas.
CREATE TYPE "ClassState" AS ENUM ('PREPARED','LIVE','FINISHED','CANCELLED');
CREATE TYPE "ClassOperation" AS ENUM ('CREATE','EDIT','START','FINISH','CANCEL','SEND','HIDE','MUTE','UNMUTE','VIDEO_REFERENCE_SET');
CREATE TYPE "ClassChangeType" AS ENUM ('CREATED','EDITED','STARTED','FINISHED','CANCELLED','MESSAGE_SENT','MESSAGE_HIDDEN','STUDENT_MUTED','STUDENT_UNMUTED','VIDEO_REFERENCE_CHANGED');
CREATE TYPE "ClassAuditResult" AS ENUM ('APPLIED','NO_CHANGE','REJECTED');

CREATE TABLE "ClassSession" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL REFERENCES "AcademicGroup"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160 AND title=identity_trim(title)),
  description TEXT CHECK (description IS NULL OR char_length(description)<=2000),
  state "ClassState" NOT NULL DEFAULT 'PREPARED',
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision>0),
  "lastEventSeq" BIGINT NOT NULL DEFAULT 0 CHECK ("lastEventSeq">=0),
  "createdBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "updatedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ(6), "finishedAt" TIMESTAMPTZ(6), "cancelledAt" TIMESTAMPTZ(6),
  UNIQUE(id,"groupId"),
  CONSTRAINT "ClassSession_times_check" CHECK (
    isfinite("createdAt") AND isfinite("updatedAt") AND "updatedAt">="createdAt"
    AND ("startedAt" IS NULL OR (isfinite("startedAt") AND "startedAt">="createdAt" AND "updatedAt">="startedAt"))
    AND ("finishedAt" IS NULL OR (isfinite("finishedAt") AND "finishedAt">="startedAt" AND "updatedAt">="finishedAt"))
    AND ("cancelledAt" IS NULL OR (isfinite("cancelledAt") AND "cancelledAt">="createdAt" AND "updatedAt">="cancelledAt"))),
  CONSTRAINT "ClassSession_state_check" CHECK (
    (state='PREPARED' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NULL)
    OR (state='LIVE' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NULL)
    OR (state='FINISHED' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR (state='CANCELLED' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "cancelledAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "ClassSession_one_live_per_group" ON "ClassSession"("groupId") WHERE state='LIVE';
CREATE INDEX "ClassSession_groupId_createdAt_id_idx" ON "ClassSession"("groupId","createdAt",id);

CREATE TABLE "ClassMessage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "classId" UUID NOT NULL REFERENCES "ClassSession"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "authorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "messageSeq" BIGINT NOT NULL CHECK ("messageSeq">0),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000 AND text=identity_trim(text)),
  "acceptedAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("acceptedAt")),
  "hiddenAt" TIMESTAMPTZ(6),
  "hiddenBy" UUID REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "hiddenEventSeq" BIGINT,
  UNIQUE("classId","messageSeq"), UNIQUE(id,"classId"),
  CONSTRAINT "ClassMessage_hidden_check" CHECK (
    ("hiddenAt" IS NULL AND "hiddenBy" IS NULL AND "hiddenEventSeq" IS NULL)
    OR ("hiddenAt" IS NOT NULL AND "hiddenBy" IS NOT NULL AND "hiddenEventSeq" IS NOT NULL
      AND isfinite("hiddenAt") AND "hiddenAt">="acceptedAt" AND "hiddenEventSeq">"messageSeq"))
);
CREATE INDEX "ClassMessage_classId_authorId_acceptedAt_idx" ON "ClassMessage"("classId","authorId","acceptedAt");

CREATE TABLE "ClassStudentRestriction" (
  "classId" UUID NOT NULL REFERENCES "ClassSession"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "studentId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  muted BOOLEAN NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision>0),
  "updatedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("updatedAt")),
  "lastEventSeq" BIGINT NOT NULL CHECK ("lastEventSeq">0),
  PRIMARY KEY("classId","studentId")
);

CREATE TABLE "ClassCommand" (
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "commandId" UUID NOT NULL,
  "classId" UUID NOT NULL, "groupId" UUID NOT NULL,
  operation "ClassOperation" NOT NULL,
  "payloadDigest" BYTEA NOT NULL CHECK (octet_length("payloadDigest")=32),
  "messageId" UUID,
  "targetStudentId" UUID REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "appliedRevision" BIGINT CHECK ("appliedRevision">0),
  "appliedEventSeq" BIGINT CHECK ("appliedEventSeq">0),
  result "AuditResult" NOT NULL,
  "appliedAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("appliedAt")),
  PRIMARY KEY("actorId","commandId"),
  FOREIGN KEY("classId","groupId") REFERENCES "ClassSession"(id,"groupId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY("messageId","classId") REFERENCES "ClassMessage"(id,"classId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (result<>'APPLIED' OR "appliedEventSeq" IS NOT NULL),
  CONSTRAINT "ClassCommand_target_check" CHECK (
    (operation IN ('SEND','HIDE') AND "messageId" IS NOT NULL AND "targetStudentId" IS NULL AND "appliedRevision" IS NULL)
    OR (operation IN ('MUTE','UNMUTE') AND "messageId" IS NULL AND "targetStudentId" IS NOT NULL
      AND ("appliedRevision" IS NOT NULL OR (operation='UNMUTE' AND result='NO_CHANGE' AND "appliedEventSeq" IS NULL)))
    OR (operation IN ('CREATE','EDIT','START','FINISH','CANCEL') AND "messageId" IS NULL AND "targetStudentId" IS NULL AND "appliedRevision" IS NOT NULL)
    OR (operation='VIDEO_REFERENCE_SET' AND "messageId" IS NULL AND "targetStudentId" IS NULL
      AND ("appliedRevision" IS NOT NULL OR (result='NO_CHANGE' AND "appliedEventSeq" IS NULL))))
);
CREATE INDEX "ClassCommand_classId_idx" ON "ClassCommand"("classId");

CREATE TABLE "ClassChange" (
  "classId" UUID NOT NULL REFERENCES "ClassSession"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "eventSeq" BIGINT NOT NULL CHECK ("eventSeq">0),
  type "ClassChangeType" NOT NULL,
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("occurredAt")),
  "messageId" UUID,
  "targetStudentId" UUID REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision BIGINT CHECK (revision>0),
  PRIMARY KEY("classId","eventSeq"),
  FOREIGN KEY("messageId","classId") REFERENCES "ClassMessage"(id,"classId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClassChange_target_check" CHECK (
    (type IN ('MESSAGE_SENT','MESSAGE_HIDDEN') AND "messageId" IS NOT NULL AND "targetStudentId" IS NULL AND revision IS NULL)
    OR (type IN ('STUDENT_MUTED','STUDENT_UNMUTED') AND "messageId" IS NULL AND "targetStudentId" IS NOT NULL AND revision IS NOT NULL)
    OR (type IN ('CREATED','EDITED','STARTED','FINISHED','CANCELLED','VIDEO_REFERENCE_CHANGED') AND "messageId" IS NULL AND "targetStudentId" IS NULL AND revision IS NOT NULL))
);

CREATE TABLE "ClassAuditEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "classId" UUID NOT NULL, "groupId" UUID NOT NULL,
  operation "ClassOperation" NOT NULL,
  "commandId" UUID,
  result "ClassAuditResult" NOT NULL,
  revision BIGINT CHECK (revision>0),
  "eventSeq" BIGINT CHECK ("eventSeq">0),
  "occurredAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("occurredAt")),
  FOREIGN KEY("classId","groupId") REFERENCES "ClassSession"(id,"groupId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ClassAuditEvent_classId_occurredAt_id_idx" ON "ClassAuditEvent"("classId","occurredAt",id);

CREATE TABLE "ClassVideoReference" (
  "classId" UUID PRIMARY KEY REFERENCES "ClassSession"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'YOUTUBE_DEMO' CHECK (provider='YOUTUBE_DEMO'),
  "videoId" TEXT CHECK ("videoId" IS NULL OR (char_length("videoId")=11 AND "videoId" COLLATE "C" !~ '[^A-Za-z0-9_-]')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision>0),
  "updatedBy" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL CHECK (isfinite("updatedAt"))
);

CREATE FUNCTION classes_guard_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed BOOLEAN;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Class session retained' USING ERRCODE='23514'; END IF;
  IF identity_trim(NEW.description)='' THEN NEW.description:=NULL; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'PREPARED' OR NEW.revision<>1 OR NEW."lastEventSeq"<>0 THEN
      RAISE EXCEPTION 'Class initial state invalid' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW."groupId" IS DISTINCT FROM OLD."groupId"
      OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW."updatedAt"<OLD."updatedAt" OR NEW."lastEventSeq"<OLD."lastEventSeq"
      OR (OLD."startedAt" IS NOT NULL AND NEW."startedAt" IS DISTINCT FROM OLD."startedAt")
      OR (OLD."finishedAt" IS NOT NULL AND NEW."finishedAt" IS DISTINCT FROM OLD."finishedAt")
      OR (OLD."cancelledAt" IS NOT NULL AND NEW."cancelledAt" IS DISTINCT FROM OLD."cancelledAt") THEN
      RAISE EXCEPTION 'Class identity/time/order immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.state<>OLD.state AND NOT ((OLD.state='PREPARED' AND NEW.state IN ('LIVE','CANCELLED')) OR (OLD.state='LIVE' AND NEW.state='FINISHED')) THEN
      RAISE EXCEPTION 'Class transition invalid' USING ERRCODE='23514';
    END IF;
    changed:=NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.state<>OLD.state;
    IF (changed AND NEW.revision<>OLD.revision+1) OR (NOT changed AND (NEW.revision<>OLD.revision
      OR NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" OR NEW."updatedBy" IS DISTINCT FROM OLD."updatedBy")) THEN
      RAISE EXCEPTION 'Class management revision invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClassSession_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClassSession" FOR EACH ROW EXECUTE FUNCTION classes_guard_session();

CREATE FUNCTION classes_guard_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Class message retained' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW."hiddenAt" IS NOT NULL OR NEW."hiddenBy" IS NOT NULL OR NEW."hiddenEventSeq" IS NOT NULL THEN
      RAISE EXCEPTION 'New message must be visible' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW."classId" IS DISTINCT FROM OLD."classId"
    OR NEW."authorId" IS DISTINCT FROM OLD."authorId" OR NEW."messageSeq" IS DISTINCT FROM OLD."messageSeq"
    OR NEW.text IS DISTINCT FROM OLD.text OR NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt"
    OR (OLD."hiddenAt" IS NOT NULL AND (NEW."hiddenAt" IS DISTINCT FROM OLD."hiddenAt"
      OR NEW."hiddenBy" IS DISTINCT FROM OLD."hiddenBy" OR NEW."hiddenEventSeq" IS DISTINCT FROM OLD."hiddenEventSeq")) THEN
    RAISE EXCEPTION 'Message identity/original/hidden fact immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClassMessage_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClassMessage" FOR EACH ROW EXECUTE FUNCTION classes_guard_message();

CREATE FUNCTION classes_guard_restriction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Class restriction retained' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN RAISE EXCEPTION 'Restriction initial revision invalid' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW."classId" IS DISTINCT FROM OLD."classId" OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
      OR NEW."updatedAt"<OLD."updatedAt" OR (NEW.muted<>OLD.muted AND (NEW.revision<>OLD.revision+1 OR NEW."lastEventSeq"<=OLD."lastEventSeq"))
      OR (NEW.muted=OLD.muted AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Restriction identity/revision/order invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClassStudentRestriction_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClassStudentRestriction" FOR EACH ROW EXECUTE FUNCTION classes_guard_restriction();

CREATE FUNCTION classes_guard_video_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Video reference retained' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 THEN RAISE EXCEPTION 'Video initial revision invalid' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW."classId" IS DISTINCT FROM OLD."classId" OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW."updatedAt"<OLD."updatedAt"
      OR (NEW."videoId" IS DISTINCT FROM OLD."videoId" AND NEW.revision<>OLD.revision+1)
      OR (NEW."videoId" IS NOT DISTINCT FROM OLD."videoId" AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Video reference identity/revision invalid' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClassVideoReference_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClassVideoReference" FOR EACH ROW EXECUTE FUNCTION classes_guard_video_reference();

CREATE FUNCTION classes_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Class history append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "ClassCommand_append_only" BEFORE UPDATE OR DELETE ON "ClassCommand" FOR EACH ROW EXECUTE FUNCTION classes_append_only();
CREATE TRIGGER "ClassChange_append_only" BEFORE UPDATE OR DELETE ON "ClassChange" FOR EACH ROW EXECUTE FUNCTION classes_append_only();
CREATE TRIGGER "ClassAuditEvent_append_only" BEFORE UPDATE OR DELETE ON "ClassAuditEvent" FOR EACH ROW EXECUTE FUNCTION classes_append_only();
COMMIT;
