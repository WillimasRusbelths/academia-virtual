BEGIN;
-- Base generada por Prisma migrate diff; controles SQL revisados al final.
-- CreateEnum
CREATE TYPE "AcademicCourseState" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AcademicGroupState" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcademicResourceKind" AS ENUM ('COURSE', 'GROUP');

-- CreateEnum
CREATE TYPE "AcademicOperation" AS ENUM ('COURSE_CREATE', 'COURSE_EDIT', 'COURSE_PUBLISH', 'COURSE_WITHDRAW', 'GROUP_CREATE', 'GROUP_EDIT', 'GROUP_SCHEDULE', 'GROUP_PUBLISH', 'GROUP_WITHDRAW', 'GROUP_CANCEL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teacherEligibilityVersion" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AcademicCourse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "AcademicCourseState" NOT NULL DEFAULT 'DRAFT',
    "revision" BIGINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "AcademicGroupState" NOT NULL DEFAULT 'DRAFT',
    "periodStart" DATE,
    "periodEnd" DATE,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Lima',
    "capacity" SMALLINT,
    "teacherUserId" UUID,
    "publishedTeacherUserId" UUID,
    "publishedTeacherEligibilityVersion" BIGINT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(6),
    "revision" BIGINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicSlot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "groupId" UUID NOT NULL,
    "dayOfWeek" SMALLINT NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,

    CONSTRAINT "AcademicSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicCommand" (
    "actorUserId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "operation" "AcademicOperation" NOT NULL,
    "targetKind" "AcademicResourceKind" NOT NULL,
    "targetId" UUID NOT NULL,
    "payloadDigest" BYTEA NOT NULL,
    "resultingRevision" BIGINT NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "AuditResult" NOT NULL,

    CONSTRAINT "AcademicCommand_pkey" PRIMARY KEY ("actorUserId","commandId")
);

-- CreateTable
CREATE TABLE "AcademicAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "resourceKind" "AcademicResourceKind" NOT NULL,
    "resourceId" UUID NOT NULL,
    "action" "AcademicOperation" NOT NULL,
    "result" "AuditResult" NOT NULL,
    "commandId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "beforeState" "AcademicGroupState",
    "afterState" "AcademicGroupState" NOT NULL,
    "beforeRevision" BIGINT,
    "afterRevision" BIGINT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicGroup_courseId_state_id_idx" ON "AcademicGroup"("courseId", "state", "id");

-- CreateIndex
CREATE INDEX "AcademicGroup_teacherUserId_state_id_idx" ON "AcademicGroup"("teacherUserId", "state", "id");

-- CreateIndex
CREATE INDEX "AcademicSlot_groupId_dayOfWeek_idx" ON "AcademicSlot"("groupId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSlot_group_day_start_end_key" ON "AcademicSlot"("groupId", "dayOfWeek", "startMinute", "endMinute");

-- CreateIndex
CREATE INDEX "AcademicAuditEvent_resourceKind_resourceId_occurredAt_idx" ON "AcademicAuditEvent"("resourceKind", "resourceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "AcademicGroup" ADD CONSTRAINT "AcademicGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademicCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGroup" ADD CONSTRAINT "AcademicGroup_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGroup" ADD CONSTRAINT "AcademicGroup_publishedTeacherUserId_fkey" FOREIGN KEY ("publishedTeacherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSlot" ADD CONSTRAINT "AcademicSlot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademicGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCommand" ADD CONSTRAINT "AcademicCommand_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAuditEvent" ADD CONSTRAINT "AcademicAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones locales: las invariantes entre grupos/usuarios se verifican por el
-- adaptador transaccional posterior; no fingirlas mediante CHECK con consultas ajenas.
ALTER TABLE "User" ADD CONSTRAINT "User_teacherEligibilityVersion_check"
  CHECK ("teacherEligibilityVersion" >= 0);

ALTER TABLE "AcademicCourse"
  ADD CONSTRAINT "AcademicCourse_name_check" CHECK (name <> '' AND name = identity_trim(name)),
  ADD CONSTRAINT "AcademicCourse_description_check" CHECK
    (description IS NULL OR (description <> '' AND description = identity_trim(description))),
  ADD CONSTRAINT "AcademicCourse_publication_check" CHECK (state <> 'PUBLISHED' OR description IS NOT NULL),
  ADD CONSTRAINT "AcademicCourse_revision_check" CHECK (revision > 0);

ALTER TABLE "AcademicGroup"
  ADD CONSTRAINT "AcademicGroup_name_check" CHECK (name <> '' AND name = identity_trim(name)),
  ADD CONSTRAINT "AcademicGroup_period_check" CHECK
    ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd"),
  ADD CONSTRAINT "AcademicGroup_zone_check" CHECK ("timeZone" = 'America/Lima'),
  ADD CONSTRAINT "AcademicGroup_capacity_check" CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 50),
  ADD CONSTRAINT "AcademicGroup_revision_check" CHECK (revision > 0),
  ADD CONSTRAINT "AcademicGroup_snapshot_check" CHECK
    (("publishedTeacherUserId" IS NULL) = ("publishedTeacherEligibilityVersion" IS NULL)
      AND ("publishedTeacherEligibilityVersion" IS NULL OR "publishedTeacherEligibilityVersion" >= 0)),
  ADD CONSTRAINT "AcademicGroup_publication_check" CHECK (state <> 'PUBLISHED' OR
    ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND capacity IS NOT NULL
      AND "teacherUserId" IS NOT NULL AND "publishedTeacherUserId" IS NOT NULL
      AND "publishedTeacherEligibilityVersion" IS NOT NULL AND "teacherUserId" = "publishedTeacherUserId")),
  ADD CONSTRAINT "AcademicGroup_cancellation_check" CHECK (
    (state = 'CANCELLED' AND "cancellationReason" IS NOT NULL AND "cancellationReason" <> ''
      AND "cancellationReason" = identity_trim("cancellationReason") AND "cancelledAt" IS NOT NULL)
    OR (state <> 'CANCELLED' AND "cancellationReason" IS NULL AND "cancelledAt" IS NULL));

ALTER TABLE "AcademicSlot"
  ADD CONSTRAINT "AcademicSlot_day_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
  ADD CONSTRAINT "AcademicSlot_minutes_check" CHECK
    ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 0 AND 1439 AND "endMinute" > "startMinute");

