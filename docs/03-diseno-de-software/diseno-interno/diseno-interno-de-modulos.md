# Diseño interno de módulos

## Alcance y organización

Este documento detalla el incremento de identidad de Academia Virtual sobre el [catálogo de componentes](../../02-arquitectura-software/componentes-arquitectonicos.md). Mantiene el [monolito por capas organizado en módulos](../../02-arquitectura-software/estilo-arquitectonico.md) y [Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md). El servidor NestJS es una única aplicación; sus módulos no son servicios independientes. La web permanece separada y consume contratos HTTP, sin acceder a entidades Prisma o PostgreSQL.

El [plan de identidad](../../../specs/001-identidad-acceso-roles/plan.md) define los límites funcionales; el [modelo de datos](../../../specs/001-identidad-acceso-roles/data-model.md), el [contrato API](../../../specs/001-identidad-acceso-roles/contracts/api.md) y el [contrato UI](../../../specs/001-identidad-acceso-roles/contracts/ui.md) definen persistencia y entrada/salida. Las rutas funcionales descritas por esos contratos todavía no están implementadas. Los [requisitos generales](../../01-analisis-de-sistema/03-requisitos-funcionales.md) y las HU conservan su relación con los FR e historias detalladas US1–US7.

El diseño tiene **fundamentos implementados**, **colaboraciones parcialmente conectadas** y **flujos previstos**. Se usan nombres reales donde existe código; las responsabilidades futuras se describen sin atribuirles clases o métodos inexistentes. La existencia de un modelo SQL no completa el módulo ni su historia. Las [tareas](../../../specs/001-identidad-acceso-roles/tasks.md) y la [auditoría](../../../specs/001-identidad-acceso-roles/evidence/auditoria-seguimiento.md) respaldan T001–T023 verificadas; las historias y el resto de fundamentos permanecen pendientes.

| Responsabilidad interna | Organización y elementos existentes | Límite |
| --- | --- | --- |
| Presentación | Entradas HTTP, guard/interceptor, transporte, cookies, errores y salud | Adapta solicitudes y respuestas; los futuros controladores invocarán aplicación. No contiene reglas definitivas de altas, roles o consumo de enlaces ni consultas Prisma |
| Aplicación | Helpers de credenciales, `SessionLookup` y contratos pequeños del núcleo | Coordina reglas y capacidades inyectadas; no recibe Request/Response ni importa SQL, SMTP, NestJS o configuración |
| Dominio | Funciones y tipos puros de cuenta, acceso, permisos y límites | Evalúa datos y tiempo recibidos, sin entrada/salida. No depende de HTTP, NestJS, Prisma, PostgreSQL ni proveedores |
| Infraestructura | Adaptadores Argon2, sesiones/cuotas PostgreSQL, pool, configuración y migraciones | Implementa capacidades del núcleo y garantiza restricciones/transacciones. Correo, auditoría y persistencia de casos de uso siguen parcialmente previstos |

Estas responsabilidades se organizan dentro de cada módulo cuando son necesarias, no como cuatro módulos de negocio globales. En las tres capas del sistema, presentación contiene las entradas, lógica de negocio contiene aplicación/dominio y datos contiene adaptadores de persistencia. Infraestructura incluye además capacidades externas y criptografía, por lo que no se limita a la base de datos. Docker Compose configura la ejecución local y no pertenece al dominio.

## Cuentas y usuarios — C04

**Responsabilidad y límites.** `users` define reglas y tipos públicos de cuenta; su diseño funcional comprende perfil propio, listado, detalle y corrección de nombre. Según el plan, `identity` coordina altas públicas/administrativas, bootstrap y cambios de rol/estado que afectan al acceso. Una ruta bajo `/admin/users` no obliga a implementar toda su conducta en `users`. No se incorpora borrado de cuentas, cambio de correo, lectura de secretos ni un segundo rol.

Los elementos implementados están en [domain/account.ts](../../../apps/api/src/modules/users/domain/account.ts) y se exponen mediante [public/account.ts](../../../apps/api/src/modules/users/public/account.ts). Se usan funciones, no una clase de entidad impuesta por el documento.

