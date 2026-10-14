# Diseño interno de módulos

## Alcance y organización

Este documento detalla el incremento de identidad de Academia Virtual sobre el [catálogo de componentes](../../02-arquitectura-software/componentes-arquitectonicos.md). Mantiene el [monolito por capas organizado en módulos](../../02-arquitectura-software/estilo-arquitectonico.md) y [Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md). El servidor NestJS es una única aplicación; sus módulos no son servicios independientes. La web permanece separada y consume contratos HTTP, sin acceder a entidades Prisma o PostgreSQL.

El [plan de identidad](../../../specs/001-identidad-acceso-roles/plan.md), [modelo](../../../specs/001-identidad-acceso-roles/data-model.md) y contratos [API](../../../specs/001-identidad-acceso-roles/contracts/api.md)/[UI](../../../specs/001-identidad-acceso-roles/contracts/ui.md) delimitan responsabilidades. Hasta T058 están comprobados acceso/cierre/consulta propia (US1), registro/verificación/reenvío (US2) y primer administrador/cambio inicial (US6). Administración, recuperación y demás historias permanecen pendientes; se conserva la relación HU/RF/FR.

Se distingue **fundamento implementado**, **checkpoint funcional comprobado** y **diseño pendiente**. Los [checkpoints US1](../../../specs/001-identidad-acceso-roles/evidence/us1.md), [US2](../../../specs/001-identidad-acceso-roles/evidence/us2.md) y [US6](../../../specs/001-identidad-acceso-roles/evidence/us6.md) respaldan los flujos actuales; no completan identidad ni las verificaciones finales. Las rutas y nombres siguientes proceden del código, sin deducir funcionalidades de carpetas o modelos.

| Responsabilidad interna | Organización y elementos existentes | Límite |
| --- | --- | --- |
| Presentación | Controladores REST de identidad/consulta propia, guard/interceptor, transporte, cookies, errores y salud | Invoca casos de uso; no implementa reglas de cuenta, enlaces o permisos ni consultas PostgreSQL |
| Aplicación | Casos de uso de acceso, registro, verificación, bootstrap y cambio inicial; contratos del núcleo | Coordina reglas/capacidades; no recibe Request/Response ni importa SQL, SMTP, NestJS o configuración |
| Dominio | Funciones y tipos puros de cuenta, acceso, permisos y límites | Evalúa datos y tiempo recibidos, sin entrada/salida. No depende de HTTP, NestJS, Prisma, PostgreSQL ni proveedores |
| Infraestructura | Argon2, persistencia de casos de uso/sesiones/cuotas/entregas, SMTP/cifrado, auditoría, pool y configuración | Implementa contratos y transacciones; administración, recuperación y purga integral pendientes |

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

**Operaciones actuales y previstas.** `GET /me` devuelve la identidad propia mediante [GetMe](../../../apps/api/src/modules/users/application/get-me.ts), [MeController](../../../apps/api/src/modules/users/entrypoints/http/me.controller.ts) y [PostgresUserQueries](../../../apps/api/src/modules/users/infrastructure/user-queries.ts). [UserView/userView](../../../apps/api/src/modules/users/public/user-view.ts) proyecta campos explícitos sin hashes, versión ni sesiones. Listado/detalle administrativos y corrección de nombre auditada siguen previstos en US4; la pantalla autónoma de perfil y aceptación US3 no están completas.

**Colaboraciones y persistencia.** Identidad y autorización consumen la superficie pública de usuarios; UsersModule ensambla consulta propia por UserQueries y pool compartido. Los cambios administrativos consumirán autorización, persistencia y auditoría transaccionales; users no invoca identity para alterar acceso.

**Trazabilidad y estado.** RF01, RF05, RF06, RF08; FR-001/002/010–020; HU01/HU04/HU05/HU07; US2–US5. Reglas y modelo implementados; consulta propia comprobada en US1. C04 permanece parcial por US3 y administración pendientes.

## Identidad: credenciales y acciones — C03

**Responsabilidad y límites.** `identity` coordina registro, verificación/reenvío, login/logout, establecimiento inicial y bootstrap. Recuperación y cambios administrativos de acceso permanecen previstos. La verificación criptográfica no sustituye la elegibilidad/revalidación de cuenta en PostgreSQL.

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

### Adaptadores y operaciones actuales o previstas

