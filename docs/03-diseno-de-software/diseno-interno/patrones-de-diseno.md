# Patrones de diseño

Los patrones descritos se identifican por las colaboraciones del código y por el diseño explícito del [plan de identidad](../../../specs/001-identidad-acceso-roles/plan.md). Complementan el [diseño interno de módulos](diseno-interno-de-modulos.md) sin introducir nuevas decisiones. El backend conserva el estilo monolito por capas y Clean Architecture como enfoque para sus dependencias internas.

Se distingue Adaptador, patrón estructural, de la entrega diferida transaccional, patrón de integración. Estados contrastados hasta T058: **implementado** en el alcance delimitado, **parcial** si quedan funciones pendientes y **previsto** sin implementación funcional. Los checkpoints US1/US2/US6 no equivalen a identidad completa.

## Resumen

| Patrón | Aplicación en el proyecto | Estado | Trazabilidad principal |
| --- | --- | --- | --- |
| Adaptador (Adapter) | Credenciales/secretos mediante Argon2 y criptografía Node | Implementado; utilizado en US1/US2/US6 | RF01, RF03; FR-006, FR-026; R04, R07; DA01, DA07 |
| Adaptador (Adapter) | SessionRepository mediante PostgreSQL | Implementado; login/logout y autorización comprobados en US1 | RF03, RF08; FR-007–FR-009, FR-018–FR-020; R02, R05, R07; DA01, DA07 |
| Adaptador (Adapter) | Transporte, cifrado y elegibilidad de correo; Izipay futuro | Correo implementado localmente; producción y pagos previstos | RF02, RF04, RF12; FR-029–FR-031; R07, D02; DA02, DA06, DA07 |
| Entrega diferida transaccional (Transactional Outbox) | Token/entrega atómicos y ejecutor interno | Implementada en verificación US2/US6; reset y purga integral pendientes | RF02, RF04; FR-029–FR-031; R08; DA06, DA08 |

Los RF generales se consultan en los [requisitos del sistema](../../01-analisis-de-sistema/03-requisitos-funcionales.md); los FR detallados, en la [especificación de identidad](../../../specs/001-identidad-acceso-roles/spec.md). R04, R07, R08 y D02 conservan sus identificadores en las [decisiones arquitectónicas](../../01-analisis-de-sistema/07-decisiones-arquitectonicas.md); DA identifica los [drivers](../../01-analisis-de-sistema/06-driver-arquitectonicos.md).

## Adaptador: credenciales y secretos

**Problema y justificación.** Las reglas de identidad necesitan verificar contraseñas y manejar secretos sin conocer la biblioteca criptográfica ni sus formatos de llamada. El adaptador ofrece el contrato del núcleo y traduce operaciones, resultados y fallos de la tecnología utilizada. Esta traducción concreta, y no la sola existencia de una interfaz, fundamenta la identificación del patrón.

| Participante | Elemento real y responsabilidad |
| --- | --- |
| Contratos consumidos | `PasswordCredentials` y `AccessSecrets`, en [identity/application/credentials.ts](../../../apps/api/src/modules/identity/application/credentials.ts) |
| Consumidores de contraseñas | `hashNewPassword`, `verifyAccountCredential` y `verifyProvisionalCredential`, en el mismo archivo; aplican validación y elegibilidad antes de usar el contrato |
| Adaptador de contraseñas | `createPasswordCredentials`, en [identity/infrastructure/credentials.ts](../../../apps/api/src/modules/identity/infrastructure/credentials.ts), devuelve un objeto con operaciones `hash` y `verify`; no requiere una clase |
| Tecnología adaptada | `Argon2Engine` y `nativeEngine`, en infraestructura; encapsulan la biblioteca Argon2 con los parámetros aceptados |
| Adaptador de secretos | `accessSecrets`, en infraestructura; implementa emisión aleatoria, representación base64url y huella SHA-256 mediante `node:crypto` |

**Funcionamiento.** El contrato `PasswordCredentials.verify(password, encodedHash)` recibe un hash o `null`; el motor utiliza `verify(encodedHash, password)`. El adaptador ajusta el orden, comprueba el formato y ejecuta trabajo ficticio ante hash ausente o no utilizable, devolviendo rechazo. Convierte fallos del motor en `CredentialUnavailable`; `HashGate` controla la concurrencia y puede producir `CredentialOverload`. Los helpers de aplicación reciben el contrato sin importar Argon2. `accessSecrets.issue` devuelve secreto y huella; `digest` devuelve la huella o `null` si la representación es inválida. El almacenamiento de sesiones reutiliza esta última operación.