| Elemento real | Entrada | Salida y operación | Estado |
| --- | --- | --- | --- |
| `Role`, `AccountStatus` | Valores de rol/estado | Tipos cerrados STUDENT/TEACHER/ADMIN y ACTIVE/DISABLED | Implementados |
| `normalizeName` | `unknown` | `string` con trim exterior y 1–100 caracteres Unicode; rechaza valores inválidos | Implementada |
| `normalizeEmail` | `unknown` | `{email, emailCanonical}`; validación hasta 254 caracteres y comparación canónica sin alterar alias | Implementada; coherencia Unicode con PostgreSQL probada |
| `validatePassword` | `unknown` | `string` de 12–128 caracteres Unicode, conservando espacios y contenido sin normalizar/truncar | Implementada |
| `requireRole`, `requireStatus` | `unknown` | Rol/estado válido o `AccountValidationError` | Implementadas |
| `AccountValidationError` | Campo inválido | Error tipado con `code = VALIDATION_ERROR`; transporte decide su respuesta HTTP | Implementado |

**Operaciones previstas.** `GET /me` devolverá `UserView` propio; consultas administrativas devolverán vistas sin secretos, listado paginado o detalle; `PATCH /admin/users/{id}/name` corregirá solo nombre con auditoría. `UserView` es el contrato `{id,name,email,role,status,emailVerified,mustSetPassword,createdAt}`: no incluye hashes, versión de autorización ni sesiones. Es un formato definido en el contrato, no una clase pública ya implementada. Las operaciones administrativas exigen ADMIN y revalidación transaccional.

**Colaboraciones y persistencia.** Identidad y autorización consumen tipos/reglas de la superficie pública de usuarios. Los futuros casos de uso de consultas/nombre consumirán autorización y contratos de persistencia/auditoría; `users` no invocará `identity` para alterar acceso. El modelo Prisma `User` y SQL de identidad ya están probados, pero no existe aún un repositorio de consultas/perfil ni controladores de usuarios conectados.

**Trazabilidad y estado.** RF01, RF05, RF06, RF08; FR-001, FR-002, FR-010–FR-020; HU01, HU04, HU05, HU07; US2–US5. T012/T017 respaldan modelo y reglas, según [datos](../../../specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md) y [reglas](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md). El módulo está parcialmente implementado; los flujos de perfil/administración siguen previstos.

## Identidad: credenciales y acciones — C03

**Responsabilidad y límites.** `identity` coordinará registro, verificación de correo, login/logout, establecimiento inicial, recuperación, bootstrap y cambios de acceso. Sus fundamentos actuales evalúan elegibilidad, vencimientos y credenciales sin crear cuentas ni sesiones mediante endpoints. Un resultado criptográfico válido no sustituye las condiciones actuales de cuenta.

### Dominio y contratos existentes

En [domain/access.ts](../../../apps/api/src/modules/identity/domain/access.ts), `AccountAccess`, `SessionAccess` y `ActionAccess` son datos internos para evaluar reglas, no entidades Prisma ni DTO HTTP. `TokenPurpose` distingue VERIFY_EMAIL y RESET_PASSWORD.

| Función real | Entrada/salida | Conducta |
| --- | --- | --- |
| `canAccessApplication` | `AccountAccess` → `boolean` | Cuenta ACTIVE, correo verificado válido, sin cambio inicial pendiente y con hash propio |
| `canUseSession` | Cuenta, sesión e instante → `boolean` | Elegibilidad, versión, revocación, 30 minutos de inactividad y 8 horas absolutas |
| `canUseProvisionalPassword` | Cuenta e instante → `boolean` | Cuenta activa con cambio inicial pendiente y provisional vigente |
| `provisionalExpiresAt`, `actionExpiresAt` | Fecha; propósito cuando corresponde → `Date` | Provisional/verificación 24 horas; recuperación 30 minutos |
| `canConsumeAction` | Cuenta, acción, propósito e instante → `boolean` | Propósito/correo coincidentes, cuenta habilitada, vencimiento y ausencia de consumo/revocación; reset exige correo verificado |

En [application/credentials.ts](../../../apps/api/src/modules/identity/application/credentials.ts), los contratos son `PasswordCredentials.hash(password): Promise<string>`, `verify(password, encodedHash): Promise<boolean>`, `AccessSecrets.issue(): {secret,digest}` y `digest(secret): Uint8Array | null`. El hash recibido por `verify` puede ser null para exigir trabajo ficticio sin admitir acceso.