ALTER TABLE "AcademicCommand"
  ADD CONSTRAINT "AcademicCommand_digest_check" CHECK (octet_length("payloadDigest") = 32),
  ADD CONSTRAINT "AcademicCommand_revision_check" CHECK ("resultingRevision" > 0),
  ADD CONSTRAINT "AcademicCommand_resource_check" CHECK
    (("targetKind" = 'COURSE') = (operation::text LIKE 'COURSE\_%' ESCAPE '\'));

ALTER TABLE "AcademicAuditEvent"
  ADD CONSTRAINT "AcademicAuditEvent_revision_check" CHECK
    ("afterRevision" > 0 AND ("beforeRevision" IS NULL OR "beforeRevision" > 0)),
  ADD CONSTRAINT "AcademicAuditEvent_resource_check" CHECK
    (("resourceKind" = 'COURSE') = (action::text LIKE 'COURSE\_%' ESCAPE '\')),
  ADD CONSTRAINT "AcademicAuditEvent_state_check" CHECK ("resourceKind" <> 'COURSE' OR
    ("afterState" <> 'CANCELLED' AND ("beforeState" IS NULL OR "beforeState" <> 'CANCELLED')));

CREATE INDEX "AcademicGroup_published_teacher_idx" ON "AcademicGroup" ("teacherUserId", id)
  WHERE state = 'PUBLISHED';

-- Propiedad de usuarios/identidad. No escribe grupos ni cambia authVersion/sesiones.
-- BEFORE UPDATE comparte la fila y transacción de los escritores de identidad.
CREATE FUNCTION identity_preserve_teacher_eligibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'TEACHER' AND OLD.status = 'ACTIVE' AND OLD."emailVerifiedAt" IS NOT NULL
    AND NOT (NEW.role = 'TEACHER' AND NEW.status = 'ACTIVE' AND NEW."emailVerifiedAt" IS NOT NULL) THEN
    -- El overflow de bigint aborta; nunca se recicla el contador.
    NEW."teacherEligibilityVersion" := OLD."teacherEligibilityVersion" + 1;
  ELSE
    -- Tampoco admitir que el llamante sustituya el contador en un UPDATE ordinario.
    NEW."teacherEligibilityVersion" := OLD."teacherEligibilityVersion";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "User_teacher_eligibility" BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION identity_preserve_teacher_eligibility();

-- Proyección pública mínima ordinaria, enlazada al User del esquema de migración.
-- No añadir soporte de vistas experimental al cliente Prisma.
CREATE VIEW "AcademicTeacherDirectory" AS
  SELECT id AS "userId", name,
    (role = 'TEACHER' AND status = 'ACTIVE' AND "emailVerifiedAt" IS NOT NULL) AS eligible,
    "teacherEligibilityVersion" AS "eligibilityVersion"
  FROM "User";

CREATE FUNCTION academic_guard_course_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Referencia de curso inmutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD.state = 'DRAFT' AND NEW.state NOT IN ('DRAFT', 'PUBLISHED'))
    OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'WITHDRAWN'))
    OR (OLD.state = 'WITHDRAWN' AND NEW.state NOT IN ('WITHDRAWN', 'PUBLISHED')) THEN
    RAISE EXCEPTION 'Transicion de curso invalida' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'PUBLISHED' AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description) THEN
    RAISE EXCEPTION 'Retirar curso antes de editar' USING ERRCODE = '23514';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN NEW."updatedAt" := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AcademicCourse_editorial_guard" BEFORE UPDATE ON "AcademicCourse"
  FOR EACH ROW EXECUTE FUNCTION academic_guard_course_update();

