# Principios de diseño

Los principios SOLID orientan la organización de responsabilidades y contratos de Academia Virtual. Se aplican a funciones, tipos y objetos del proyecto, sin exigir herencia ni una clase por regla de negocio. Su aplicación se examina sobre el código y las pruebas existentes; tener carpetas, interfaces o inyección de dependencias no demuestra cumplimiento completo.

El [diseño interno de módulos](diseno-interno-de-modulos.md) detalla las responsabilidades y el documento de [patrones de diseño](patrones-de-diseno.md) explica los adaptadores. Se conservan el monolito por capas y [Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md), relacionados con R01 y DA07 en las [decisiones](../../01-analisis-de-sistema/07-decisiones-arquitectonicas.md) y los [drivers](../../01-analisis-de-sistema/06-driver-arquitectonicos.md).

**Aplicación comprobada** identifica ejemplos con código/evidencia; **parcial**, límites pendientes; **prevista**, diseño sin implementación funcional. Corte hasta T058: [US1](../../../specs/001-identidad-acceso-roles/evidence/us1.md), [US2](../../../specs/001-identidad-acceso-roles/evidence/us2.md) y [US6](../../../specs/001-identidad-acceso-roles/evidence/us6.md) tienen checkpoints comprobados. Ningún estado certifica SOLID completo ni identidad terminada.

## Resumen

| Principio | Aplicación concreta | Evidencia principal | Estado y límite |
| --- | --- | --- | --- |
| Responsabilidad única | Reglas puras, casos de uso, HTTP/CLI y adaptadores de sesiones/correo/auditoría | Fundamentos y checkpoints US1/US2/US6 | Comprobada en ejemplos actuales; administración/recuperación pendientes |
| Abierto/cerrado | Consumidores de credenciales y sesiones operan sobre contratos; el ensamblaje conecta implementaciones | Motor Argon2 instrumentado en pruebas y composición de SessionLookup | Parcial; no demuestra sustitución arbitraria de proveedores ni extensión de todos los permisos |
| Sustitución de Liskov | Mantener resultados, errores y efectos esperados al sustituir implementaciones de un contrato | Verificación real de credenciales y pruebas de semántica del almacén de sesiones | Parcial; no existe una suite común ejecutada contra varios almacenes productivos |
| Segregación de interfaces | Contratos de credenciales, sesiones, persistencia, cifrado/transporte/elegibilidad | PasswordCredentials, SessionRepository, LoginLimits, Mailer, PayloadCipher y DeliveryEligibility | Parcial; algunos consumidores reciben capacidades adicionales |
| Inversión de dependencias | Aplicación consume contratos; infraestructura implementa y composición conecta | Imports/lint y ensamblaje de casos de uso/correo registrados en las evidencias | Comprobada en ejemplos actuales; no cobertura universal ni flujos futuros |

## Responsabilidad única

**Significado.** Una unidad debe agrupar una responsabilidad coherente y tener motivos de cambio vinculados a ella. No significa que deba contener un único método o que cada archivo represente una responsabilidad de negocio completa.

**Aplicación y ejemplo.** `canUseSession`, en [identity/domain/access.ts](../../../apps/api/src/modules/identity/domain/access.ts), evalúa elegibilidad, versión, revocación y caducidad con datos y tiempo recibidos; no consulta la base ni interpreta cookies. `SessionLookup.authorize`, en [authorization/application/session-lookup.ts](../../../apps/api/src/modules/authorization/application/session-lookup.ts), coordina consulta y permiso. `AccessGuard` y `AcceptedSessionInterceptor`, en [authorization/entrypoints/http/access.guard.ts](../../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts), adaptan HTTP y delimitan cuándo solicitar actividad aceptada. `PostgresSessionStore`, en [identity/infrastructure/session-store.ts](../../../apps/api/src/modules/identity/infrastructure/session-store.ts), resuelve persistencia, conversión de datos y atomicidad.