`hashNewPassword(value, credentials)` valida y devuelve un hash; `verifyAccountCredential(account, value, credentials)` y `verifyProvisionalCredential(account, value, now, credentials)` devuelven booleanos tras validar y comprobar elegibilidad. Admiten cuenta null y mantienen trabajo de verificación equivalente. No crean sesiones, no alteran cuotas y no conocen códigos HTTP. `CredentialOverload` y `CredentialUnavailable` permiten comunicar fallos mediante errores tipados.

### Adaptadores y operaciones previstas

En [infrastructure/credentials.ts](../../../apps/api/src/modules/identity/infrastructure/credentials.ts), `createPasswordCredentials` implementa `PasswordCredentials` con Argon2id. `Argon2Engine` delimita la biblioteca para probar su comportamiento. `HashGate` es una clase privada del adaptador y limita dos operaciones simultáneas, cola FIFO de 50 y espera de 5 segundos. Los parámetros existentes son m=19456 KiB, t=2, p=1 y hash de 32 bytes; no se rebajan para una carga. `accessSecrets` genera 32 bytes aleatorios codificados en base64url y calcula huellas SHA-256 de los bytes; no se usa SHA-256 para contraseñas.

| Familia funcional prevista | Entrada y salida del contrato API | Coordinación requerida |
| --- | --- | --- |
| Registro y solicitudes de enlace | `/auth/register`: nombre/correo/contraseña; `/auth/verification/request` y `/auth/password/forgot`: correo; respuestas públicas 202 genéricas, con excepciones de cuota del contrato | Validación, cuotas equivalentes, unicidad y cuenta/token/entrega atómicos cuando corresponda; 202 no promete entrega |
| Verificación | `/auth/verification/confirm`: token; 204 válido o 400 INVALID_ACTION_LINK | Consumir solo VERIFY_EMAIL, marcar correo verificado; no crear sesión ni cambiar contraseña |
| Login/logout | `/auth/login`: correo/contraseña; 200 con UserView y cookie nueva; fallo genérico 401, límite 429. `/auth/logout`: cuerpo vacío y 204 idempotente | Reservar intento, verificar fuera de locks, revalidar cuenta/versión y crear sesión; logout revoca solo sesión actual |
| Inicial y recuperación | `/auth/password/initial`: correo/provisional/nueva contraseña; `/auth/password/reset`: token/nueva contraseña; 204 al completar | Sustituir credencial e invalidar el estado anterior según contrato, sin iniciar sesión; confirmación inválida no produce consumo o cambios |
| Altas y cambios administrativos | POST `/admin/users`, PUT de rol/estado: campos estrictos; UserView en éxito | Identidad coordina provisional, protección del último ADMIN y revocaciones; mismo rol es idempotente, reactivar no revive sesiones |
| Bootstrap | Entrada CLI restringida prevista, sin endpoint público | Reutilizar aplicación, bloquear SystemState y crear como máximo un primer ADMIN; activación exige verificación y cambio inicial |

Las rutas de esta tabla son relativas a `/api/v1` y **siguen previstas**. El caso de registro sin cuota conserva una nueva cuenta pendiente, no genera token/entrega y devuelve 429 genérico conforme al contrato; no se interpreta como rollback de toda alta. Las firmas de persistencia atómica y los casos de uso de estas familias aún deben implementarse según tareas, sin inventar aquí nombres de clases.

**Colaboraciones y persistencia.** Consume reglas públicas de `users`, límites persistidos y contratos de correo/auditoría. Cuenta, sesión, acción y entrega se conservan en PostgreSQL; hashing y SMTP quedan fuera de locks prolongados. El adaptador de identidad coordinará la transacción compartida, sin exponer Prisma a aplicación. La creación de cuenta/token/entrega no se reparte en commits independientes entre módulos.

**Trazabilidad y estado.** RF01–RF04, RF06, RF07; FR-001–FR-009, FR-014–FR-017, FR-024, FR-027–FR-033; HU01–HU03, HU05, HU06; US1, US2, US4, US6, US7. T017/T018 prueban dominio y credenciales; T012–T016 prueban modelos/migraciones. No existe `IdentityModule` Nest ensamblado, registro/login completo ni consumo operativo de enlaces. Fuentes: evidencias de datos/reglas, plan, contratos y tareas.

## Sesiones persistidas — fundamento de C03

**Responsabilidad y límites.** Resolver y revocar sesiones opacas, verificar cuenta/versión/vigencia en la BD primaria y actualizar actividad aceptada sin ampliar la expiración absoluta. La sesión no se autoriza exclusivamente desde memoria ni se sustituye por Bearer.

