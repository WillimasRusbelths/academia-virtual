BEGIN;
-- PHC admite los mismos parámetros en diferente orden. No cambiar hashes existentes.
CREATE FUNCTION identity_is_argon2id(value text) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT value ~ '^\$argon2id\$v=19\$(m|t|p)=[0-9]+,(m|t|p)=[0-9]+,(m|t|p)=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
    AND split_part(value, '$', 4) ~ '(^|,)m=[0-9]+(,|$)'
    AND split_part(value, '$', 4) ~ '(^|,)t=[0-9]+(,|$)'
    AND split_part(value, '$', 4) ~ '(^|,)p=[0-9]+(,|$)'
$$;
ALTER TABLE "User" DROP CONSTRAINT "User_hash_check";
ALTER TABLE "User" ADD CONSTRAINT "User_hash_check" CHECK (
  ("passwordHash" IS NULL OR identity_is_argon2id("passwordHash"))
  AND ("provisionalPasswordHash" IS NULL OR identity_is_argon2id("provisionalPasswordHash"))
);
COMMIT;
