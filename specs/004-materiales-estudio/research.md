# Investigación técnica — fase 0

Fecha: 2026-11-16. Diseño, sin prototipo ni medición de capacidad. Se revisaron
código local, resultados del agente investigador de solo lectura y fuentes oficiales.

## R01 — Persistencia privada

**Decisión**: `MaterialContent.bytes` bytea en PostgreSQL; metadatos en tabla
separada, misma transacción de creación/resultado/auditoría. Prisma Bytes describe
esquema, pg parametrizado mueve Buffer. No base64 ni contenido en DTO JSON.
**Motivo**: simplifica atomicidad y recuperación conjunta con pool/dump existentes.
**Alternativas**: volumen privado necesita temporales, reconciliación de huérfanos
y backup coordinado; bucket añade servicio/costo/credenciales todavía no acordados.
**Costo**: RAM/copias del driver, WAL, red SQL y backup crecen; 20 MB de archivo no
equivale a 20 MB de memoria ni de tráfico. Medir D10 antes de ampliar escenario.

Fuentes: [PostgreSQL 16, binarios](https://www.postgresql.org/docs/16/datatype-binary.html)
y [node-postgres, parámetros Buffer](https://node-postgres.com/features/queries).
La elección es una inferencia para el MVP; esas fuentes no acreditan su capacidad.

## R02 — Upload separado de JSON

**Decisión**: POST JSON registra intención/metadatos; PUT exacto recibe un binario
application/octet-stream. Conservar JSON 16 KiB, Origin/CSRF/Sec-Fetch-Site; contar
bytes reales, rechazar compresión y abortar recepción tras plazo técnico inicial
60 s configurable. Reautorizar antes de leer y al confirmar; no locks durante red.
**Motivo**: `apps/api/src/http/transport.ts` rechaza hoy todo tipo no JSON en
escrituras. `tests/integration/http-security.spec.ts` comprueba rechazo multipart.
**Alternativas**: multipart requiere parser y límites de partes/campos; base64
infla contenido y promueve ampliar accidentalmente el límite de identidad/finanzas.

## R03 — Permisos y coordinación

**Decisión**: participantes públicos de oferta y matrícula ligados a la misma
conexión. Orden cuentas UUID → sesión → curso → grupo → material/intención. Lectores
SHARE, escritores UPDATE en recursos; recheck tras locks y un presupuesto de
accountTransaction, sin coordinadoras de pago/reserva. No locks mientras sube/baja
el archivo por red; decisión exacta define solicitud ya autorizada.
**Motivo**: coordinadores actuales ya ordenan cuentas antes de curso/grupo.
**Alternativas**: solo comprobar al abrir pantalla o transacciones independientes
de permiso y escritura dejan carreras con reasignación/revocación/cancelación.
Evidencia: `apps/api/src/infrastructure/database/academic-transaction.ts`,
`enrollment-transaction.ts`, y participantes públicos actuales de oferta.

## R04 — Validación de archivo

**Decisión**: longitud real, digest SHA-256 servidor, extensión y estructura
compatible; no solo MIME/cabecera. PDF con versión y terminación estructural,
JPEG con marcadores/final coherentes, PNG con chunks acotados/longitudes/CRC/IEND.
Corpus de archivos válidos y truncados por formato y transferencia interrumpida.
Nombre normalizado sin controles/separadores/CRLF; solo attachment y nosniff.
**Motivo**: FR-004/005 exige contenido compatible e íntegro, sin prometer antivirus.
**Alternativas**: extensión/MIME cliente no valida; renderizar archivos en servidor
añade visor/superficie fuera del alcance. No se añade librería ahora; si el corpus
revela necesidad de parser externo, revisar documentación y compatibilidad antes
de incorporarlo, sin rebajar los criterios de aceptación.

## R05 — Descarga, sesión y cliente

**Decisión**: envoltura binaria interna explícita que no pasa por JSON.stringify;
aceptación/revalidación de sesión antes del primer byte. Error anterior usa JSON
seguro; después de headers se cierra flujo, sin segundo cuerpo. Cliente dedicado
con same-origin, no-store, redirect error, AbortController y generación de sesión.
**Motivo**: `authorization/entrypoints/http/access.guard.ts` serializa resultados;
`http/error.filter.ts` escribe JSON; `apps/web/src/app/http.ts` espera envelope JSON.
**Alternativas**: enlaces públicos/firmados de larga vigencia no reautorizan cada
solicitud; Buffer serializado expone cuerpo y añade copias. Página oficial de Nest
consultada sobre streaming no respondió: no se trata como fuente verificada;
el diseño se apoya en código instalado y exige integración HTTP futura.

## R06 — Capacidad y recuperación

**Decisión**: inicialmente 2 transferencias binarias por proceso y 1 por actor;
exceso 503 global o 429 por actor antes de leer contenido. Liberar plazas al terminar,
fallar o abortar; no cola ilimitada. Medir RSS/driver/WAL/disco/backup y red antes
de persistencia demo; sin cuota agregada o eliminación automática nuevas.
**Motivo**: pg puede materializar archivo y copias; no hay evidencia de RAM constante.
`ops/recovery/backup.ps1` usa pg_dump de BD completa: extender ensayo para comparar
hashes/estados/permisos de archivos restaurados en destino separado.
**Alternativas**: buffers ilimitados o ampliar pool sin medición no son justificables;
reconsiderar almacenamiento solo con evidencia de D10/costo y operación D13.

## R07 — Vigencia e idempotencia

**Decisión**: instante exacto bigint de microsegundos, sin Date intermedio;
confirmedAt ≤ instante < validUntil original de 003. No exigir inicio de clases
adicional ni depender de oferta visible/docente habilitado para alumno vigente.
Intención/digest persistidos; replay reautoriza y no repite transición. UI conserva
textos en memoria y consulta resultado incierto antes de reintento manual.
**Motivo**: evitar extensiones accidentales, publicación involuntaria y respuesta
tardía de sesión anterior. Código local: consultas e instante del módulo enrollment.
**Alternativas**: reloj navegador, snapshots de catálogo o replay automático.

No quedan decisiones funcionales abiertas para tareas. D10/D13 siguen puertas
operativas; ninguna investigación acredita implementación, restore o aceptación.
