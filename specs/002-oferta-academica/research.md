# Investigación técnica — oferta académica

**Fecha**: 2026-10-18. **Rama**: `feat/002-oferta-academica`.
**Entrada normativa**: [spec.md](spec.md), PA-01–PA-05 y constitución 1.1.0.
Investigación documental y lectura de código; no pruebas de producto, SQL ni migraciones ejecutadas.

## Incertidumbres investigadas y resueltas

| Incertidumbre técnica | Resolución |
| --- | --- |
| Cómo integrar permisos sin saltarse capas | R01: módulo academic-offering y permisos en autorización; composición en AppModule. |
| Cómo conservar la revisión tras recuperar habilitación | R02: generación docente propia, no authVersion. |
| Cómo consultar datos mínimos con una instantánea coherente | R03: proyección SQL pública propiedad de usuarios. |
| Cómo impedir publicaciones concurrentes incompatibles | R04: bloqueo de cuentas por docente y READ COMMITTED con nueva consulta tras esperar. |
| Cómo representar recurrencia semanal exactamente | R05: fecha civil, día ISO y minutos; intersección con ocurrencia efectiva. |
| Cómo evitar pérdida de edición y duplicados | R06: revisiones y commandId persistente. |
| Cómo migrar y verificar sin tocar cuentas actuales | R07: migración aditiva futura y proyectos/esquemas aislados. |
| Qué infraestructura y herramientas mantener | R08: stack fijado y Compose existentes; sin dependencias nuevas obligatorias. |

No quedan incógnitas técnicas bloqueantes dentro del alcance. D04, D06/matrícula,
D10/D13 y pendientes de identidad son dependencias delimitadas, no reglas resueltas aquí.

## R01 — Integración por capacidades existentes

**Decisión**: añadir `modules/academic-offering` con dominio, aplicación, infraestructura
y entradas HTTP. Consumir `authorization/public/session.ts` y
`users/public/teaching-directory.ts` (nuevo). Usar `ACCESS_POLICY` en controladores.
La raíz `apps/api/src/app.module.ts` conecta adaptadores y capacidades transaccionales.

**Evidencia local**: `Permission` hoy solo contiene `profile:read` y `users:manage`;
el guard niega operaciones sin política; el interceptor acepta la sesión antes de
entregar respuestas protegidas exitosas. `ops/lint/import-boundaries.mjs` prohíbe
imports de internos de otro módulo y dependencias externas en dominio/aplicación/public.

**Razón**: sesiones y privilegios siguen teniendo un único dueño; pertenencia académica
se comprueba en el caso de uso/proyección académica, no en el navegador.

**Alternativas consideradas**: copiar guardas de identidad; importar su SessionStore
desde un controlador académico; HTTP interno entre módulos. Se descartan por duplicación,
incumplimiento de capas o infraestructura innecesaria.

## R02 — Generación persistente de habilitación docente

**Decisión**: futura columna `User.teacherEligibilityVersion` bigint, inicial 0.
Un trigger de identidad la incrementa solo si pasa de
`role=TEACHER && status=ACTIVE && emailVerifiedAt!=null` a no cumplirlo.
Conserva la generación en reactivación, cambios de nombre, reset de contraseña y no-op.
La publicación de grupo guarda docente y generación; la visibilidad exige coincidencia
de ambos con la asignación/habilitación actuales. Un desajuste conserva la revisión
requerida aunque pérdida y recuperación sucedan sin ninguna consulta intermedia.

**Evidencia local**: `access-change-store.ts` bloquea la fila User y revoca sesiones;
`password-reset-store.ts` también aumenta authVersion. Por eso authVersion no representa
la regla académica aprobada. Los triggers ya forman parte de las migraciones de identidad.

**Razón**: preserva PA-03 sin hacer actualizaciones masivas de grupos desde identidad.
El trigger participa en la misma transacción que el cambio de acceso y cubre todos los
escritores ordinarios. Se conserva el estado editorial del grupo.