En [infrastructure/credentials.ts](../../../apps/api/src/modules/identity/infrastructure/credentials.ts), `createPasswordCredentials` implementa `PasswordCredentials` con Argon2id. `Argon2Engine` delimita la biblioteca para probar su comportamiento. `HashGate` es una clase privada del adaptador y limita dos operaciones simultáneas, cola FIFO de 50 y espera de 5 segundos. Los parámetros existentes son m=19456 KiB, t=2, p=1 y hash de 32 bytes; no se rebajan para una carga. `accessSecrets` genera 32 bytes aleatorios codificados en base64url y calcula huellas SHA-256 de los bytes; no se usa SHA-256 para contraseñas.

| Familia funcional y estado | Entrada y salida del contrato API | Coordinación |
| --- | --- | --- |
| Registro/reenvío: comprobados US2; forgot pendiente US7 | `/auth/register`: nombre/correo/contraseña; `/auth/verification/request`: correo; 202 genérico o 429 según cuota | RegisterStudent, RequestVerification e IssueActionLink coordinan cuotas y cuenta/token/entrega atómicos; 202 no promete entrega |
| Verificación: comprobada US2/US6 | `/auth/verification/confirm`: token; 204 o 400 genérico | VerifyEmail consume solo VERIFY_EMAIL y marca correo, sin contraseña ni sesión |
| Login/logout: comprobados US1 | `/auth/login`: correo/contraseña; 200 UserView/cookie, 401 genérico o 429. `/auth/logout`: cuerpo vacío, 204 idempotente | Login y Logout reutilizan credenciales/sesiones/cuotas; hash fuera de locks y revalidación antes de crear sesión |
| Inicial: comprobada US6; reset pendiente US7 | `/auth/password/initial`: correo/provisional/nueva; 204 sin sesión ni verificación implícita. `/auth/password/reset` aún no disponible | SetInitialPassword revalida estado/hash/versión/vigencia y sustituye credencial atómicamente; reset sigue previsto |
| Altas y cambios administrativos | POST `/admin/users`, PUT de rol/estado: campos estrictos; UserView en éxito | Identidad coordina provisional, protección del último ADMIN y revocaciones; mismo rol es idempotente, reactivar no revive sesiones |
| Bootstrap: comprobado US6 | `admin:bootstrap`, diálogo CLI local; resultado ID/correo o error seguro, sin endpoint público | BootstrapAdmin prepara hash/enlace antes del lock; PostgresBootstrapStore confirma cuenta/auditoría/token/entrega según cuota y marca irreversible |

Las rutas HTTP son relativas a `/api/v1`. [IdentityModule](../../../apps/api/src/modules/identity/identity.module.ts) ensambla los casos actuales. Sus adaptadores son [PostgresLoginStore](../../../apps/api/src/modules/identity/infrastructure/login-store.ts), [PostgresRegistrationStore](../../../apps/api/src/modules/identity/infrastructure/registration-store.ts), [PostgresActionTokenStore](../../../apps/api/src/modules/identity/infrastructure/action-token-store.ts), [PostgresVerificationStore](../../../apps/api/src/modules/identity/infrastructure/verification-store.ts) y [PostgresInitialPasswordStore](../../../apps/api/src/modules/identity/infrastructure/initial-password-store.ts), con contratos de aplicación. Registro sin cuota conserva la cuenta pendiente, sin token/entrega, y devuelve 429; no se interpreta como rollback de toda alta.

**Colaboraciones y persistencia.** Consume reglas públicas de users, contratos de cuotas y payload de correo. Los adaptadores coordinan cuenta/sesión/token/entrega en PostgreSQL; hashing y SMTP quedan fuera de locks prolongados. Aplicación no recibe PoolClient ni Prisma. [SetInitialPassword](../../../apps/api/src/modules/identity/application/set-initial-password.ts) reutiliza reglas puras y cambia hash propio, provisional, mustSetPassword y authVersion en un commit.

**Trazabilidad y estado.** RF01–RF04/RF06/RF07; FR-001–009/014–017/024/027–033; HU01–HU03/HU05/HU06; US1/US2/US4/US6/US7. C03 parcial: fundamentos y checkpoints US1/US2/US6 comprobados; US4, US7 y aceptación transversal pendientes.

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

**Colaboraciones y persistencia.** Autorización consume SessionRepository y composición conecta PostgresSessionStore. `revalidateInTransaction` permanece en infraestructura; las mutaciones administrativas futuras deben incorporarlo a su transacción. La creación de sesión de login y revocación actual de logout están implementadas; la revocación global por reset o gestión de cuentas sigue pendiente.

