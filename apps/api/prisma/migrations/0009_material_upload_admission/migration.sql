BEGIN;
-- Additive index for the actor's moving registration window. No data rewrite/purge.
CREATE INDEX "MaterialUpload_actorId_createdAt_idx" ON "MaterialUpload" ("actorId", "createdAt");
COMMIT;