**Alternativas consideradas**: solo consultar estado/rol (republica al reactivar);
authVersion (oculta por reset de contraseña); evento asíncrono (ventana de exposición);
callback síncrono identidad→oferta (fanout y dependencia transaccional adicional).
La generación dedicada evita esas consecuencias. No añade `mustSetPassword` como
condición académica: las condiciones de usar una sesión permanecen en identidad.

**Límite**: el propietario que deshabilite triggers queda fuera de las garantías de
escritores ordinarios; runtime no recibirá privilegios para hacerlo.

## R03 — Directorio mínimo y consultas coherentes

**Decisión**: usuarios publica el contrato de lectura `AcademicTeacherDirectory`:
id, nombre, eligible y eligibilityVersion. Su adaptador mantiene una vista SQL ordinaria,
no materializada, en el esquema activo, sobre esos datos de User. Oferta puede unir
esa superficie pública con sus propias tablas en una sola sentencia.
La interfaz de aplicación no recibe PoolClient; las capacidades de locks con pg
pertenecen a infraestructura compartida y se inyectan desde composición.

**Razón**: evita mezclar una comprobación antigua de elegibilidad con otra consulta de
grupos, elimina N+1 y no entrega email/credenciales ni el UserView privado al alumno/docente.
Los filtros por audiencia se aplican antes de paginar o contar.

**Alternativas consideradas**: usar listado administrativo de cuentas (expone email y
filtros incorrectos); consultar directorio y grupos en conexiones distintas (instantáneas
incoherentes); transacción REPEATABLE READ para toda lectura (más locks/reintentos que
una sola proyección). Un puerto por lotes en la misma transacción sigue siendo válido,
pero no se combina arbitrariamente con conexiones diferentes.

## R04 — Serialización por docente y transacciones cortas

**Decisión**: READ COMMITTED, un PoolClient por transacción y bloqueo exclusivo de User
de actor/docentes relevantes en orden UUID. Después sesión, curso y grupos; la consulta
de conflictos es una sentencia posterior al lock. Reutilizar `accountTransaction` y la
capacidad existente `revalidateInTransaction`, con las precauciones de
[contracts/integration.md](contracts/integration.md).
El descubrimiento se repite dentro del callback de accountTransaction. Un cambio de
conjunto provoca rollback mediante señal privada transactionAborted=true y comparte
los mismos tres intentos máximos con abortos SQL; no se envuelve el helper en otro bucle.

**Evidencia local**: cambios de acceso usan SystemState → User ordenados → sesión,
y `accountTransaction` tiene lock_timeout de 3 s y reintentos acotados solo tras aborto
y rollback confirmados. Oferta no necesita bloquear SystemState: nunca lo adquiere
después de cuentas. La fila docente ya coordina con identidad.