**Trazabilidad y estado.** RF03/RF04/RF06/RF08; FR-007–009/015/016/018/032; HU02/HU03/HU05/HU07. Fundamento T021 y ciclo funcional de login/logout/recarga comprobados en US1. Revocación administrativa/reset y verificación final de expiración durante escrituras largas siguen pendientes.

## Autorización — C05

**Responsabilidad y límites.** Verificar sesión, rol actual y operación antes de consultar destinos; denegar por defecto. No decide existencia/propiedad de un perfil académico, matrícula ni acceso al video. Sus permisos actuales son `profile:read` y `users:manage`; el conjunto académico todavía no está definido.

| Elemento real y ubicación | Contrato/operación | Colaboración |
| --- | --- | --- |
| [domain/permissions.ts](../../../apps/api/src/modules/authorization/domain/permissions.ts): `Permission`, `permits` | Rol y permiso → booleano; perfil para los tres roles, gestión solo ADMIN; desconocido denegado | Consume `Role` público de users, sin IO |
| [application/session-lookup.ts](../../../apps/api/src/modules/authorization/application/session-lookup.ts): `SessionLookup`, `SESSION_LOOKUP` | `authorize(secret: string \| null, permission): Promise<SessionActor>`; `accepted(actor): Promise<void>` | Consume `SessionRepository`; usa `AuthorizationFailure` con AUTH_REQUIRED/FORBIDDEN |
| [entrypoints/http/access.guard.ts](../../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts): `Access`, `AccessGuard` | Metadato de permiso o public; `canActivate` resuelve cookie, autoriza e introduce actor interno en la solicitud | Adapta Nest/HTTP a aplicación; ausencia de metadato produce denegación |
| Mismo archivo: `AcceptedSessionInterceptor` | Solo una respuesta protegida 2xx y serializable solicita actualización de actividad | Invoca `SessionLookup.accepted`; errores, salud o resultados no serializables no renuevan sesión |
| [authorization.module.ts](../../../apps/api/src/modules/authorization/authorization.module.ts): `AuthorizationModule.forRoot` | Recibe `SessionRepository` y `SessionCookie`, registra guard/interceptor globales | No importa ni crea IdentityModule; recibe su adaptador desde composición |

**Persistencia y estado.** El núcleo usa SessionRepository, sin SQL. Guard/interceptor y /me están conectados y comprobados en US1; las rutas de ensayo no están en AppModule. Gestión administrativa, US5 transversal y permisos académicos siguen pendientes. RF08, FR-018–020, HU07/US5; DA01/DA09 y EQ-07/EQ-08 conservan su trazabilidad.

## Límites y cuotas persistidas — C08

**Responsabilidad y límites.** Mantener decisiones entre solicitudes y conexiones, sin depender de que exista la cuenta. No realiza login, envía correo ni recibe callbacks de hashing/SMTP. La infraestructura común está en [infrastructure/limits/rate-store.ts](../../../apps/api/src/infrastructure/limits/rate-store.ts); las reglas permanecen en sus módulos de dominio.

| Elemento/operación real | Entrada y salida | Conducta |
| --- | --- | --- |
| [identity/domain/limits.ts](../../../apps/api/src/modules/identity/domain/limits.ts): `LoginEvent`, `LoginLimit`, `loginLimit` | Eventos, bloqueo e instante numérico → decisión con allowed, retryAfterSeconds y blockedUntil | Ventana de 15 min, cinco fallos y bloqueo de 15 min sin ampliación por intentos durante bloqueo; reserva de 30 s vencida cuenta como fallo |
| `failuresAfterSuccess` en el mismo archivo | Eventos → eventos sin FAILED | Conserva las reservas concurrentes |
| [mail/domain/delivery-policy.ts](../../../apps/api/src/modules/mail/domain/delivery-policy.ts): `MailLimitPhase`, `mailLimit` | Eventos de destinatario/origen e instante → allowed, retryAfterSeconds, nextAllowedAt | Fases ADMISSION/SMTP separadas; 1/min y 5/h por destinatario/propósito y 20/h por origen entre propósitos |
| `PostgresRateStore.reserveLogin` | Correo/origen de red → `Promise<LoginAdmission>` | Si admite, entrega reserva con bucketKey/eventId; si deniega, retryAfterSeconds |
| `PostgresRateStore.finishLogin` | `LoginReservation`, booleano de éxito → `Promise<boolean>` | Finaliza reserva vigente; éxito tardío rechazado; éxito limpia fallos sin borrar reservas concurrentes |
| `PostgresRateStore.admitMail` | Correo, propósito, origen y fase → decisión asíncrona | Admisión pública equivalente y cuota SMTP utilizadas por flujos/ejecutor; no prolongan token |