El contrato [SessionRepository](../../../apps/api/src/modules/authorization/public/session.ts) pertenece a la superficie pública de autorización. Lo implementa [PostgresSessionStore](../../../apps/api/src/modules/identity/infrastructure/session-store.ts), en infraestructura de identidad, usando el pool compartido.

| Operación real | Entrada | Salida y garantía |
| --- | --- | --- |
| `lookup` | Secreto opaco `string` | `Promise<SessionActor \| null>`; secreto inválido, cuenta no elegible o sesión vencida/revocada no produce actor |
| `accept` | `SessionActor` | `Promise<boolean>`; revalida bajo bloqueo y actualiza lastAcceptedAt con GREATEST, sin revivir sesión ni modificar vencimiento absoluto |
| `revoke` | Secreto `string` | `Promise<void>`; revocación idempotente, no crea sesión |
| `revalidateInTransaction` | `PoolClient`, actor y permiso | `Promise<void>` o error tipado; exige transacción abierta mediante savepoint y conserva locks de usuario/sesión hasta commit |

`SessionActor` contiene sessionId, userId, authVersion y role: es contexto interno, no UserView ni credencial que se envía al navegador. `lookup` calcula la huella y consulta User/Session con reloj de BD; errores de disponibilidad se traducen a `SessionStoreUnavailable`, no a acceso concedido.

**Colaboraciones y persistencia.** Autorización consume `SessionRepository`; composición conecta el adaptador. `revalidateInTransaction` es un helper adicional de infraestructura y **no** forma parte de ese contrato ni debe introducir `PoolClient` en aplicación. Las futuras mutaciones incorporarán la revalidación dentro de su persistencia atómica después de los locks de gobierno/usuarios ordenados cuando correspondan. Las transacciones internas del adaptador contemplan rollback y hasta dos reintentos por fallos transitorios. La creación de sesión, revocación conjunta de todas las sesiones y coordinación del login/reset aún requieren sus casos de uso.

**Trazabilidad y estado.** RF03, RF04, RF06, RF08; FR-007–FR-009, FR-015, FR-016, FR-018, FR-032; HU02, HU03, HU05, HU07. T021 y parte de T022 están comprobadas con PostgreSQL real en la [evidencia de sesiones](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md). Es un fundamento implementado, no evidencia del ciclo completo de login/logout ni de las historias administrativas.

## Autorización — C05

**Responsabilidad y límites.** Verificar sesión, rol actual y operación antes de consultar destinos; denegar por defecto. No decide existencia/propiedad de un perfil académico, matrícula ni acceso al video. Sus permisos actuales son `profile:read` y `users:manage`; el conjunto académico todavía no está definido.

| Elemento real y ubicación | Contrato/operación | Colaboración |
| --- | --- | --- |
| [domain/permissions.ts](../../../apps/api/src/modules/authorization/domain/permissions.ts): `Permission`, `permits` | Rol y permiso → booleano; perfil para los tres roles, gestión solo ADMIN; desconocido denegado | Consume `Role` público de users, sin IO |
| [application/session-lookup.ts](../../../apps/api/src/modules/authorization/application/session-lookup.ts): `SessionLookup`, `SESSION_LOOKUP` | `authorize(secret: string \| null, permission): Promise<SessionActor>`; `accepted(actor): Promise<void>` | Consume `SessionRepository`; usa `AuthorizationFailure` con AUTH_REQUIRED/FORBIDDEN |
| [entrypoints/http/access.guard.ts](../../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts): `Access`, `AccessGuard` | Metadato de permiso o public; `canActivate` resuelve cookie, autoriza e introduce actor interno en la solicitud | Adapta Nest/HTTP a aplicación; ausencia de metadato produce denegación |
| Mismo archivo: `AcceptedSessionInterceptor` | Solo una respuesta protegida 2xx y serializable solicita actualización de actividad | Invoca `SessionLookup.accepted`; errores, salud o resultados no serializables no renuevan sesión |
| [authorization.module.ts](../../../apps/api/src/modules/authorization/authorization.module.ts): `AuthorizationModule.forRoot` | Recibe `SessionRepository` y `SessionCookie`, registra guard/interceptor globales | No importa ni crea IdentityModule; recibe su adaptador desde composición |