**Requisitos y decisiones.** RF01/RF03 y FR-006/FR-026 motivan la protección de credenciales; R04 fija Argon2id y sus límites. R07 respalda el aislamiento de la tecnología y R01 las dependencias hacia el núcleo. DA01 y DA07 relacionan seguridad y mantenibilidad.

**Estado y evidencia.** Fundamento T018 comprobado en [credenciales y límites](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md), integrado en los checkpoints [US1](../../../specs/001-identidad-acceso-roles/evidence/us1.md), [US2](../../../specs/001-identidad-acceso-roles/evidence/us2.md) y [US6](../../../specs/001-identidad-acceso-roles/evidence/us6.md). Recuperación y administración siguen pendientes.

**Límites y costos.** El contrato no elimina el costo de Argon2 ni sustituye los controles de cuenta. El límite de cómputo es por proceso; no es una cuota persistida por usuario. La posibilidad de inyectar un motor de ensayo permite probar saturación, pero no implica selección de algoritmos alternativos en producción ni justifica llamar Strategy a esta interfaz. La equivalencia de trabajo criptográfico no demuestra ausencia de canales temporales en el flujo HTTP completo.

## Adaptador: sesiones y persistencia

**Problema y justificación.** Authorization necesita consultar acceso vigente sin importar SQL, `pg` o la infraestructura interna de identity. El adaptador convierte las consultas y actualizaciones de PostgreSQL en las operaciones y tipos del contrato público de autorización. Mantiene la coordinación independiente del motor de persistencia y evita una dependencia circular entre módulos.

| Participante | Elemento real y responsabilidad |
| --- | --- |
| Contrato objetivo | `SessionRepository`, en [authorization/public/session.ts](../../../apps/api/src/modules/authorization/public/session.ts); define `lookup`, `accept` y `revoke` |
| Consumidor | `SessionLookup`, en [authorization/application/session-lookup.ts](../../../apps/api/src/modules/authorization/application/session-lookup.ts); coordina consulta, permiso y actividad aceptada |
| Adaptador | `PostgresSessionStore`, en [identity/infrastructure/session-store.ts](../../../apps/api/src/modules/identity/infrastructure/session-store.ts); implementa el contrato con consultas, transacciones y conversión de datos |
| Recursos adaptados | Tablas User/Session y pool compartido de [database.ts](../../../apps/api/src/infrastructure/database/database.ts); la conexión no contiene reglas de negocio |
| Ensamblaje | [AppModule.forRoot](../../../apps/api/src/app.module.ts) construye el adaptador con el pool; [AuthorizationModule.forRoot](../../../apps/api/src/modules/authorization/authorization.module.ts) lo entrega a SessionLookup y registra guard/interceptor |

**Funcionamiento.** `lookup` transforma el secreto en huella, consulta sesión/cuenta, convierte fechas y versiones y aplica elegibilidad antes de devolver `SessionActor` o ausencia. `accept` revalida bajo bloqueo y actualiza actividad sin ampliar la caducidad absoluta; `revoke` persiste una revocación idempotente. Los fallos de almacenamiento se traducen a `SessionStoreUnavailable`. El consumidor utiliza el contrato; en ejecución la llamada llega al adaptador, pero SessionLookup no importa su implementación.

`revalidateInTransaction` es una operación adicional del adaptador que recibe `PoolClient` para futuras mutaciones atómicas. No forma parte de SessionRepository y no constituye una interfaz de aplicación independiente de PostgreSQL. El diseño mantiene esta coordinación técnica dentro de infraestructura.

**Requisitos y decisiones.** RF03/RF08 y FR-007–FR-009/FR-018–FR-020 requieren caducidad, revocación y autorización vigentes. R02/R05 respaldan persistencia y revalidación transaccional; R01/R07 respaldan el contrato y adaptador. Se relaciona con DA01 y DA07.

**Estado y evidencia.** Fundamento T021/T022 comprobado en [sesiones/autorización](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md) e integrado en login/logout y /me del checkpoint US1. La revocación por administración/reset y aceptación transversal no están completas.

