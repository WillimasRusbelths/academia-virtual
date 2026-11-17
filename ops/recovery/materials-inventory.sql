\set ON_ERROR_STOP on
SET search_path TO :"schema", pg_catalog;
SET TIME ZONE 'UTC';
-- Full hashes, never bytea, titles, descriptions, names, sessions or credentials in output.
WITH items AS (
  SELECT m.id,m."groupId",m."createdBy",m."updatedBy",m.state,m.revision::text AS revision,
    c."byteSize",c."mediaType",c.sha256 AS "storedSha256",encode(sha256(c.bytes),'hex') AS "bytesSha256",
    octet_length(c.bytes)=c."byteSize" AND encode(sha256(c.bytes),'hex')=c.sha256 AS valid,
    encode(sha256(convert_to(to_jsonb(m)::text || jsonb_build_object('downloadName',c."downloadName",
      'byteSize',c."byteSize",'mediaType',c."mediaType",'sha256',c.sha256)::text,'UTF8')),'hex') AS "metadataSha256"
  FROM "Material" m JOIN "MaterialContent" c ON c."materialId"=m.id
), durable AS (
  SELECT 'MaterialUpload' AS name,count(*) AS rows,
    encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex') AS sha256 FROM "MaterialUpload" t
  UNION ALL SELECT 'MaterialCommand',count(*),
    encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex') FROM "MaterialCommand" t
  UNION ALL SELECT 'MaterialAuditEvent',count(*),
    encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text,'UTF8')),'hex') FROM "MaterialAuditEvent" t
)
SELECT jsonb_build_object('format','materials-inventory-v1','schema',current_schema(),
  'materialCount',(SELECT count(*) FROM "Material"),'contentCount',(SELECT count(*) FROM "MaterialContent"),
  'byteCount',(SELECT COALESCE(sum("byteSize"),0) FROM items),
  'allContentHashesVerified',(SELECT COALESCE(bool_and(valid),true) FROM items),
  'items',(SELECT COALESCE(jsonb_agg(to_jsonb(i)-'valid' ORDER BY id),'[]') FROM items i),
  'durable',(SELECT jsonb_agg(to_jsonb(d) ORDER BY name) FROM durable d));