**Persistencia y estado.** El núcleo no consulta SQL: utiliza el contrato que infraestructura implementa. Está ensamblado actualmente, aunque las operaciones protegidas funcionales siguen pendientes; las rutas de ensayo no están en AppModule. T022 y pruebas de T021/T023 acreditan denegación, permisos y carreras, sin cerrar V01–V16. Requisitos RF08, FR-018–FR-020; HU07, US5; fuentes: plan, código y evidencia de sesiones. DA01/DA09 y EQ-07/EQ-08 relacionan autorización de identidad con el acceso académico aún previsto.

## Límites y cuotas persistidas — C08

**Responsabilidad y límites.** Mantener decisiones entre solicitudes y conexiones, sin depender de que exista la cuenta. No realiza login, envía correo ni recibe callbacks de hashing/SMTP. La infraestructura común está en [infrastructure/limits/rate-store.ts](../../../apps/api/src/infrastructure/limits/rate-store.ts); las reglas permanecen en sus módulos de dominio.

| Elemento/operación real | Entrada y salida | Conducta |
| --- | --- | --- |
| [identity/domain/limits.ts](../../../apps/api/src/modules/identity/domain/limits.ts): `LoginEvent`, `LoginLimit`, `loginLimit` | Eventos, bloqueo e instante numérico → decisión con allowed, retryAfterSeconds y blockedUntil | Ventana de 15 min, cinco fallos y bloqueo de 15 min sin ampliación por intentos durante bloqueo; reserva de 30 s vencida cuenta como fallo |
| `failuresAfterSuccess` en el mismo archivo | Eventos → eventos sin FAILED | Conserva las reservas concurrentes |
| [mail/domain/delivery-policy.ts](../../../apps/api/src/modules/mail/domain/delivery-policy.ts): `MailLimitPhase`, `mailLimit` | Eventos de destinatario/origen e instante → allowed, retryAfterSeconds, nextAllowedAt | Fases ADMISSION/SMTP separadas; 1/min y 5/h por destinatario/propósito y 20/h por origen entre propósitos |
| `PostgresRateStore.reserveLogin` | Correo/origen de red → `Promise<LoginAdmission>` | Si admite, entrega reserva con bucketKey/eventId; si deniega, retryAfterSeconds |
| `PostgresRateStore.finishLogin` | `LoginReservation`, booleano de éxito → `Promise<boolean>` | Finaliza reserva vigente; éxito tardío rechazado; éxito limpia fallos sin borrar reservas concurrentes |
| `PostgresRateStore.admitMail` | Correo, propósito, origen, fase → decisión asíncrona de cuota | Admisión equivalente para conocidos/desconocidos; cuota SMTP futura no prolonga token |

**Colaboraciones y persistencia.** El adaptador consume normalización pública de users, políticas de identity/mail, pool y tablas RateBucket/RateEvent. Deriva claves HMAC con ámbitos/fases, sin persistir correo/IP en buckets; normaliza el origen de red. Ordena upsert/locks por clave y toma el reloj tras bloquear. Cada operación termina su transacción antes de devolver resultado; no la mantiene durante verificación criptográfica o envío. `RateStoreUnavailable` comunica fallo cerrado mediante error tipado.

**Trazabilidad y estado.** RF02–RF04; FR-022, FR-031; HU01–HU03; T019/T020, DA01/DA05/DA06 y EQ-03/EQ-11. El adaptador y las reglas están probados, incluida persistencia con conexiones nuevas y concurrencia, según evidencia de reglas. Su integración en login, solicitudes de enlace y worker permanece prevista; tampoco existe aún limpieza operativa completa de estos datos.

## Correo — C06

**Responsabilidad y límites.** Evaluar cuotas y ejecutar entregas persistidas fuera de HTTP. No modifica reglas de cuenta ni incorpora un proveedor de producción aprobado. `mail` no importa `identity`; la elegibilidad futura se obtiene mediante un contrato que composición conectará a un adaptador de identidad. La política `mailLimit` descrita anteriormente es el único código actual del módulo de correo.

**Diseño previsto por T024–T026.** Las tareas designan archivos aún inexistentes: `apps/api/src/modules/mail/application/delivery-ports.ts` para transporte/elegibilidad; `infrastructure/smtp-transport.ts` y `infrastructure/payload-cipher.ts` dentro de ese módulo para SMTP/cifrado; `application/deliver-pending.ts`, `infrastructure/delivery-store.ts` y `infrastructure/delivery-scheduler.ts` para coordinación y ejecución. También prevén `apps/api/src/modules/identity/infrastructure/delivery-eligibility.ts`. Son destinos de diseño, no enlaces a archivos existentes ni nombres de clases implementadas.