Los cambios en caducidad pertenecen a las reglas; los de cookie al transporte; los de consultas o locks al adaptador. La colaboración reutiliza reglas sin trasladar la decisión de elegibilidad a un controlador ni introducir SQL en SessionLookup. Esta distribución respalda separación de responsabilidades y cohesión alrededor del acceso, aunque varias piezas colaboren para resolverlo.

**Evidencia y verificación.** [access.test.ts](../../../apps/api/src/modules/identity/domain/access.test.ts) comprueba fronteras y ausencia de renovación por la regla pura. [session-store.spec.ts](../../../apps/api/tests/integration/session-store.spec.ts) prueba persistencia y actividad; [access-guard.spec.ts](../../../apps/api/tests/integration/access-guard.spec.ts) prueba permisos y que fallos HTTP no renueven sesiones. Los resultados constan en las evidencias de [reglas y credenciales](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md) y [sesiones y autorización](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md). Las pruebas respaldan las conductas separadas; evaluar los motivos de cambio requiere además revisión del código.

**Estado y limitaciones.** Aplicación comprobada en estos fundamentos y en los casos de uso de US1/US2/US6. Login, registro, consulta propia, correo y bootstrap tienen responsabilidades conectadas; administración y recuperación siguen pendientes. El adaptador reúne operaciones relacionadas con sesiones, sin demostrar aislamiento de cualquier cambio futuro.

## Abierto/cerrado

**Significado.** Los consumidores estables deben poder admitir extensiones mediante sus contratos sin modificar innecesariamente su lógica. El principio no prohíbe cambiar una regla cuando cambian los requisitos ni obliga a crear un punto de extensión para toda operación.

**Aplicación y ejemplo.** `verifyAccountCredential` y `hashNewPassword`, en [identity/application/credentials.ts](../../../apps/api/src/modules/identity/application/credentials.ts), reciben `PasswordCredentials`. No tienen que importar Argon2 para utilizar sus operaciones. `createPasswordCredentials`, en [identity/infrastructure/credentials.ts](../../../apps/api/src/modules/identity/infrastructure/credentials.ts), recibe `Argon2Engine`; las pruebas lo instrumentan para observar cómputo y controlar fallos sin modificar los helpers. La extensión comprobada es la instrumentación del motor aprobado, no la selección de nuevos algoritmos.

SessionLookup recibe SessionRepository; AuthorizationModule.forRoot suministra el adaptador sin cambiar la coordinación. [DeliverPending](../../../apps/api/src/modules/mail/application/deliver-pending.ts) usa Mailer/PayloadCipher/DeliveryEligibility/DeliveryStore, y AppModule conecta sus implementaciones. Solo hay un adaptador productivo por capacidad: probar instrumentación o variantes locales no demuestra sustitución arbitraria de proveedores.

**Evidencia y verificación.** [credentials.spec.ts](../../../apps/api/tests/integration/credentials.spec.ts) utiliza motores instrumentados que delegan en Argon2 real y motores controlados para cola/fallos. La evidencia de T018 registra sus resultados. Revisar imports y ejecutar pruebas del consumidor con una nueva implementación serían comprobaciones pertinentes para una extensión futura; las pruebas actuales no demuestran esa compatibilidad para proveedores no implementados.

**Estado y limitaciones.** Aplicación parcial: formato/seguridad Argon2id y matriz de permisos siguen fijados, y ampliar permisos exige cambiar reglas/pruebas. Los contratos de correo T024–T026 ya son operativos; SMTP de producción e Izipay continúan pendientes. Compatibilidad de firma no garantiza una extensión válida.

## Sustitución de Liskov

**Significado.** Una implementación sustituible debe conservar las expectativas de sus consumidores: no reforzar precondiciones, debilitar resultados garantizados ni introducir efectos incompatibles. En este proyecto se examina la sustitución mediante contratos estructurales de TypeScript; no se inventa una jerarquía de herencia.

**Aplicación y ejemplo.** PasswordCredentials declara que `verify(password, encodedHash)` admite `null`, realiza trabajo equivalente y no acepta esa credencial. El adaptador real utiliza un hash ficticio ante ausencia o formato no utilizable y devuelve rechazo. Una implementación que exigiera siempre un hash presente, aceptara `null` o evitara el trabajo previsto rompería las expectativas de `verifyAccountCredential`, incluso si TypeScript aceptara sus tipos.