**Fundamento externo**: PostgreSQL distingue bloqueos de fila y exige orden consistente
para evitar ciclos; READ COMMITTED obtiene una instantánea por sentencia. Esto sustenta
nuestro protocolo de esperar primero y consultar después.
[PostgreSQL 16: bloqueos](https://www.postgresql.org/docs/16/explicit-locking.html),
[aislamiento](https://www.postgresql.org/docs/16/transaction-iso.html).
Todas las sentencias usarán la misma conexión según
[node-postgres: transacciones](https://node-postgres.com/features/transactions).

**Alternativas consideradas**: bloquear solo grupos existentes (no protege conjunto vacío);
SERIALIZABLE global (más reintentos/cambio transversal); mutex SystemState para toda
oferta (serialización global); advisory locks (identidad tendría que adoptarlos también).
Se evita un lock global adicional.

**Inferencia de diseño**: con todas las escrituras académicas siguiendo el protocolo, la
segunda publicación del mismo docente consulta el commit de la primera y rechaza el
conflicto. Es una garantía que deberán demostrar pruebas PostgreSQL, no un resultado medido.

## R05 — Ocurrencias semanales sin expandir calendario

**Decisión**: fechas DATE, días ISO 1–7 y minutos de 00:00 a 23:59; intervalo horario
semiabierto [inicio, fin), pero periodo de fechas inclusivo. Siempre America/Lima.
Dos franjas tienen conflicto solo si comparten día, se intersectan sus horas y existe
una fecha efectiva común en la intersección de periodos. Fórmula en
[data-model.md](data-model.md).

**Razón**: evita falsos conflictos cuando las fechas coinciden pero no incluyen el
día semanal, y admite fin=otro inicio sin cruce de medianoche.

**Alternativas consideradas**: comparar solo fechas/horas (incorrecto); convertir desde
zona del navegador (desplaza el calendario); materializar todas las clases (amplía el
dominio); exclusión rectangular de rangos (no representa la ocurrencia semanal exacta).
Las exclusiones sobre intervalos concretos son posibles, pero exigirían otra
representación. [PostgreSQL 16: rangos](https://www.postgresql.org/docs/16/rangetypes.html).

## R06 — Revisiones e idempotencia sin nuevas cabeceras

**Decisión**: cada agregado tiene revision bigint, serializada como cadena decimal;
mutaciones sobre existente exigen `expectedRevision`. Todos los comandos llevan
`commandId` UUID. Un registro único por actor/commandId se confirma con la mutación
y auditoría. El replay se autoriza otra vez; no ejecuta efectos.

**Evidencia local**: `shared/api-client.ts` no admite cabeceras arbitrarias y
`app/http.ts` usa cuerpos JSON, catálogo de errores y filtros por ruta. Mantener ese
estilo evita añadir If-Match y su tratamiento de errores a identidad.

**Alternativas consideradas**: reenvío automático al iniciar sesión (prohibido);
confundir requestId del servidor con commandId (cambia en cada intento);
retener respuestas completas (guarda datos obsoletos/privados); solo UUID de entidad
(no cubre comandos de publicación). Revisión e identidad del comando resuelven problemas distintos.

## R07 — Migración y verificación futuras aisladas

**Decisión**: una migración aditiva posterior a las cuatro existentes, con columna/trigger,
vista mínima y tablas académicas. No editar migraciones aplicadas, no db push ni reset.
Esquemas de integración `t_<suite>_<random>` y proyecto Compose nuevo con configuración
nueva; [quickstart.md](quickstart.md) marca todos los pasos de ejecución como futuros.

**Evidencia local**: harness `apps/api/tests/support/test-environment.ts`;
`ops/docker/compose.regression.yml` retira puertos y usa APP_ENV=test.
`configure.mjs` escribe el .env del checkout donde reside: usar copia nueva.
`db:migrate:dev` es create-only y exige sombra no validada; no es prerrequisito para
redactar tareas. Procedimiento persistente en `ops/recovery/README.md`.

**Alternativas consideradas**: reutilizar BD/cuentas del ensayo manual; ejecutar pruebas
con .env original; hacer copia con git archive que omita 002 no versionado. Se descartan.

## R08 — Stack y límites

**Decisión**: mantener Node 22.23.1/npm 10.9.8 de imágenes y engines, TypeScript 6.0.3,
NestJS 12.1.0, Prisma 7.10.0 y pg, React 19/Vite 8, PostgreSQL 16.14, Vitest 5.0.2 y
Playwright 1.63.0 según manifests/lockfile existentes. Prisma describe/genera y versiona
migraciones; pg ejecuta transacciones con locks como en identidad. No actualizar paquetes,
añadir otro pool, Redis, cola, microservicios ni calendarios de clases.

**Razón**: capacidad de 1–50 es regla de negocio, no evidencia de capacidad del sistema.
Se medirán tiempos/errores como diagnóstico sin inventar umbrales de aceptación.
D10 conserva la rúbrica y capacidad; D13 la operación persistente; S/300 es total.

## Resultado

Investigación cerrada para diseñar. Tres agentes de investigación contrastaron identidad,
horarios/concurrencia y verificación/contratos, sin escribir código ni operar datos.
No se han cambiado PA-01–PA-05. Las referencias técnicas fundamentan decisiones;
no acreditan pruebas de implementación.