**Colaboraciones y persistencia.** El adaptador consume normalización pública de users, políticas de identity/mail, pool y tablas RateBucket/RateEvent. Deriva claves HMAC con ámbitos/fases, sin persistir correo/IP en buckets; normaliza el origen de red. Ordena upsert/locks por clave y toma el reloj tras bloquear. Cada operación termina su transacción antes de devolver resultado; no la mantiene durante verificación criptográfica o envío. `RateStoreUnavailable` comunica fallo cerrado mediante error tipado.

**Trazabilidad y estado.** RF02–RF04; FR-022/031; HU01–HU03; DA01/DA05/DA06 y EQ-03/EQ-11. Reglas/adaptador T019/T020 integrados en login/inicial, registro/reenvío, bootstrap y correo. Checkpoints US1/US2/US6 comprobados; limpieza integral T095 y recuperación US7 pendientes.

## Correo — C06

**Responsabilidad y límites.** Procesar entregas persistidas fuera de HTTP. Mail no importa identity; [DeliveryEligibility](../../../apps/api/src/modules/mail/public/delivery.ts) es su contrato público y composición conecta el adaptador de identidad. SMTP local está comprobado; producción sigue pendiente.

**Elementos implementados T024–T026.** [delivery-ports.ts](../../../apps/api/src/modules/mail/application/delivery-ports.ts) define Mailer/PayloadCipher; [createSmtpTransport](../../../apps/api/src/modules/mail/infrastructure/smtp-transport.ts) y [createPayloadCipher](../../../apps/api/src/modules/mail/infrastructure/payload-cipher.ts) devuelven objetos adaptadores. [DeliverPending](../../../apps/api/src/modules/mail/application/deliver-pending.ts) coordina [PostgresDeliveryStore](../../../apps/api/src/modules/mail/infrastructure/delivery-store.ts), elegibilidad, cifrado y SMTP; [DeliveryScheduler](../../../apps/api/src/modules/mail/infrastructure/delivery-scheduler.ts) ejecuta sus ciclos dentro del mismo proceso.

| Operación existente | Entrada/salida | Responsabilidad y límite |
| --- | --- | --- |
| Programar entrega | Token/propósito, destinatario y payload protegido → entrega persistida o resultado de cuota | Cuenta/token/entrega se confirman en la transacción coordinada por identidad; HTTP no afirma envío exitoso |
| Reclamar y procesar | Entregas vigentes disponibles → claims, intentos y estado actualizado | Consulta cada 5 s, hasta dos entregas, SKIP LOCKED, lease de 60 s con claimId; envío fuera de transacción |
| Reintentar/cancelar | Clasificación de fallo, elegibilidad, cuota y vencimiento → reintento pospuesto o estado terminal | Timeout SMTP de 20 s, tres intentos totales, +60/+300 s ante fallo transitorio; no gastar intento sin contactar transporte ni prolongar token |
| Cifrar/limpiar payload | Contenido de enlace y keyId → ciphertext/nonce/tag; terminal → eliminación del payload | AES-256-GCM, clave externa a BD/repositorio, sin contraseñas; borrar al finalizar/cancelar/expirar |

**Persistencia y adaptadores.** ActionToken/MailDelivery y claims están en PostgreSQL. [PostgresDeliveryEligibility](../../../apps/api/src/modules/identity/infrastructure/delivery-eligibility.ts) comprueba cuenta/token por el contrato de mail. El ejecutor recupera leases vencidos; aceptación SMTP y confirmación en BD son pasos distintos y pueden producir duplicados tras una interrupción. El consumo único de VERIFY_EMAIL está comprobado en US2; RESET_PASSWORD tiene fundamentos, pero su flujo sigue pendiente.

**Trazabilidad y estado.** RF02/RF04; FR-023/029–033; HU01/HU03/HU05/HU06; R07–R09, DA06/DA08 y EQ-11. [Adaptadores T024](../../../specs/001-identidad-acceso-roles/evidence/adaptadores-correo.md) y [ejecutor T025–T026](../../../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md) comprobados; captura funcional US2/US6. C06 parcial: recuperación US7, purga T095, SMTP de producción y V13 completo pendientes.