| Operación prevista | Entrada/salida conceptual según plan/modelo | Responsabilidad y límite |
| --- | --- | --- |
| Programar entrega | Token/propósito, destinatario y payload protegido → entrega persistida o resultado de cuota | Cuenta/token/entrega se confirman en la transacción coordinada por identidad; HTTP no afirma envío exitoso |
| Reclamar y procesar | Entregas vigentes disponibles → claims, intentos y estado actualizado | Consulta cada 5 s, hasta dos entregas, SKIP LOCKED, lease de 60 s con claimId; envío fuera de transacción |
| Reintentar/cancelar | Clasificación de fallo, elegibilidad, cuota y vencimiento → reintento pospuesto o estado terminal | Timeout SMTP de 20 s, tres intentos totales, +60/+300 s ante fallo transitorio; no gastar intento sin contactar transporte ni prolongar token |
| Cifrar/limpiar payload | Contenido de enlace y keyId → ciphertext/nonce/tag; terminal → eliminación del payload | AES-256-GCM, clave externa a BD/repositorio, sin contraseñas; borrar al finalizar/cancelar/expirar |

**Persistencia y adaptadores.** MailDelivery/ActionToken ya tienen esquema y restricciones probadas. Mailpit es destino local de captura y la salida SMTP real requiere proveedor/configuración; Nodemailer instalado y una prueba crypto-mail no equivalen al adaptador funcional. Un reinicio debe recuperar leases vencidos; una entrega SMTP duplicada puede ocurrir, pero el enlace debe consumirse una sola vez. El consumo único requiere el futuro caso de uso de identidad.

**Trazabilidad y estado.** RF02, RF04; FR-023, FR-029–FR-033; HU01, HU03, HU05, HU06; R07–R09, DA06/DA08 y EQ-11. T015/T019/T020 respaldan modelo/cuotas; T023 acredita salud independiente de Mailpit. Contratos, cifrado, worker y pruebas funcionales siguen pendientes T024–T026; V13 no está aprobado. Fuentes: modelo, tareas, plan y evidencias de datos/reglas/sesiones.

## Auditoría y registros de seguridad — C07

**Responsabilidad y límites.** Registrar cambios aceptados con actor/destino existentes y resultado, sin secretos. Denegaciones y comandos operativos tienen registros privados separados; no se crean cuentas ficticias para visitantes/operadores. No existe endpoint de auditoría ni se devuelve información de logging al cliente.

**Elementos y operaciones previstos.** T027 identifica `apps/api/src/modules/audit/domain/audit-event.ts`, `apps/api/src/modules/audit/infrastructure/audit-writer.ts` y `apps/api/src/infrastructure/logging/security-events.ts`, todavía sin código. El contrato de un evento se rige por las listas permitidas del modelo U1; este documento no inventa una clase o firma para esos archivos.

| Tipo de registro | Entrada/salida conceptual | Persistencia y efecto ante fallo |
| --- | --- | --- |
| Cambio de cuenta aceptado | Actor, cuenta destino, acción, instante y resultado permitidos → AuditEvent | Escritura en el mismo commit que la mutación; si falla, revierte el cambio |
| Denegación o fallo operativo | Contexto privado permitido y referencia solicitada → registro estructurado seguro | Sin FK ni consulta adicional de existencia; su fallo no cambia el 401/403 público |
| Bootstrap/invalidación global | Contexto LOCAL_OPERATOR con operatorRef, evento SYSTEM_BOOTSTRAP o destino IDENTITY_SCOPE según operación | Alias operativo, sin usuario ficticio ni AuditEvent global de cuenta inexistente; marca de bootstrap en SystemState |

**Colaboraciones.** Identity y los futuros casos de uso de users producen eventos; audit no los invoca de vuelta. La infraestructura coordina persistencia atómica. El filtro HTTP actual protege mensajes/logs de transporte, pero no sustituye audit-writer ni los registros estructurados previstos.

**Trazabilidad y estado.** RF09, RF07, RF19; FR-025–FR-028, FR-033; HU05–HU07; T014/T027/T028 y DA01/DA08. AuditEvent/SystemState y sus restricciones están probados; el módulo operativo y los flujos siguen previstos. Fuentes: [modelo U1](../../../specs/001-identidad-acceso-roles/data-model.md), tareas, evidencia de datos y sesiones. V12/V16 permanecen pendientes de aceptación completa.

