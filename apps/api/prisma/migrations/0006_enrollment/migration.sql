BEGIN;
-- Base generada con Prisma migrate diff; restricciones locales revisadas a continuación.
-- CreateEnum
CREATE TYPE "ReservationRequestState" AS ENUM ('ADMITTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EnrollmentOrderState" AS ENUM ('RESERVED', 'ENROLLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SeatReservationState" AS ENUM ('CONFIRMED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentAttemptState" AS ENUM ('SUBMITTING', 'PENDING', 'INITIATION_UNKNOWN', 'FAILED_NO_CHARGE', 'APPLIED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "ProviderReceiptState" AS ENUM ('RECEIVED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "PaymentReconciliationState" AS ENUM ('APPLIED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "EnrollmentActorKind" AS ENUM ('ACCOUNT', 'SYSTEM');

-- AlterTable
ALTER TABLE "AcademicGroup" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "CoursePrice" (
    "courseId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "revision" BIGINT NOT NULL DEFAULT 1,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePrice_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "AdmissionSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nextSequence" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "AdmissionSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchState" (
    "id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DispatchState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "intentionId" UUID NOT NULL,
    "selectionDigest" BYTEA NOT NULL,
    "groupIds" UUID[],
    "admittedAt" TIMESTAMPTZ(6) NOT NULL,
    "admissionSequence" BIGINT NOT NULL,
    "actorSessionReference" UUID NOT NULL,
    "authVersion" BIGINT NOT NULL,
    "state" "ReservationRequestState" NOT NULL DEFAULT 'ADMITTED',
    "decisionCode" TEXT,
    "decidedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ReservationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "totalMinor" BIGINT NOT NULL,
    "state" "EnrollmentOrderState" NOT NULL DEFAULT 'RESERVED',
    "revision" BIGINT NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMPTZ(6) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "expirationProcessedAt" TIMESTAMPTZ(6),

    CONSTRAINT "EnrollmentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "courseName" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Lima',
    "groupStartAt" TIMESTAMPTZ(6) NOT NULL,
    "enrollmentValidUntil" TIMESTAMPTZ(6) NOT NULL,
    "scheduleSnapshot" JSONB NOT NULL,

    CONSTRAINT "EnrollmentOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderItemId" UUID NOT NULL,
    "state" "SeatReservationState" NOT NULL DEFAULT 'CONFIRMED',

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "initiationId" UUID NOT NULL,
    "payloadDigest" BYTEA NOT NULL,
    "state" "PaymentAttemptState" NOT NULL DEFAULT 'SUBMITTING',
    "merchantReference" TEXT NOT NULL,
    "externalIdempotencyKey" TEXT NOT NULL,
    "providerScope" TEXT NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerScope" TEXT NOT NULL,
    "deliveryKey" TEXT,
    "merchantReferenceHint" TEXT,
    "providerPaymentIdHint" TEXT,
    "normalizedEvidenceReference" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalObservedAt" TIMESTAMPTZ(6),
    "state" "ProviderReceiptState" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMPTZ(6),
    "terminalPaymentId" UUID,

    CONSTRAINT "ProviderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerScope" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "orderId" UUID,
    "amountUnits" DECIMAL NOT NULL,
    "amountScale" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "verificationFinishedAt" TIMESTAMPTZ(6) NOT NULL,
    "reconciliationState" "PaymentReconciliationState" NOT NULL,
    "normalizedEvidenceReference" TEXT NOT NULL,

    CONSTRAINT "VerifiedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderItemId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6) NOT NULL,
    "originalPeriodStart" DATE NOT NULL,
    "originalPeriodEnd" DATE NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Lima',
    "scheduleSnapshot" JSONB NOT NULL,
    "validUntil" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIncident" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID,
    "verifiedPaymentId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "affectedGroupIds" UUID[],
    "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentFollowUp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incidentId" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,

    CONSTRAINT "IncidentFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentCommand" (
    "actorKind" "EnrollmentActorKind" NOT NULL,
    "actorReference" TEXT NOT NULL,
    "commandId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "payloadDigest" BYTEA NOT NULL,
    "outcomeCode" TEXT NOT NULL,
    "resourceReferences" JSONB NOT NULL,
    "resultingRevision" BIGINT NOT NULL,
    "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentCommand_pkey" PRIMARY KEY ("actorKind","actorReference","commandId")
);

-- CreateTable
CREATE TABLE "EnrollmentAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorKind" "EnrollmentActorKind" NOT NULL,
    "actorReference" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "commandId" UUID,
    "providerEventId" TEXT,
    "effectKey" TEXT,
    "requestId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeRevision" BIGINT,
    "afterRevision" BIGINT,
    "result" TEXT NOT NULL,

    CONSTRAINT "EnrollmentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequest_admissionSequence_key" ON "ReservationRequest"("admissionSequence");

-- CreateIndex
CREATE INDEX "ReservationRequest_state_admissionSequence_idx" ON "ReservationRequest"("state", "admissionSequence");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequest_studentId_intentionId_key" ON "ReservationRequest"("studentId", "intentionId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentOrder_requestId_key" ON "EnrollmentOrder"("requestId");

-- CreateIndex
CREATE INDEX "EnrollmentOrder_studentId_state_expiresAt_idx" ON "EnrollmentOrder"("studentId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "EnrollmentOrder_state_expiresAt_id_idx" ON "EnrollmentOrder"("state", "expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentOrder_id_studentId_key" ON "EnrollmentOrder"("id", "studentId");

-- CreateIndex
CREATE INDEX "EnrollmentOrderItem_groupId_courseId_orderId_idx" ON "EnrollmentOrderItem"("groupId", "courseId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentOrderItem_orderId_courseId_key" ON "EnrollmentOrderItem"("orderId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_orderItemId_key" ON "SeatReservation"("orderItemId");

-- CreateIndex
CREATE INDEX "SeatReservation_state_orderItemId_idx" ON "SeatReservation"("state", "orderItemId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_state_createdAt_id_idx" ON "PaymentAttempt"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_studentId_initiationId_key" ON "PaymentAttempt"("studentId", "initiationId");

-- CreateIndex
CREATE INDEX "ProviderReceipt_state_receivedAt_id_idx" ON "ProviderReceipt"("state", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "VerifiedPayment_orderId_idx" ON "VerifiedPayment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedPayment_providerScope_providerPaymentId_key" ON "VerifiedPayment"("providerScope", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_orderItemId_key" ON "Enrollment"("orderItemId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_courseId_validUntil_idx" ON "Enrollment"("studentId", "courseId", "validUntil");

-- CreateIndex
CREATE INDEX "Enrollment_groupId_validUntil_idx" ON "Enrollment"("groupId", "validUntil");

-- CreateIndex
CREATE INDEX "PaymentIncident_orderId_openedAt_idx" ON "PaymentIncident"("orderId", "openedAt");

-- CreateIndex
CREATE INDEX "PaymentIncident_affectedGroupIds_idx" ON "PaymentIncident" USING GIN ("affectedGroupIds");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIncident_verifiedPaymentId_reason_key" ON "PaymentIncident"("verifiedPaymentId", "reason");

-- CreateIndex
CREATE INDEX "IncidentFollowUp_incidentId_recordedAt_id_idx" ON "IncidentFollowUp"("incidentId", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentFollowUp_adminUserId_commandId_key" ON "IncidentFollowUp"("adminUserId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentAuditEvent_effectKey_key" ON "EnrollmentAuditEvent"("effectKey");

-- CreateIndex
CREATE INDEX "EnrollmentAuditEvent_targetKind_targetId_occurredAt_idx" ON "EnrollmentAuditEvent"("targetKind", "targetId", "occurredAt");

-- AddForeignKey
ALTER TABLE "CoursePrice" ADD CONSTRAINT "CoursePrice_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademicCourse"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CoursePrice" ADD CONSTRAINT "CoursePrice_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EnrollmentOrder" ADD CONSTRAINT "EnrollmentOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EnrollmentOrder" ADD CONSTRAINT "EnrollmentOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReservationRequest"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EnrollmentOrderItem" ADD CONSTRAINT "EnrollmentOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EnrollmentOrder"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EnrollmentOrderItem" ADD CONSTRAINT "EnrollmentOrderItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademicCourse"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EnrollmentOrderItem" ADD CONSTRAINT "EnrollmentOrderItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademicGroup"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "EnrollmentOrderItem"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_studentId_fkey" FOREIGN KEY ("orderId", "studentId") REFERENCES "EnrollmentOrder"("id", "studentId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProviderReceipt" ADD CONSTRAINT "ProviderReceipt_terminalPaymentId_fkey" FOREIGN KEY ("terminalPaymentId") REFERENCES "VerifiedPayment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "VerifiedPayment" ADD CONSTRAINT "VerifiedPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EnrollmentOrder"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "EnrollmentOrderItem"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademicCourse"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AcademicGroup"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "VerifiedPayment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIncident" ADD CONSTRAINT "PaymentIncident_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EnrollmentOrder"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentIncident" ADD CONSTRAINT "PaymentIncident_verifiedPaymentId_fkey" FOREIGN KEY ("verifiedPaymentId") REFERENCES "VerifiedPayment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PaymentIncident"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reglas locales adicionales al diff Prisma; no CHECK entre filas ni reloj implícito.
ALTER TABLE "ReservationRequest" ALTER COLUMN "groupIds" SET NOT NULL;
ALTER TABLE "PaymentIncident" ALTER COLUMN "affectedGroupIds" SET NOT NULL;

CREATE FUNCTION enrollment_uuid_set_valid(items uuid[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
  IF items IS NULL OR coalesce(array_ndims(items),1)<>1 THEN RETURN false; END IF;
  RETURN array_position(items,NULL) IS NULL AND items=ARRAY(SELECT DISTINCT x FROM unnest(items) x ORDER BY x);
END $$;

CREATE FUNCTION enrollment_schedule_valid(slots jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE slot jsonb;
BEGIN
  IF slots IS NULL OR jsonb_typeof(slots)<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(slots)=0 THEN RETURN false; END IF;
  FOR slot IN SELECT value FROM jsonb_array_elements(slots) LOOP
    IF jsonb_typeof(slot)<>'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(slot))<>3
      OR NOT (slot ?& ARRAY['dayOfWeek','startTime','endTime'])
      OR jsonb_typeof(slot->'dayOfWeek')<>'number'
      OR jsonb_typeof(slot->'startTime')<>'string' OR jsonb_typeof(slot->'endTime')<>'string'
      OR (slot->>'dayOfWeek') !~ '^[1-7]$'
      OR (slot->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (slot->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (slot->>'startTime') >= (slot->>'endTime') THEN RETURN false; END IF;
  END LOOP;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(slots) WITH ORDINALITY a(slot,n)
    JOIN jsonb_array_elements(slots) WITH ORDINALITY b(slot,n) ON a.n<b.n
    WHERE a.slot->>'dayOfWeek'=b.slot->>'dayOfWeek'
      AND a.slot->>'startTime'<b.slot->>'endTime' AND b.slot->>'startTime'<a.slot->>'endTime');
END $$;

ALTER TABLE "CoursePrice" ADD CONSTRAINT "CoursePrice_values_check"
  CHECK ("amountMinor">=0 AND currency='PEN' AND revision>0 AND isfinite("changedAt"));
ALTER TABLE "AdmissionSequence" ADD CONSTRAINT "AdmissionSequence_values_check" CHECK (id=1 AND "nextSequence">0);
ALTER TABLE "DispatchState" ADD CONSTRAINT "DispatchState_id_check" CHECK (id=1);
INSERT INTO "AdmissionSequence" (id,"nextSequence") VALUES (1,1);
INSERT INTO "DispatchState" (id) VALUES (1);

ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_values_check" CHECK (
  "admissionSequence">0 AND "authVersion">=0 AND octet_length("selectionDigest")=32
  AND cardinality("groupIds")>0 AND enrollment_uuid_set_valid("groupIds") AND isfinite("admittedAt")
  AND ((state='ADMITTED' AND "decidedAt" IS NULL AND "decisionCode" IS NULL)
    OR (state IN ('CONFIRMED','REJECTED') AND "decidedAt" IS NOT NULL AND isfinite("decidedAt")
      AND "decidedAt">="admittedAt" AND "decisionCode" IS NOT NULL AND btrim("decisionCode")<>'')));
ALTER TABLE "EnrollmentOrder" ADD CONSTRAINT "EnrollmentOrder_values_check" CHECK (
  currency='PEN' AND "totalMinor">=0 AND revision>0 AND isfinite("confirmedAt") AND isfinite("expiresAt")
  AND "expiresAt"-"confirmedAt"=interval '86400 seconds'
  AND ((state='EXPIRED' AND "expirationProcessedAt" IS NOT NULL AND isfinite("expirationProcessedAt") AND "expirationProcessedAt">="expiresAt")
    OR (state<>'EXPIRED' AND "expirationProcessedAt" IS NULL)));
CREATE UNIQUE INDEX "EnrollmentOrder_one_reserved_student_key" ON "EnrollmentOrder" ("studentId") WHERE state='RESERVED';

ALTER TABLE "EnrollmentOrderItem" ADD CONSTRAINT "EnrollmentOrderItem_values_check" CHECK (
  "priceMinor">=0 AND btrim("courseName")<>'' AND btrim("groupName")<>''
  AND "periodStart">=date '0001-01-01' AND "periodEnd"<=date '9999-12-31' AND "periodStart"<="periodEnd"
  AND "timeZone"='America/Lima' AND isfinite("groupStartAt") AND isfinite("enrollmentValidUntil")
  AND "groupStartAt"<"enrollmentValidUntil" AND enrollment_schedule_valid("scheduleSnapshot"));

ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_values_check" CHECK (
  octet_length("payloadDigest")=32 AND btrim("merchantReference")<>'' AND btrim("externalIdempotencyKey")<>''
  AND btrim("providerScope")<>'' AND isfinite("createdAt"));
CREATE UNIQUE INDEX "PaymentAttempt_one_unresolved_order_key" ON "PaymentAttempt" ("orderId")
  WHERE state IN ('SUBMITTING','PENDING','INITIATION_UNKNOWN');
ALTER TABLE "ProviderReceipt" ADD CONSTRAINT "ProviderReceipt_values_check" CHECK (
  btrim("providerScope")<>'' AND btrim("normalizedEvidenceReference")<>'' AND isfinite("receivedAt")
  AND ("externalObservedAt" IS NULL OR isfinite("externalObservedAt"))
  AND ((state='RECEIVED' AND "processedAt" IS NULL AND "terminalPaymentId" IS NULL)
    OR (state='PROCESSED' AND "processedAt" IS NOT NULL AND isfinite("processedAt") AND "processedAt">="receivedAt" AND "terminalPaymentId" IS NOT NULL)));
ALTER TABLE "VerifiedPayment" ADD CONSTRAINT "VerifiedPayment_values_check" CHECK (
  btrim("providerScope")<>'' AND btrim("providerPaymentId")<>'' AND btrim(currency)<>''
  AND btrim("merchantReference")<>'' AND btrim("normalizedEvidenceReference")<>'' AND isfinite("verificationFinishedAt")
  AND "amountUnits"::text NOT IN ('NaN','Infinity','-Infinity') AND "amountUnits"=trunc("amountUnits") AND "amountScale">=0
  AND ("reconciliationState"='INCIDENT' OR ("orderId" IS NOT NULL AND currency='PEN' AND "amountScale"=2 AND "amountUnits">=0)));

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_values_check" CHECK (
  "originalPeriodStart">=date '0001-01-01' AND "originalPeriodEnd"<=date '9999-12-31'
  AND "originalPeriodStart"<="originalPeriodEnd" AND "timeZone"='America/Lima'
  AND isfinite("confirmedAt") AND isfinite("validUntil") AND "confirmedAt"<"validUntil"
  AND enrollment_schedule_valid("scheduleSnapshot"));
ALTER TABLE "PaymentIncident" ADD CONSTRAINT "PaymentIncident_values_check" CHECK (
  btrim(reason)<>'' AND enrollment_uuid_set_valid("affectedGroupIds") AND isfinite("openedAt")
  AND ("orderId" IS NOT NULL OR cardinality("affectedGroupIds")=0));
ALTER TABLE "IncidentFollowUp" ADD CONSTRAINT "IncidentFollowUp_values_check" CHECK (btrim(content)<>'' AND isfinite("recordedAt"));
ALTER TABLE "EnrollmentCommand" ADD CONSTRAINT "EnrollmentCommand_values_check" CHECK (
  btrim("actorReference")<>'' AND btrim(operation)<>'' AND btrim("outcomeCode")<>'' AND octet_length("payloadDigest")=32
  AND jsonb_typeof("resourceReferences")='object' AND "resultingRevision">0 AND isfinite("appliedAt"));
ALTER TABLE "EnrollmentAuditEvent" ADD CONSTRAINT "EnrollmentAuditEvent_values_check" CHECK (
  btrim("actorReference")<>'' AND btrim(operation)<>'' AND btrim("targetKind")<>'' AND btrim(result)<>'' AND isfinite("occurredAt")
  AND ("beforeRevision" IS NULL OR "beforeRevision">0) AND ("afterRevision" IS NULL OR "afterRevision">0)
  AND ((operation='ORDER_EXPIRED' AND "actorKind"='SYSTEM' AND "targetKind"='ORDER'
      AND "effectKey" IS NOT NULL AND "effectKey"='ORDER_EXPIRED/'||"targetId"::text)
    OR (operation<>'ORDER_EXPIRED' AND "effectKey" IS NULL)));

-- Historial financiero y snapshots no se reescriben ni borran; no resolución económica.
CREATE FUNCTION enrollment_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historial de matrícula inmutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "EnrollmentOrderItem_history_guard" BEFORE UPDATE OR DELETE ON "EnrollmentOrderItem"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "Enrollment_history_guard" BEFORE UPDATE OR DELETE ON "Enrollment"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "VerifiedPayment_history_guard" BEFORE UPDATE OR DELETE ON "VerifiedPayment"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "PaymentIncident_history_guard" BEFORE UPDATE OR DELETE ON "PaymentIncident"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "IncidentFollowUp_history_guard" BEFORE UPDATE OR DELETE ON "IncidentFollowUp"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "EnrollmentCommand_history_guard" BEFORE UPDATE OR DELETE ON "EnrollmentCommand"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();
CREATE TRIGGER "EnrollmentAuditEvent_history_guard" BEFORE UPDATE OR DELETE ON "EnrollmentAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();

CREATE FUNCTION enrollment_preserve_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Orden inmutable' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW."studentId",NEW."requestId",NEW.currency,NEW."totalMinor",NEW."confirmedAt",NEW."expiresAt")
      IS DISTINCT FROM (OLD.id,OLD."studentId",OLD."requestId",OLD.currency,OLD."totalMinor",OLD."confirmedAt",OLD."expiresAt")
    OR (OLD.state<>'RESERVED' AND NEW.state IS DISTINCT FROM OLD.state)
    OR (OLD."expirationProcessedAt" IS NOT NULL AND NEW."expirationProcessedAt" IS DISTINCT FROM OLD."expirationProcessedAt") THEN
    RAISE EXCEPTION 'Identidad, plazo o terminal de orden inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "EnrollmentOrder_identity_guard" BEFORE UPDATE OR DELETE ON "EnrollmentOrder"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_order();

CREATE FUNCTION enrollment_preserve_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Solicitud inmutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','decisionCode','decidedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','decisionCode','decidedAt'])
    OR (OLD.state<>'ADMITTED' AND (NEW.state,NEW."decisionCode",NEW."decidedAt") IS DISTINCT FROM (OLD.state,OLD."decisionCode",OLD."decidedAt")) THEN
    RAISE EXCEPTION 'Identidad o resultado de solicitud inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ReservationRequest_identity_guard" BEFORE UPDATE OR DELETE ON "ReservationRequest"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_request();

CREATE FUNCTION enrollment_preserve_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reserva inmutable' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW."orderItemId") IS DISTINCT FROM (OLD.id,OLD."orderItemId") OR (OLD.state<>'CONFIRMED' AND NEW.state IS DISTINCT FROM OLD.state) THEN
    RAISE EXCEPTION 'Identidad o terminal de reserva inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SeatReservation_identity_guard" BEFORE UPDATE OR DELETE ON "SeatReservation"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_reservation();

CREATE FUNCTION enrollment_preserve_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Intento inmutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','providerReference']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','providerReference'])
    OR (OLD.state IN ('APPLIED','INCIDENT','FAILED_NO_CHARGE') AND (NEW.state,NEW."providerReference") IS DISTINCT FROM (OLD.state,OLD."providerReference")) THEN
    RAISE EXCEPTION 'Identidad o terminal de intento inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PaymentAttempt_identity_guard" BEFORE UPDATE OR DELETE ON "PaymentAttempt"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_attempt();

CREATE FUNCTION enrollment_preserve_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recibo inmutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','processedAt','terminalPaymentId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','processedAt','terminalPaymentId'])
    OR (OLD.state='PROCESSED' AND (NEW.state,NEW."processedAt",NEW."terminalPaymentId") IS DISTINCT FROM (OLD.state,OLD."processedAt",OLD."terminalPaymentId")) THEN
    RAISE EXCEPTION 'Evidencia o terminal de recibo inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProviderReceipt_identity_guard" BEFORE UPDATE OR DELETE ON "ProviderReceipt"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_receipt();

-- Solo coordinadoras iniciales. Cero precios, órdenes, pagos o matrículas de backfill.
-- Capacidad, D06, suma del total, legitimidad del pago y locks: transacciones futuras.

CREATE FUNCTION enrollment_preserve_coordinator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Coordinadora durable' USING ERRCODE='23514'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."nextSequence"<OLD."nextSequence" THEN
    RAISE EXCEPTION 'Secuencia de admision no retrocede' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AdmissionSequence_durable_guard" BEFORE UPDATE OR DELETE ON "AdmissionSequence"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_coordinator();
CREATE TRIGGER "DispatchState_durable_guard" BEFORE DELETE ON "DispatchState"
  FOR EACH ROW EXECUTE FUNCTION enrollment_preserve_history();

-- El campo nuevo respeta el retiro previo existente, sin tocar el trigger de 0005.
ALTER TABLE "AcademicGroup" ADD CONSTRAINT "AcademicGroup_description_check"
  CHECK (description IS NULL OR (description<>'' AND description=identity_trim(description)));
CREATE FUNCTION enrollment_guard_group_description() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='PUBLISHED' AND NEW.description IS DISTINCT FROM OLD.description THEN
    RAISE EXCEPTION 'Retirar grupo antes de editar descripcion' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AcademicGroup_description_guard" BEFORE UPDATE ON "AcademicGroup"
  FOR EACH ROW EXECUTE FUNCTION enrollment_guard_group_description();
COMMIT;