`Argon2Engine` recibe el hash antes de la contraseña; el adaptador lo traduce al orden del contrato de aplicación. Los motores instrumentados de credentials.spec.ts delegan hash/verificación en Argon2 real y conservan su semántica en los casos comprobados. Los dobles que devuelven resultados constantes para controlar la cola son herramientas de ensayo acotadas; no son reemplazos válidos para autenticar en producción.

En [authorization/public/session.ts](../../../apps/api/src/modules/authorization/public/session.ts), SessionRepository define `lookup`, `accept` y `revoke`. El comportamiento existente de PostgresSessionStore y R02/R05 precisan las expectativas: lookup no renueva ni concede acceso a sesiones inválidas; accept revalida, no revive acceso ni amplía la caducidad absoluta; revoke es idempotente. Ante indisponibilidad, se comunica `SessionStoreUnavailable`; no se inventa un actor ni se concede acceso. `revalidateInTransaction` es una operación adicional de infraestructura, no parte del contrato sustituible, y su requisito de PoolClient no debe imponerse a los consumidores del núcleo.

**Evidencia y verificación.** credentials.spec.ts comprueba credenciales válidas/incorrectas, cuenta no elegible, hash ausente o malformado y errores tipados. session-store.spec.ts comprueba caducidad, revocación, persistencia al recrear el adaptador y fallo cerrado. La evidencia T018/T021 registra esos resultados. Recrear el mismo adaptador prueba continuidad de persistencia, no sustitución entre implementaciones diferentes.

**Estado y limitaciones.** Aplicación parcial: semántica de adaptadores reales e instrumentación comprobadas, sin suite común contra múltiples almacenes/proveedores productivos. [T024](../../../specs/001-identidad-acceso-roles/evidence/adaptadores-correo.md) y [T025–T026](../../../specs/001-identidad-acceso-roles/evidence/entregas-persistidas.md) comprueban Mailer y elegibilidad locales: send significa aceptación SMTP y check devuelve estados definidos, sin prometer recepción final. Los tipos no expresan todas las invariantes, efectos o condiciones temporales.

## Segregación de interfaces

**Significado.** Un consumidor debería depender de las capacidades que necesita, sin quedar obligado a conocer operaciones ajenas a su responsabilidad. La medida relevante es el uso del contrato, no la cantidad de interfaces creadas.

**Aplicación y ejemplo.** PasswordCredentials agrupa hash/verificación; AccessSecrets agrupa emisión/huella de secretos aleatorios, ambos en identity/application/credentials.ts. No obligan al consumidor de contraseñas a manejar correo, perfiles o sesiones. SessionRepository expone capacidades específicas de acceso y no consultas SQL, modelos Prisma o un CRUD genérico. [users/public/account.ts](../../../apps/api/src/modules/users/public/account.ts) publica tipos y validaciones que otros módulos consumen sin importar su infraestructura.

Existe un límite concreto: SessionLookup utiliza lookup y accept, pero recibe también revoke. Asimismo, PostgresSessionStore utiliza `accessSecrets.digest` mediante el objeto concreto, que también expone issue. Los contratos son pequeños y cohesivos, pero esos consumidores no usan todas sus operaciones. Esto impide afirmar una segregación mínima completa; no se introduce una refactorización ni nuevos contratos para resolverlo en este documento.

**Evidencia y verificación.** La revisión de firmas e invocaciones permite comparar capacidades ofrecidas con las usadas. Las [pruebas de arquitectura](../../../apps/api/tests/architecture/import-boundaries.spec.ts) verifican que un módulo consuma la superficie public de otro, pero no comprueban que cada consumidor necesite todos sus miembros. Las pruebas de comportamiento anteriores respaldan las capacidades existentes; no certifican por sí mismas segregación de interfaces.