## Presentación, persistencia común y composición actual

| Elemento real | Función y contrato | Límite/estado |
| --- | --- | --- |
| [http/transport.ts](../../../apps/api/src/http/transport.ts): `configureTransport`, `strictDto` | Configura JSON de 16 KiB, origen/CSRF y respuestas; valida forma y campos mediante schema de funciones | Implementados como controles de transporte; no controladores de historias |
| [http/session-cookie.ts](../../../apps/api/src/http/session-cookie.ts): `SessionCookie` | Lee, emite y elimina cookie según entorno con atributos del contrato | Implementado/probado; no genera sesión por sí mismo |
| [http/error.filter.ts](../../../apps/api/src/http/error.filter.ts): `SafeErrorFilter`, `TransportFailure` | Traduce errores tipados a respuestas seguras y correlación propia | No expone cuerpos, secretos o detalles internos; no es auditoría funcional |
| [http/health.controller.ts](../../../apps/api/src/http/health.controller.ts): `HealthController`, `Readiness` | Ofrece `/health/live` y `/health/ready`; recibe comprobación de BD | Implementado; salud no es actividad de sesión ni SLA de producción |
| [infrastructure/database/database.ts](../../../apps/api/src/infrastructure/database/database.ts): `createDatabase` | Ofrece pool, cliente Prisma y close con ciclo de vida compartido | Implementado, sin reglas de cuenta. Adaptadores de negocio usan conexiones/transacciones, no otro pool por módulo |
| [infrastructure/config/environment.ts](../../../apps/api/src/infrastructure/config/environment.ts): `Environment`, `loadEnvironment` | Selección explícita de entorno y validación de BD, claves, SMTP, origen/proxy | Implementado; dominio no lee process.env y ejemplos no contienen secretos |
| [app.module.ts](../../../apps/api/src/app.module.ts): `AppModule.forRoot` y [main.ts](../../../apps/api/src/main.ts) | Crea PostgresSessionStore/SessionCookie, importa AuthorizationModule, registra salud/readiness y cierre de BD; arranque configura transporte | Composición actual comprobada. No importa ProbeModule, IdentityModule ni controladores de negocio aún inexistentes |

El [schema Prisma](../../../apps/api/prisma/schema.prisma) contiene User, Session, ActionToken, AuditEvent, SystemState, MailDelivery, RateBucket y RateEvent. Cuatro migraciones SQL versionadas mantienen CHECKs, índices, FKs y restricciones que el esquema no expresa por completo. Las pruebas aplican deploy en BD/esquemas aislados y verifican datos incrementales/rollback; no demuestran restauración integral ni migración funcional de producción. `db:migrate:dev` requiere una base sombra preparada y validada; ese flujo no está comprobado.

El contrato normativo exige cookies HttpOnly/SameSite=Lax/Path=/ sin Domain: `av_session_dev` para localhost HTTP y `__Host-av_session` con Secure para HTTPS; Max-Age de 28800 al emitir, sin extenderlo. Origin exacto y cabecera `X-CSRF-Protection: 1` protegen mutaciones; no se admite Bearer alternativo. Los controles compartidos están probados, pero el login y los endpoints que emitirían esas cookies siguen previstos.

## Dependencias del código y colaboración en ejecución

La dirección de dependencias es **presentación → aplicación → dominio**, e **infraestructura → contratos/tipos del núcleo**. La composición conoce implementaciones y las inyecta; la aplicación recibe sus contratos. Las superficies `users/public/account.ts` y `authorization/public/session.ts` delimitan colaboración existente sin consumir archivos internos ajenos. No se introduce una llamada inversa de users a identity ni una importación de IdentityModule desde authorization.

En ejecución, `AccessGuard` adapta cookie/permiso y llama a `SessionLookup.authorize`. SessionLookup llama a `SessionRepository.lookup`; el objeto inyectado es PostgresSessionStore, que utiliza pool y reglas de dominio para devolver actor o ausencia. SessionLookup no importa pg ni SQL aunque la llamada termine accediendo a PostgreSQL. El interceptor solicita actividad aceptada después de un resultado protegido satisfactorio. Una mutación futura debe, además, revalidar actor/invariantes en su transacción: el guard no garantiza por sí solo que los permisos sigan vigentes al confirmar.