**Límites y costos.** Cada operación depende de la base primaria y añade consultas; un contrato pequeño no elimina esa dependencia operativa. Las futuras mutaciones deben revalidar dentro de su transacción y no apoyarse solo en el guard.

El nombre **SessionRepository** no basta para afirmar Repository como colección de entidades o agregados: ofrece acceso/actividad y proyección de actor. Se mantiene como puerto específico y adaptador. [PostgresRateStore](../../../apps/api/src/infrastructure/limits/rate-store.ts) ofrece cuotas, compatible con LoginLimits/ActionLinkLimits, sin colección de agregados; PrismaClient y el pool son herramientas de datos. No se añaden Repository ni repositorios CRUD genéricos por la sola existencia de SQL o interfaces.

## Adaptadores de correo implementados y pagos previstos

**Problema y justificación.** Identidad no depende de Nodemailer; mail obtiene elegibilidad sin importar internos de identity. Contratos y adaptadores de correo implementan esa separación R07. Izipay conserva su diseño previsto D02 y no está integrado.

| Límite | Participantes y funcionamiento | Estado y fuente |
| --- | --- | --- |
| Transporte de correo | DeliverPending consume Mailer.send; [createSmtpTransport](../../../apps/api/src/modules/mail/infrastructure/smtp-transport.ts) adapta payload/fallos a Nodemailer/SMTP | Implementado T024; captura local comprobada en US2/US6, producción pendiente |
| Cifrado del contenido pendiente | PayloadCipher.encrypt/decrypt; [createPayloadCipher](../../../apps/api/src/modules/mail/infrastructure/payload-cipher.ts) adapta AES-256-GCM con claves externas a BD | Implementado T024; comprobación de integridad y errores seguros |
| Elegibilidad de entrega | [DeliveryEligibility.check](../../../apps/api/src/modules/mail/public/delivery.ts) y [PostgresDeliveryEligibility](../../../apps/api/src/modules/identity/infrastructure/delivery-eligibility.ts) traducen cuenta/token a ELIGIBLE/EXPIRED/OBSOLETE | Implementado; composición conecta identity con el contrato público de mail sin llamada inversa |
| Pagos | El módulo de pagos adaptará mensajes de Izipay a sus capacidades internas; órdenes/matrículas conservarán sus reglas y persistencia | Previsto, D02/R07; RF12 y [catálogo de componentes](../../02-arquitectura-software/componentes-arquitectonicos.md). No se han definido aquí clases ni contratos nuevos |

[delivery-ports.ts](../../../apps/api/src/modules/mail/application/delivery-ports.ts) define Mailer y PayloadCipher; el contrato público de mail define DeliveryEligibility. Los adaptadores SMTP/cifrado devuelven objetos compatibles; PostgresDeliveryEligibility declara implementación explícita. [T024](../../../specs/001-identidad-acceso-roles/evidence/adaptadores-correo.md) respalda su comportamiento; RF02/RF04 y FR-029–031, con DA06/DA07, motivan la separación.

**Límites y costos.** Contratos, errores y timeouts están implementados, pero no garantizan compatibilidad con cualquier proveedor. Mailpit comprueba captura funcional de verificación; SMTP de producción, recuperación US7 y pagos siguen pendientes.

## Entrega diferida transaccional: correo

**Problema y justificación.** Confirmar un token y programar su correo en commits independientes permitiría perder una entrega; enviarlo durante HTTP acoplaría la respuesta a SMTP. R08 ya dispone registrar token y entrega en la misma transacción y procesar lo pendiente fuera de la solicitud. Esta estructura corresponde a Transactional Outbox aplicado a correo: registro durable del trabajo junto con el cambio de negocio y despacho posterior. No supone publicar eventos de dominio ni crear una plataforma general de mensajería.

