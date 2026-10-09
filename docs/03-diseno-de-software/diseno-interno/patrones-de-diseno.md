# Patrones de diseño

Los patrones descritos se identifican por las colaboraciones del código y por el diseño explícito del [plan de identidad](../../../specs/001-identidad-acceso-roles/plan.md). Complementan el [diseño interno de módulos](diseno-interno-de-modulos.md) sin introducir nuevas decisiones. El backend conserva el estilo monolito por capas y Clean Architecture como enfoque para sus dependencias internas.

Se distingue el patrón estructural Adaptador de la entrega diferida transaccional, un patrón de integración. **Implementado** indica que los elementos y su comportamiento tienen código y evidencia; **parcial** indica que solo una parte existe; **previsto** identifica diseño respaldado sin implementación funcional. Estos estados no acreditan historias completas de identidad.

## Resumen

| Patrón | Aplicación en el proyecto | Estado | Trazabilidad principal |
| --- | --- | --- | --- |
| Adaptador (Adapter) | Contratos de credenciales y secretos implementados con Argon2 y criptografía de Node | Implementado como fundamento; registro y login pendientes | RF01, RF03; FR-006, FR-026; R04, R07; DA01, DA07 |
| Adaptador (Adapter) | Contrato público de sesiones implementado mediante PostgreSQL | Implementado como fundamento; endpoints funcionales pendientes | RF03, RF08; FR-007–FR-009, FR-018–FR-020; R02, R05, R07; DA01, DA07 |
| Adaptador (Adapter) | Transporte, cifrado y elegibilidad de correo; integración futura de Izipay | Previsto | RF02, RF04, RF12; FR-029–FR-031; R07, D02; DA02, DA06, DA07 |
| Entrega diferida transaccional (Transactional Outbox) | Registro atómico de token/entrega y procesamiento interno fuera de HTTP | Parcial: modelo persistente implementado; coordinación transaccional y ejecutor previstos | RF02, RF04; FR-029–FR-031; R08; DA06, DA08 |

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

**Estado y evidencia.** Implementado y probado como fundamento T018. [credentials.spec.ts](../../../apps/api/tests/integration/credentials.spec.ts) verifica Argon2 real, aceptación/rechazo, trabajo ficticio, límites y secretos; los resultados están en la [evidencia de credenciales y límites](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md). La aplicación de producto todavía no ensambla un flujo de registro o login.

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

**Estado y evidencia.** Implementado en T021/T022, con pruebas en [session-store.spec.ts](../../../apps/api/tests/integration/session-store.spec.ts) y [access-guard.spec.ts](../../../apps/api/tests/integration/access-guard.spec.ts). La [evidencia de sesiones y autorización](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md) registra consultas con PostgreSQL real, revocación, expiración, permisos y concurrencia. Las rutas protegidas de ensayo no son endpoints funcionales publicados.

**Límites y costos.** Cada operación depende de la base primaria y añade consultas; un contrato pequeño no elimina esa dependencia operativa. Las futuras mutaciones deben revalidar dentro de su transacción y no apoyarse solo en el guard.

El nombre **SessionRepository** no basta para afirmar el patrón Repository entendido como colección de entidades o agregados de dominio. Este contrato expone capacidades de acceso y actividad y devuelve una proyección de actor, sin una colección ni operaciones de almacenamiento de agregados. Se documenta como puerto específico y adaptador de persistencia. Tampoco [PostgresRateStore](../../../apps/api/src/infrastructure/limits/rate-store.ts), PrismaClient o el pool se clasifican como Repository: el primero implementa cuotas mediante SQL sin un contrato independiente del núcleo; los otros son herramientas de acceso a datos. El plan descarta repositorios CRUD genéricos.

## Adaptadores previstos: correo y pagos

**Problema y justificación.** Las reglas de identidad no deben depender de Nodemailer ni de un proveedor SMTP; mail tampoco debe importar los internos de identity para decidir si un enlace sigue vigente. En el MVP, las reglas de órdenes y matrículas deben permanecer independientes de Izipay. R07 y D02 prevén contratos y adaptadores para estos límites; no existe todavía una integración funcional.