**Estado y limitaciones.** Aplicación parcial. Mailer/PayloadCipher están en [delivery-ports.ts](../../../apps/api/src/modules/mail/application/delivery-ports.ts) y DeliveryEligibility en [mail/public/delivery.ts](../../../apps/api/src/modules/mail/public/delivery.ts). Login/SetInitialPassword consumen LoginLimits; IssueActionLink consume ActionLinkLimits y BootstrapAdmin solo la capacidad prepareMessage. Estos contratos ya se usan, aunque no se acredita segregación mínima de cada consumidor ni se introduce una interfaz por función.

## Inversión de dependencias

**Significado.** La coordinación y las reglas deben depender de abstracciones del núcleo; los detalles técnicos implementan esas abstracciones. Se distingue de la inyección de dependencias, que es el mecanismo para entregar los objetos concretos durante el ensamblaje.

**Aplicación y ejemplo.** SessionLookup importa SessionRepository desde la superficie pública de autorización y no conoce PostgresSessionStore, pg o SQL. PostgresSessionStore importa e implementa ese contrato y consume reglas de dominio. Los helpers de credenciales dependen de PasswordCredentials, definido en aplicación; la implementación criptográfica importa ese contrato. El dominio recibe datos y tiempo y no importa NestJS, Prisma o proveedores. Estas dependencias hacia el núcleo permiten probar reglas sin servidor ni base de datos.

[AppModule.forRoot](../../../apps/api/src/app.module.ts) conoce el pool y construye PostgresSessionStore; AuthorizationModule.forRoot crea SessionLookup con esa instancia y configura providers. NestJS inyecta SessionLookup en el guard/interceptor. **La inversión** reside en qué código conoce los contratos e implementaciones; **la inyección** entrega las instancias. En ejecución, SessionLookup llama al adaptador a través del contrato, aunque su código no lo importe. El ensamblaje sí puede conocer los detalles sin trasladarlos al dominio.

**Evidencia y verificación.** [ops/lint/import-boundaries.mjs](../../../ops/lint/import-boundaries.mjs) establece dependencias permitidas por capa y limita imports entre módulos a public. [apps/api/eslint.config.js](../../../apps/api/eslint.config.js) habilita la regla para el código correspondiente. import-boundaries.spec.ts ensaya rechazo de Nest/infraestructura en dominio y de acceso a internos ajenos, y aceptación de dominio/public. Los resultados registrados de lint y pruebas de arquitectura constan en las evidencias T017–T023. Las pruebas de guard y transporte comprueban además el ensamblaje actual.

**Estado y limitaciones.** Aplicación comprobada en credenciales, sesiones, casos de uso US1/US2/US6 y correo, sin cobertura universal. LoginStore/LoginLimits, RegistrationStore, VerificationStore e InitialPasswordStore se definen en aplicación; DeliverPending depende de contratos, no de pg/Nodemailer. PostgresRateStore es compatible estructuralmente con contratos de cuotas, pero PostgresDeliveryStore aún recibe el adaptador concreto y PostgresAuditWriter requiere PoolClient dentro de infraestructura. La inyección no elimina esas dependencias técnicas. Lint de imports no detecta todo ciclo semántico ni sustituye revisión del código.

## Cohesión, acoplamiento y alcance de la evidencia

La cohesión reúne elegibilidad en identity, permisos en authorization, validaciones/proyección en users y entrega en mail. Contratos y superficies públicas limitan el acoplamiento: authorization no importa IdentityModule y mail no importa internos de identity; AppModule conecta PostgresDeliveryEligibility mediante el contrato público de mail. Esa separación está implementada, sin constituir una medida universal de cohesión/acoplamiento. Los módulos académicos siguen previstos.

Las evidencias registran ejecuciones anteriores; esta sincronización no ejecuta nuevas pruebas ni cierra tareas. Los checkpoints US1/US2/US6 comprobados no acreditan SOLID completo, producción ni 1000 concurrentes. Administración, recuperación y verificaciones transversales mantienen sus dependencias en la [estrategia de verificación](../../../specs/001-identidad-acceso-roles/verification.md).
