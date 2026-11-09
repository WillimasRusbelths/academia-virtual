-- Diagnóstico de entrega incompatible sin modificar el hecho económico canónico.
ALTER TABLE "ProviderReceipt" ADD COLUMN "integrityConflict" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProviderReceipt" ADD CONSTRAINT "ProviderReceipt_integrity_check"
  CHECK (NOT "integrityConflict" OR state='PROCESSED');

CREATE OR REPLACE FUNCTION enrollment_preserve_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recibo inmutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','processedAt','terminalPaymentId','integrityConflict'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','processedAt','terminalPaymentId','integrityConflict'])
    OR (OLD.state='PROCESSED' AND (NEW.state,NEW."processedAt",NEW."terminalPaymentId",NEW."integrityConflict")
      IS DISTINCT FROM (OLD.state,OLD."processedAt",OLD."terminalPaymentId",OLD."integrityConflict")) THEN
    RAISE EXCEPTION 'Evidencia o terminal de recibo inmutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- La evidencia conserva su escala real, incluso si representa exactamente el
-- total PEN con una escala distinta de 2. La comparación exacta es del finalizador.
ALTER TABLE "VerifiedPayment" DROP CONSTRAINT "VerifiedPayment_values_check";
ALTER TABLE "VerifiedPayment" ADD CONSTRAINT "VerifiedPayment_values_check" CHECK (
  btrim("providerScope")<>'' AND btrim("providerPaymentId")<>'' AND btrim(currency)<>''
  AND btrim("merchantReference")<>'' AND btrim("normalizedEvidenceReference")<>'' AND isfinite("verificationFinishedAt")
  AND "amountUnits"::text NOT IN ('NaN','Infinity','-Infinity') AND "amountUnits"=trunc("amountUnits") AND "amountScale">=0
  AND ("reconciliationState"='INCIDENT' OR ("orderId" IS NOT NULL AND currency='PEN' AND "amountUnits">=0)));