| Participante | Responsabilidad y estado |
| --- | --- |
| Infraestructura de identity | PostgresRegistrationStore, PostgresActionTokenStore y PostgresBootstrapStore escriben cuenta/token/entrega según cada operación; no invocan SMTP en el commit |
| ActionToken y MailDelivery | Modelos reales en [schema.prisma](../../../apps/api/prisma/schema.prisma); vínculo único de entrega por token, estados, agenda, lease y claimId persistidos |
| Restricciones e índices | [Migración 0003](../../../apps/api/prisma/migrations/0003_identity_mail_limits/migration.sql); exige token/payload en estados activos y prepara consulta de entregas |
| Ejecutor interno y almacenamiento | [DeliverPending](../../../apps/api/src/modules/mail/application/deliver-pending.ts), [PostgresDeliveryStore](../../../apps/api/src/modules/mail/infrastructure/delivery-store.ts) y DeliveryScheduler implementados en T025–T026; recuperan leases sin transacción durante SMTP |
| Transporte, cifrado y elegibilidad | Adaptadores T024/T025 implementados y conectados por AppModule, sin imports de identity desde mail |
| Cuotas | PostgresRateStore.admitMail y reglas de delivery-policy.ts utilizados por admisión/emisión y ejecutor SMTP |

**Funcionamiento actual.** La transacción de negocio registra token y MailDelivery. El ejecutor interno consulta cada 5 s y reclama hasta dos entregas con SKIP LOCKED, lease de 60 s y claimId. Revalida elegibilidad y cuota SMTP, posponiendo sin gastar intento cuando falta cuota. Envía fuera de la transacción, con timeout total de 20 s, tres intentos y esperas +60/+300 s por fallos transitorios. Recupera leases vencidos, cancela trabajo obsoleto y limpia payload terminal, sin renovar token ni secreto.

**Requisitos y decisiones.** RF02/RF04 y FR-029–FR-031 requieren verificación, recuperación y límites de correo. R08 respalda la entrega durable; R06 el token de un solo uso y R09 las cuotas. DA06/DA08 relacionan integración y tolerancia a fallos. Los [escenarios de calidad](../../01-analisis-de-sistema/08-escenarios-atributos-calidad.md) mantienen la verificación de correo y disponibilidad separada de la salud del entorno.

**Estado y evidencia.** Fundamentos y ejecución interna comprobados en [T025–T026](../../../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md); escritura transaccional/consumo y captura SMTP funcional comprobados en US2/US6. El patrón es operativo en verificación; emisión/reset de US7, purga integral T095 y aceptación V13 completa permanecen pendientes.

**Límites y costos.** Añade almacenamiento cifrado, agenda, reclamaciones y manejo de fallos. SMTP y su registro en BD son pasos distintos: una interrupción puede duplicar mensajes y no hay envío exactamente una vez. VERIFY_EMAIL tiene consumo único comprobado; el flujo RESET_PASSWORD está pendiente. sentAt indica aceptación SMTP, no recepción final ni lectura. Sin broker ni otro proceso servidor.

## Distinción respecto de otros mecanismos y enfoques

| Elemento observado | Clasificación y límite de la identificación |
| --- | --- |
| NestJS y los métodos `forRoot` | Inyección de dependencias y composición: conectan consumidores con objetos concretos. Son mecanismos de ensamblaje, no evidencia automática de Strategy ni de un patrón creacional |
| `createPasswordCredentials` y `createDatabase` | Funciones de construcción; no presentan la estructura de Factory Method basada en una operación de creación redefinida por subclases ni una familia de productos de Abstract Factory |
| Transacciones de PostgresSessionStore/PostgresRateStore | Mecanismo de atomicidad con BEGIN/COMMIT/ROLLBACK; no se identifica Unit of Work solo por usar una transacción, pues no existe un coordinador de cambios de entidades con esa estructura |
| Pool compartido, HashGate y registro SystemState | Reutilización de recursos, control de cómputo y restricción persistente, respectivamente; no se atribuye Singleton por compartir un objeto o exigir una fila única |
| Guards, interceptor y filtros HTTP | Adaptación y controles del framework; no se deducen Decorator o Chain of Responsibility solo de sus nombres o del uso de decoradores de TypeScript |
| Clean Architecture, monolito por capas y SOLID | Enfoque de dependencias, estilo arquitectónico y principios, respectivamente; no se presentan como patrones internos. Docker Compose organiza la ejecución local |

Esta clasificación conserva funciones y contratos específicos donde son suficientes. No incorpora patrones a módulos académicos aún no detallados ni atribuye funcionalidades completas a los fundamentos existentes. Los 1000 usuarios concurrentes permanecen pendientes de pruebas de carga; la evidencia local no acredita disponibilidad de producción.