CREATE FUNCTION academic_guard_group_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."courseId" IS DISTINCT FROM OLD."courseId" THEN
    RAISE EXCEPTION 'Referencia o pertenencia de grupo inmutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'CANCELLED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Cancelacion terminal' USING ERRCODE = '23514';
  END IF;
  IF (OLD.state = 'DRAFT' AND NEW.state NOT IN ('DRAFT', 'PUBLISHED', 'CANCELLED'))
    OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'WITHDRAWN', 'CANCELLED'))
    OR (OLD.state = 'WITHDRAWN' AND NEW.state NOT IN ('WITHDRAWN', 'PUBLISHED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'Transicion de grupo invalida' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'PUBLISHED' AND
    (NEW.name IS DISTINCT FROM OLD.name OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart"
      OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd" OR NEW."timeZone" IS DISTINCT FROM OLD."timeZone"
      OR NEW.capacity IS DISTINCT FROM OLD.capacity OR NEW."teacherUserId" IS DISTINCT FROM OLD."teacherUserId") THEN
    RAISE EXCEPTION 'Retirar grupo antes de editar' USING ERRCODE = '23514';
  END IF;
  IF (NEW."publishedTeacherUserId" IS DISTINCT FROM OLD."publishedTeacherUserId"
    OR NEW."publishedTeacherEligibilityVersion" IS DISTINCT FROM OLD."publishedTeacherEligibilityVersion")
    AND NOT (OLD.state IN ('DRAFT', 'WITHDRAWN') AND NEW.state = 'PUBLISHED') THEN
    RAISE EXCEPTION 'Solo publicacion explicita cambia captura docente' USING ERRCODE = '23514';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN NEW."updatedAt" := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AcademicGroup_editorial_guard" BEFORE UPDATE ON "AcademicGroup"
  FOR EACH ROW EXECUTE FUNCTION academic_guard_group_update();

CREATE FUNCTION academic_preserve_slot_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."groupId" IS DISTINCT FROM OLD."groupId" THEN
    RAISE EXCEPTION 'Referencia o pertenencia de franja inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AcademicSlot_membership_guard" BEFORE UPDATE ON "AcademicSlot"
  FOR EACH ROW EXECUTE FUNCTION academic_preserve_slot_membership();

-- Franjas existentes, ocurrencias, elegibilidad actual, padre publicado y agenda
-- se validan bajo locks en el adaptador, no mediante CHECK entre tablas.
COMMIT;