## Auditoría y registros de seguridad — C07

**Responsabilidad y límites.** Registrar cambios aceptados con actor/destino existentes y resultado, sin secretos. Denegaciones y comandos operativos tienen registros privados separados; no se crean cuentas ficticias para visitantes/operadores. No existe endpoint de auditoría ni se devuelve información de logging al cliente.

**Elementos implementados.** [auditEvent/AuditEvent](../../../apps/api/src/modules/audit/domain/audit-event.ts) validan datos del modelo U1; [PostgresAuditWriter.write(client, input)](../../../apps/api/src/modules/audit/infrastructure/audit-writer.ts) escribe dentro de la transacción de la mutación. [SecurityEvents.record(input, correlationId)](../../../apps/api/src/infrastructure/logging/security-events.ts) registra listas cerradas en archivos privados, con rotación de hasta 30 días.

| Tipo de registro | Entrada/salida conceptual | Persistencia y efecto ante fallo |
| --- | --- | --- |
| Cambio de cuenta aceptado | Actor, cuenta destino, acción, instante y resultado permitidos → AuditEvent | Escritura en el mismo commit que la mutación; si falla, revierte el cambio |
| Denegación o fallo operativo | Contexto privado permitido y referencia solicitada → registro estructurado seguro | Sin FK ni consulta adicional de existencia; su fallo no cambia el 401/403 público |
| Bootstrap actual / invalidación global prevista | LOCAL_OPERATOR con operatorRef y correlación; SYSTEM_BOOTSTRAP en cuenta creada | Bootstrap comparte marca/auditoría en el commit; invalidación tras restaurar espera T096, sin cuentas ficticias ni AuditEvent global |

**Colaboraciones.** Bootstrap usa el writer en la misma transacción; CLI, filtro HTTP y ejecutor registran contexto privado sin secretos. Los cambios administrativos futuros deberán compartir commit/auditoría; tener acciones NAME_CHANGED/ROLE_CHANGED/STATUS_CHANGED en el fundamento no implica sus flujos operativos.

**Trazabilidad y estado.** RF09/RF07/RF19; FR-025–028/033; HU05–HU07; DA01/DA08. [T027](../../../specs/001-identidad-acceso-roles/evidence/auditoria-privacidad.md) comprueba listas, persistencia y fallos; US6 comprueba correlación LOCAL_OPERATOR/SYSTEM_BOOTSTRAP. C07 parcial por administración, purga y V12/V16 completos pendientes.

## Presentación, persistencia común y composición actual

| Elemento real | Función y contrato | Límite/estado |
| --- | --- | --- |
| [http/transport.ts](../../../apps/api/src/http/transport.ts): configureTransport, strictDto | JSON de 16 KiB, origen/CSRF y validación de forma/campos | Controles implementados y reutilizados por rutas actuales |
| [http/session-cookie.ts](../../../apps/api/src/http/session-cookie.ts): `SessionCookie` | Lee, emite y elimina cookie según entorno con atributos del contrato | Implementado/probado; no genera sesión por sí mismo |
| [http/error.filter.ts](../../../apps/api/src/http/error.filter.ts): `SafeErrorFilter`, `TransportFailure` | Traduce errores tipados a respuestas seguras y correlación propia | No expone cuerpos, secretos o detalles internos; no es auditoría funcional |
| [http/health.controller.ts](../../../apps/api/src/http/health.controller.ts): `HealthController`, `Readiness` | Ofrece `/health/live` y `/health/ready`; recibe comprobación de BD | Implementado; salud no es actividad de sesión ni SLA de producción |
| [infrastructure/database/database.ts](../../../apps/api/src/infrastructure/database/database.ts): `createDatabase` | Ofrece pool, cliente Prisma y close con ciclo de vida compartido | Implementado, sin reglas de cuenta. Adaptadores de negocio usan conexiones/transacciones, no otro pool por módulo |
| [infrastructure/config/environment.ts](../../../apps/api/src/infrastructure/config/environment.ts): `Environment`, `loadEnvironment` | Selección explícita de entorno y validación de BD, claves, SMTP, origen/proxy | Implementado; dominio no lee process.env y ejemplos no contienen secretos |
| [app.module.ts](../../../apps/api/src/app.module.ts): AppModule.forRoot y [main.ts](../../../apps/api/src/main.ts) | Ensambla IdentityModule, UsersModule, AuthorizationModule, salud/readiness, DeliverPending/DeliveryScheduler y registros privados | Composición US1/US2/US6 comprobada; no importa ProbeModule ni módulos académicos |