Los helpers de credenciales reciben `PasswordCredentials`; el adaptador concreto importa Argon2 y devuelve el resultado mediante ese contrato. HashGate solo limita recursos criptográficos, no conserva sesiones o cuotas de cuenta. Del mismo modo, el ejecutor de correo previsto consumirá transporte y elegibilidad mediante contratos; mail no importará identity y la raíz de composición conectará el adaptador correspondiente.

La CLI operativa prevista reutiliza casos de uso en una ejecución transitoria fuera del proceso HTTP, sin otro servidor ni acceso privilegiado público. Bootstrap, protección del último administrador y recuperación segura todavía requieren sus tareas. Los registros de éxito deben compartir commit con cambios; hashing/SMTP no se realizan bajo locks prolongados. Estas colaboraciones previstas no se presentan como imports o interfaces ya implementados.

## Síntesis de módulos académicos previstos

El [alcance del MVP](../../alcance-mvp.md) y el catálogo respaldan estas responsabilidades; no existen especificaciones equivalentes al detalle de identidad para sus clases, operaciones o reglas. Las interfaces se precisarán en sus incrementos.

| Componentes del catálogo | Diseño previsto y colaboración necesaria | Requisitos/historias y pendientes |
| --- | --- | --- |
| C12 · Oferta académica | Cursos, grupos, horarios y cupos; permisos y persistencia propios, colaboración pública con órdenes/matrículas | RF10; HU08/HU09; D04/D06/D12 |
| C13 · Órdenes | Detalle y total confiables en servidor; consumir oferta/precios y coordinar cobro sin duplicar orquestación | RF11; HU10/HU11; D01–D06 |
| C14 · Pagos e integración Izipay | Verificar proveedor/orden/importe/moneda mediante adaptador sustituible; idempotencia y coordinación transaccional | RF12/RF13; HU11; D02 y políticas D01–D06; sin integración |
| C15 · Matrículas y asignación de cupos | Activación tras pago comprobado, restricciones contra duplicados/sobreventa y capacidad de vigencia académica | RF13; HU11 y soporte HU12/HU15/HU16; estados/reservas/vigencia D01–D06 |
| C16 · Materiales | Publicación/acceso autorizados; metadatos separados de archivos y contrato de almacenamiento por definir | RF14/RF15; HU12/HU13; D03/D12 |
| C17 · Clases en vivo | Coordinar clase y permisos; YouTube Live con OBS es la elección vigente, no un módulo del dominio | RF16; HU14/HU15; DEC01, D07/D08; acceso directo y permisos vencidos por validar |
| C18 · Chat de clase | Mensajes/reconexiones aislados por clase; gateway y contrato por definir, Socket.IO propuesto | RF17; HU16; no persistencia de mensajes ni eventos nuevos aprobados |
| C19 · Paneles básicos | Consumir capacidades públicas autorizadas de otros módulos; no consultar sus internos ni inventar métricas | RF18; HU17; mínimos D12; separado del inicio mínimo de identidad |

No se atribuyen clases, métodos, tablas académicas ni integración implementada a estas responsabilidades. Matrícula, chat y video tienen cargas distintas; los 1000 concurrentes continúan pendientes según los [escenarios de calidad](../../01-analisis-de-sistema/08-escenarios-atributos-calidad.md). Disponibilidad de producción, respaldo/restauración y acceso al video tampoco se deducen del entorno Docker validado.

## Evidencia del estado

| Diseño respaldado | Evidencia disponible | Límite |
| --- | --- | --- |
| Configuración, ocho modelos, restricciones, migraciones y pool | [T011–T016](../../../specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md), complementadas por migración 0004 en el siguiente bloque | No prueba historias ni restauración V16 |
| Reglas puras, Argon2/secretos y límites persistidos | [T017–T020](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md) | No login completo ni comparación temporal HTTP T087 |
| Sesiones, autorización ensamblada y transporte | [T021–T023](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md) | Rutas protegidas de ensayo, no administración/perfil/UI completos |
| Worker/cifrado, auditoría operativa, bootstrap y flujos | Plan, modelo, contratos y tareas pendientes | Diseño previsto, sin evidencia de implementación completa |

Los informes conservan los resultados de sus ejecuciones. Esta documentación no registra una nueva ejecución de pruebas ni cierra criterios funcionales adicionales. La [estrategia de verificación](../../../specs/001-identidad-acceso-roles/verification.md) mantiene los V, carga y aceptación por completar conforme se integren las historias.