| Límite previsto | Participantes y funcionamiento previsto | Estado y fuente |
| --- | --- | --- |
| Transporte de correo | El ejecutor consumirá el contrato de transporte; un adaptador traducirá la solicitud a SMTP con Nodemailer, captura local en Mailpit y condiciones seguras por entorno | Previsto, T024; el [plan](../../../specs/001-identidad-acceso-roles/plan.md) y [R07 de investigación](../../../specs/001-identidad-acceso-roles/research.md#r07--correo-local-y-futura-salida-smtp) describen la separación |
| Cifrado del contenido pendiente | Contrato para proteger/recuperar payload; implementación con AES-256-GCM y claves externas a BD | Previsto, T024; modelo y R08. No existe aún el adaptador funcional |
| Elegibilidad de entrega | Mail consumirá un contrato; un adaptador de identity comprobará vigencia de cuenta/token. La composición conectará ambos, sin importar identity desde mail | Previsto, T024/T025; plan y [tareas](../../../specs/001-identidad-acceso-roles/tasks.md) |
| Pagos | El módulo de pagos adaptará mensajes de Izipay a sus capacidades internas; órdenes/matrículas conservarán sus reglas y persistencia | Previsto, D02/R07; RF12 y [catálogo de componentes](../../02-arquitectura-software/componentes-arquitectonicos.md). No se han definido aquí clases ni contratos nuevos |

T024/T025 señalan como destinos `mail/application/delivery-ports.ts`, `mail/infrastructure/smtp-transport.ts`, `mail/infrastructure/payload-cipher.ts` e `identity/infrastructure/delivery-eligibility.ts`, dentro de `apps/api/src/modules/`. Son rutas previstas, no archivos implementados. El nombre `Mailer` aparece en la investigación como puerto propuesto; no es una interfaz existente. RF02/RF04 y FR-029–FR-031 respaldan el correo; DA06/DA07 su aislamiento. RF12 y DA02 respaldan pagos.

**Límites y costos.** Los contratos requieren definir errores, timeouts y condiciones de seguridad, además de probar cada adaptador. Cambiar proveedor no elimina diferencias de cuotas o comportamiento. Mailpit operativo y las pruebas de compatibilidad SMTP no acreditan el ejecutor ni los correos funcionales. No hay pagos implementados.

## Entrega diferida transaccional: correo

**Problema y justificación.** Confirmar un token y programar su correo en commits independientes permitiría perder una entrega; enviarlo durante HTTP acoplaría la respuesta a SMTP. R08 ya dispone registrar token y entrega en la misma transacción y procesar lo pendiente fuera de la solicitud. Esta estructura corresponde a Transactional Outbox aplicado a correo: registro durable del trabajo junto con el cambio de negocio y despacho posterior. No supone publicar eventos de dominio ni crear una plataforma general de mensajería.

| Participante | Responsabilidad y estado |
| --- | --- |
| Infraestructura de identity | Coordinará la escritura atómica de cuenta/token/entrega según el caso de uso; flujos pendientes |
| ActionToken y MailDelivery | Modelos reales en [schema.prisma](../../../apps/api/prisma/schema.prisma); vínculo único de entrega por token, estados, agenda, lease y claimId persistidos |
| Restricciones e índices | [Migración 0003](../../../apps/api/prisma/migrations/0003_identity_mail_limits/migration.sql); exige token/payload en estados activos y prepara consulta de entregas |
| Ejecutor interno y almacenamiento | Previsto en T025: reclamación y recuperación de trabajos sin sostener la transacción durante SMTP |
| Transporte, cifrado y elegibilidad | Adaptadores previstos en T024/T025; preservan vigencia y protección del contenido sin acoplar mail a identity |
| Cuotas | `PostgresRateStore.admitMail` y reglas de [delivery-policy.ts](../../../apps/api/src/modules/mail/domain/delivery-policy.ts) están implementados; su uso por el ejecutor sigue pendiente |

**Funcionamiento previsto.** La transacción de negocio registra el token y MailDelivery; al confirmar, deja trabajo durable. El ejecutor interno consulta cada 5 s, reclama hasta dos entregas con `SKIP LOCKED` y lease de 60 s identificado por claimId. Comprueba elegibilidad y reserva cuota SMTP; si falta cuota, pospone sin gastar intento. Envía fuera de la transacción, con timeout total de 20 s y tres intentos como máximo, con esperas de 60 y 300 s tras fallos transitorios. Recupera leases vencidos al reiniciar. Cancela trabajos obsoletos y borra payload terminal, sin prolongar el token ni generar otro secreto en cada reintento.

**Requisitos y decisiones.** RF02/RF04 y FR-029–FR-031 requieren verificación, recuperación y límites de correo. R08 respalda la entrega durable; R06 el token de un solo uso y R09 las cuotas. DA06/DA08 relacionan integración y tolerancia a fallos. Los [escenarios de calidad](../../01-analisis-de-sistema/08-escenarios-atributos-calidad.md) mantienen la verificación de correo y disponibilidad separada de la salud del entorno.

**Estado y evidencia.** Parcial: T015 prueba el modelo y sus restricciones, según [fundamentos de datos](../../../specs/001-identidad-acceso-roles/evidence/fundamentos-datos.md). Las reglas de entrega y cuotas cuentan con la evidencia T017–T020. La coordinación atómica de los flujos, adaptadores y ejecutor siguen previstos; T024–T026 permanecen pendientes. La existencia de MailDelivery no demuestra un outbox operativo ni recuperación de envíos tras reinicio.

**Límites y costos.** Añade almacenamiento sensible cifrado, agenda, reclamaciones, limpieza y manejo de fallos. Una caída después de aceptación SMTP puede ocasionar entrega duplicada: no hay garantía de envío exactamente una vez. El consumo único corresponde al token y requiere su implementación funcional. `sentAt` representa aceptación SMTP, no lectura o entrega final al destinatario. No se introduce broker ni proceso de microservicio.

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