El [schema Prisma](../../../apps/api/prisma/schema.prisma) contiene User, Session, ActionToken, AuditEvent, SystemState, MailDelivery, RateBucket y RateEvent. Cuatro migraciones SQL versionadas mantienen CHECKs, índices, FKs y restricciones que el esquema no expresa por completo. Las pruebas aplican deploy en BD/esquemas aislados y verifican datos incrementales/rollback; no demuestran restauración integral ni migración funcional de producción. `db:migrate:dev` requiere una base sombra preparada y validada; ese flujo no está comprobado.

El contrato exige cookies HttpOnly/SameSite=Lax/Path=/ sin Domain: `av_session_dev` local y `__Host-av_session` con Secure en HTTPS, Max-Age 28800 sin extensión. Origin exacto y `X-CSRF-Protection: 1` protegen mutaciones, sin Bearer alternativo. Emisión/borrado y rutas de login/logout están comprobados en US1; esto no acredita despliegue público HTTPS.

## Dependencias del código y colaboración en ejecución

La dirección de dependencias es **presentación → aplicación → dominio**, e **infraestructura → contratos/tipos del núcleo**. La composición conoce implementaciones y las inyecta; la aplicación recibe sus contratos. Las superficies `users/public/account.ts` y `authorization/public/session.ts` delimitan colaboración existente sin consumir archivos internos ajenos. No se introduce una llamada inversa de users a identity ni una importación de IdentityModule desde authorization.

En ejecución, `AccessGuard` adapta cookie/permiso y llama a `SessionLookup.authorize`. SessionLookup llama a `SessionRepository.lookup`; el objeto inyectado es PostgresSessionStore, que utiliza pool y reglas de dominio para devolver actor o ausencia. SessionLookup no importa pg ni SQL aunque la llamada termine accediendo a PostgreSQL. El interceptor solicita actividad aceptada después de un resultado protegido satisfactorio. Una mutación futura debe, además, revalidar actor/invariantes en su transacción: el guard no garantiza por sí solo que los permisos sigan vigentes al confirmar.

Los helpers y casos de uso reciben PasswordCredentials, LoginStore/LoginLimits, VerificationStore o InitialPasswordStore. Infraestructura implementa sus operaciones y la composición conecta objetos concretos. DeliverPending recibe Mailer, PayloadCipher, DeliveryEligibility y DeliveryStore; mail no importa identity, aunque el adaptador de elegibilidad pertenezca a identidad. Son dependencias del código, distintas de las llamadas al ejecutarlas.

La [CLI de bootstrap](../../../apps/api/src/cli/bootstrap-admin.ts) ejecuta BootstrapAdmin fuera del proceso HTTP, reutilizando contratos/adaptadores sin otro servidor. [PostgresBootstrapStore](../../../apps/api/src/modules/identity/infrastructure/bootstrap-store.ts) confirma cuenta, auditoría, marca y verificación según cuota, sin hash/SMTP bajo lock. Protección del último ADMIN y recuperación operativa siguen pendientes; procedimiento: [primer administrador](../../../ops/local/first-admin.md).

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
| Reglas puras, Argon2/secretos y cuotas | [T017–T020](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md), integradas en los checkpoints | Comparación temporal HTTP T087 y purga integral pendientes |
| Sesiones, autorización y transporte | [T021–T023](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md) y [US1](../../../specs/001-identidad-acceso-roles/evidence/us1.md) | No completa administración, US3/US5 ni expiración durante escrituras largas |
| Correo, auditoría, bootstrap y flujos | [T024](../../../specs/001-identidad-acceso-roles/evidence/adaptadores-correo.md), [T025–T026](../../../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md), [T027](../../../specs/001-identidad-acceso-roles/evidence/auditoria-privacidad.md), [US2](../../../specs/001-identidad-acceso-roles/evidence/us2.md) y [US6](../../../specs/001-identidad-acceso-roles/evidence/us6.md) | Checkpoints comprobados; administración, recuperación y verificaciones finales pendientes |

Los informes conservan los resultados de sus ejecuciones. Esta documentación no registra una nueva ejecución de pruebas ni cierra criterios funcionales adicionales. La [estrategia de verificación](../../../specs/001-identidad-acceso-roles/verification.md) mantiene los V, carga y aceptación por completar conforme se integren las historias.
