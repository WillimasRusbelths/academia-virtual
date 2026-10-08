BEGIN;
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- Mismo trim exterior Unicode que la política de entrada; sin transformar alias.
CREATE FUNCTION identity_trim(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT btrim($1, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') $$;

CREATE TABLE "User" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailCanonical" text NOT NULL,
  "role" "Role" NOT NULL,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "emailVerifiedAt" timestamptz,
  "passwordHash" text,
  "mustSetPassword" boolean NOT NULL DEFAULT false,
  "provisionalPasswordHash" text,
  "provisionalExpiresAt" timestamptz,
  "authVersion" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" timestamptz,
  CONSTRAINT "User_name_check" CHECK (char_length("name") BETWEEN 1 AND 100 AND "name" = identity_trim("name")),
  CONSTRAINT "User_email_check" CHECK (char_length("email") BETWEEN 3 AND 254
    AND "email" = identity_trim("email") AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT "User_canonical_check" CHECK ("emailCanonical" = lower(identity_trim("email"))),
  CONSTRAINT "User_version_check" CHECK ("authVersion" >= 0),
  CONSTRAINT "User_status_check" CHECK (("status" = 'DISABLED') = ("disabledAt" IS NOT NULL)),
  CONSTRAINT "User_password_check" CHECK ("mustSetPassword" OR "passwordHash" IS NOT NULL),
  CONSTRAINT "User_hash_check" CHECK (
    ("passwordHash" IS NULL OR "passwordHash" ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$')
    AND ("provisionalPasswordHash" IS NULL OR "provisionalPasswordHash" ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$')),
  CONSTRAINT "User_provisional_check" CHECK (
    ("provisionalPasswordHash" IS NULL) = ("provisionalExpiresAt" IS NULL)
    AND ("provisionalPasswordHash" IS NULL OR ("mustSetPassword" AND "provisionalExpiresAt" = "createdAt" + interval '24 hours'))
    AND ("mustSetPassword" OR ("provisionalPasswordHash" IS NULL AND "provisionalExpiresAt" IS NULL)))
);
CREATE UNIQUE INDEX "User_emailCanonical_key" ON "User" ("emailCanonical");

CREATE FUNCTION identity_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."updatedAt" := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER "User_updated_at" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION identity_touch_updated_at();
COMMIT;
