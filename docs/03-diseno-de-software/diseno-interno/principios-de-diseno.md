# Principios de diseño

Los principios SOLID orientan la organización de responsabilidades y contratos de Academia Virtual. Se aplican a funciones, tipos y objetos del proyecto, sin exigir herencia ni una clase por regla de negocio. Su aplicación se examina sobre el código y las pruebas existentes; tener carpetas, interfaces o inyección de dependencias no demuestra cumplimiento completo.

El [diseño interno de módulos](diseno-interno-de-modulos.md) detalla las responsabilidades y el documento de [patrones de diseño](patrones-de-diseno.md) explica los adaptadores. Se conservan el monolito por capas y [Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md), relacionados con R01 y DA07 en las [decisiones](../../01-analisis-de-sistema/07-decisiones-arquitectonicas.md) y los [drivers](../../01-analisis-de-sistema/06-driver-arquitectonicos.md).

**Aplicación comprobada** identifica ejemplos concretos respaldados por código y resultados registrados. **Parcial** señala evidencia acotada o limitaciones del diseño existente. **Prevista** corresponde al [plan de identidad](../../../specs/001-identidad-acceso-roles/plan.md) sin implementación funcional. Ningún estado representa una certificación general de SOLID ni la finalización de las historias de identidad.

## Resumen

| Principio | Aplicación concreta | Evidencia principal | Estado y límite |
| --- | --- | --- | --- |
| Responsabilidad única | Separación entre elegibilidad pura, coordinación de autorización, transporte HTTP y almacenamiento de sesiones | Reglas de dominio, SessionLookup, guard y pruebas de sesiones/autorización | Comprobada en fundamentos; separación de todos los flujos aún prevista |
| Abierto/cerrado | Consumidores de credenciales y sesiones operan sobre contratos; el ensamblaje conecta implementaciones | Motor Argon2 instrumentado en pruebas y composición de SessionLookup | Parcial; no demuestra sustitución arbitraria de proveedores ni extensión de todos los permisos |
| Sustitución de Liskov | Mantener resultados, errores y efectos esperados al sustituir implementaciones de un contrato | Verificación real de credenciales y pruebas de semántica del almacén de sesiones | Parcial; no existe una suite común ejecutada contra varios almacenes productivos |
| Segregación de interfaces | Contratos separados para contraseñas, secretos y acceso a sesiones | PasswordCredentials, AccessSecrets y SessionRepository | Parcial; SessionLookup no utiliza revoke. Contratos de correo aún previstos |
| Inversión de dependencias | Aplicación consume contratos del núcleo; infraestructura los implementa y composición los conecta | Imports, reglas ESLint y pruebas de arquitectura; ensamblaje probado | Comprobada en ejemplos actuales; persistencia de flujos completos y correo previstos |

## Responsabilidad única

**Significado.** Una unidad debe agrupar una responsabilidad coherente y tener motivos de cambio vinculados a ella. No significa que deba contener un único método o que cada archivo represente una responsabilidad de negocio completa.

**Aplicación y ejemplo.** `canUseSession`, en [identity/domain/access.ts](../../../apps/api/src/modules/identity/domain/access.ts), evalúa elegibilidad, versión, revocación y caducidad con datos y tiempo recibidos; no consulta la base ni interpreta cookies. `SessionLookup.authorize`, en [authorization/application/session-lookup.ts](../../../apps/api/src/modules/authorization/application/session-lookup.ts), coordina consulta y permiso. `AccessGuard` y `AcceptedSessionInterceptor`, en [authorization/entrypoints/http/access.guard.ts](../../../apps/api/src/modules/authorization/entrypoints/http/access.guard.ts), adaptan HTTP y delimitan cuándo solicitar actividad aceptada. `PostgresSessionStore`, en [identity/infrastructure/session-store.ts](../../../apps/api/src/modules/identity/infrastructure/session-store.ts), resuelve persistencia, conversión de datos y atomicidad.

Los cambios en caducidad pertenecen a las reglas; los de cookie al transporte; los de consultas o locks al adaptador. La colaboración reutiliza reglas sin trasladar la decisión de elegibilidad a un controlador ni introducir SQL en SessionLookup. Esta distribución respalda separación de responsabilidades y cohesión alrededor del acceso, aunque varias piezas colaboren para resolverlo.

**Evidencia y verificación.** [access.test.ts](../../../apps/api/src/modules/identity/domain/access.test.ts) comprueba fronteras y ausencia de renovación por la regla pura. [session-store.spec.ts](../../../apps/api/tests/integration/session-store.spec.ts) prueba persistencia y actividad; [access-guard.spec.ts](../../../apps/api/tests/integration/access-guard.spec.ts) prueba permisos y que fallos HTTP no renueven sesiones. Los resultados constan en las evidencias de [reglas y credenciales](../../../specs/001-identidad-acceso-roles/evidence/reglas-credenciales-limites.md) y [sesiones y autorización](../../../specs/001-identidad-acceso-roles/evidence/sesiones-autorizacion-http.md). Las pruebas respaldan las conductas separadas; evaluar los motivos de cambio requiere además revisión del código.

**Estado y limitaciones.** Aplicación comprobada en estos fundamentos. El adaptador concentra varias operaciones relacionadas con sesiones; ello no prueba que futuras modificaciones permanezcan siempre aisladas. Registro, perfil, administración, correo y auditoría operativa todavía requieren completar sus responsabilidades según el plan. No se deduce su separación por la existencia de carpetas o modelos.

## Abierto/cerrado

**Significado.** Los consumidores estables deben poder admitir extensiones mediante sus contratos sin modificar innecesariamente su lógica. El principio no prohíbe cambiar una regla cuando cambian los requisitos ni obliga a crear un punto de extensión para toda operación.

**Aplicación y ejemplo.** `verifyAccountCredential` y `hashNewPassword`, en [identity/application/credentials.ts](../../../apps/api/src/modules/identity/application/credentials.ts), reciben `PasswordCredentials`. No tienen que importar Argon2 para utilizar sus operaciones. `createPasswordCredentials`, en [identity/infrastructure/credentials.ts](../../../apps/api/src/modules/identity/infrastructure/credentials.ts), recibe `Argon2Engine`; las pruebas lo instrumentan para observar cómputo y controlar fallos sin modificar los helpers. La extensión comprobada es la instrumentación del motor aprobado, no la selección de nuevos algoritmos.

SessionLookup recibe `SessionRepository`; [AuthorizationModule.forRoot](../../../apps/api/src/modules/authorization/authorization.module.ts) permite suministrar la implementación desde composición. Una implementación alternativa conforme al contrato podría conectarse allí sin cambiar la coordinación de autorización, pero solo PostgresSessionStore tiene implementación productiva. R07 prevé el mismo aislamiento para correo y D02 para Izipay; no hay todavía proveedores funcionales sustituibles.

**Evidencia y verificación.** [credentials.spec.ts](../../../apps/api/tests/integration/credentials.spec.ts) utiliza motores instrumentados que delegan en Argon2 real y motores controlados para cola/fallos. La evidencia de T018 registra sus resultados. Revisar imports y ejecutar pruebas del consumidor con una nueva implementación serían comprobaciones pertinentes para una extensión futura; las pruebas actuales no demuestran esa compatibilidad para proveedores no implementados.

**Estado y limitaciones.** Aplicación parcial. El formato y parámetros Argon2id están fijados, por lo que una firma compatible no permite introducir cualquier algoritmo. `permits`, en [authorization/domain/permissions.ts](../../../apps/api/src/modules/authorization/domain/permissions.ts), utiliza una matriz cerrada de identidad: añadir permisos académicos requerirá definir y modificar reglas y pruebas. Los contratos de correo previstos en T024/T025 no son puntos de extensión ya operativos.

## Sustitución de Liskov

**Significado.** Una implementación sustituible debe conservar las expectativas de sus consumidores: no reforzar precondiciones, debilitar resultados garantizados ni introducir efectos incompatibles. En este proyecto se examina la sustitución mediante contratos estructurales de TypeScript; no se inventa una jerarquía de herencia.

**Aplicación y ejemplo.** PasswordCredentials declara que `verify(password, encodedHash)` admite `null`, realiza trabajo equivalente y no acepta esa credencial. El adaptador real utiliza un hash ficticio ante ausencia o formato no utilizable y devuelve rechazo. Una implementación que exigiera siempre un hash presente, aceptara `null` o evitara el trabajo previsto rompería las expectativas de `verifyAccountCredential`, incluso si TypeScript aceptara sus tipos.

`Argon2Engine` recibe el hash antes de la contraseña; el adaptador lo traduce al orden del contrato de aplicación. Los motores instrumentados de credentials.spec.ts delegan hash/verificación en Argon2 real y conservan su semántica en los casos comprobados. Los dobles que devuelven resultados constantes para controlar la cola son herramientas de ensayo acotadas; no son reemplazos válidos para autenticar en producción.

En [authorization/public/session.ts](../../../apps/api/src/modules/authorization/public/session.ts), SessionRepository define `lookup`, `accept` y `revoke`. El comportamiento existente de PostgresSessionStore y R02/R05 precisan las expectativas: lookup no renueva ni concede acceso a sesiones inválidas; accept revalida, no revive acceso ni amplía la caducidad absoluta; revoke es idempotente. Ante indisponibilidad, se comunica `SessionStoreUnavailable`; no se inventa un actor ni se concede acceso. `revalidateInTransaction` es una operación adicional de infraestructura, no parte del contrato sustituible, y su requisito de PoolClient no debe imponerse a los consumidores del núcleo.

**Evidencia y verificación.** credentials.spec.ts comprueba credenciales válidas/incorrectas, cuenta no elegible, hash ausente o malformado y errores tipados. session-store.spec.ts comprueba caducidad, revocación, persistencia al recrear el adaptador y fallo cerrado. La evidencia T018/T021 registra esos resultados. Recrear el mismo adaptador prueba continuidad de persistencia, no sustitución entre implementaciones diferentes.

**Estado y limitaciones.** Aplicación parcial: hay evidencia de semántica del adaptador real y de instrumentación compatible en casos concretos, pero no una suite común de conformidad ejecutada contra múltiples almacenes o proveedores. Los tipos no expresan por sí solos invariantes de seguridad, efectos, tiempos ni errores. Para un futuro adaptador deben verificarse esas mismas expectativas, incluidos trabajo ficticio, permisos vigentes e indisponibilidad; la sustitución de SMTP/elegibilidad de correo sigue prevista.

## Segregación de interfaces

**Significado.** Un consumidor debería depender de las capacidades que necesita, sin quedar obligado a conocer operaciones ajenas a su responsabilidad. La medida relevante es el uso del contrato, no la cantidad de interfaces creadas.

**Aplicación y ejemplo.** PasswordCredentials agrupa hash/verificación; AccessSecrets agrupa emisión/huella de secretos aleatorios, ambos en identity/application/credentials.ts. No obligan al consumidor de contraseñas a manejar correo, perfiles o sesiones. SessionRepository expone capacidades específicas de acceso y no consultas SQL, modelos Prisma o un CRUD genérico. [users/public/account.ts](../../../apps/api/src/modules/users/public/account.ts) publica tipos y validaciones que otros módulos consumen sin importar su infraestructura.

Existe un límite concreto: SessionLookup utiliza lookup y accept, pero recibe también revoke. Asimismo, PostgresSessionStore utiliza `accessSecrets.digest` mediante el objeto concreto, que también expone issue. Los contratos son pequeños y cohesivos, pero esos consumidores no usan todas sus operaciones. Esto impide afirmar una segregación mínima completa; no se introduce una refactorización ni nuevos contratos para resolverlo en este documento.

**Evidencia y verificación.** La revisión de firmas e invocaciones permite comparar capacidades ofrecidas con las usadas. Las [pruebas de arquitectura](../../../apps/api/tests/architecture/import-boundaries.spec.ts) verifican que un módulo consuma la superficie public de otro, pero no comprueban que cada consumidor necesite todos sus miembros. Las pruebas de comportamiento anteriores respaldan las capacidades existentes; no certifican por sí mismas segregación de interfaces.

**Estado y limitaciones.** Aplicación parcial. El plan prevé separar transporte y elegibilidad de correo para que mail no dependa de los internos de identity; sus contratos y adaptadores siguen pendientes en T024/T025. Se conserva la decisión de crear interfaces solo cuando permiten una separación útil, sin un contrato por cada función ni repositorios genéricos.

## Inversión de dependencias

**Significado.** La coordinación y las reglas deben depender de abstracciones del núcleo; los detalles técnicos implementan esas abstracciones. Se distingue de la inyección de dependencias, que es el mecanismo para entregar los objetos concretos durante el ensamblaje.

**Aplicación y ejemplo.** SessionLookup importa SessionRepository desde la superficie pública de autorización y no conoce PostgresSessionStore, pg o SQL. PostgresSessionStore importa e implementa ese contrato y consume reglas de dominio. Los helpers de credenciales dependen de PasswordCredentials, definido en aplicación; la implementación criptográfica importa ese contrato. El dominio recibe datos y tiempo y no importa NestJS, Prisma o proveedores. Estas dependencias hacia el núcleo permiten probar reglas sin servidor ni base de datos.

[AppModule.forRoot](../../../apps/api/src/app.module.ts) conoce el pool y construye PostgresSessionStore; AuthorizationModule.forRoot crea SessionLookup con esa instancia y configura providers. NestJS inyecta SessionLookup en el guard/interceptor. **La inversión** reside en qué código conoce los contratos e implementaciones; **la inyección** entrega las instancias. En ejecución, SessionLookup llama al adaptador a través del contrato, aunque su código no lo importe. El ensamblaje sí puede conocer los detalles sin trasladarlos al dominio.

**Evidencia y verificación.** [ops/lint/import-boundaries.mjs](../../../ops/lint/import-boundaries.mjs) establece dependencias permitidas por capa y limita imports entre módulos a public. [apps/api/eslint.config.js](../../../apps/api/eslint.config.js) habilita la regla para el código correspondiente. import-boundaries.spec.ts ensaya rechazo de Nest/infraestructura en dominio y de acceso a internos ajenos, y aceptación de dominio/public. Los resultados registrados de lint y pruebas de arquitectura constan en las evidencias T017–T023. Las pruebas de guard y transporte comprueban además el ensamblaje actual.

**Estado y limitaciones.** Aplicación comprobada en los ejemplos de credenciales y sesiones; no equivale a cobertura total de todos los archivos. La regla reconoce rutas de módulos y fuentes de importación determinadas: no demuestra ausencia de todos los ciclos o dependencias semánticas, y sus ensayos con fragmentos no reemplazan lint sobre el código real. Los imports relativos cuyo destino queda fuera de las capas reconocidas requieren revisión; la configuración desactiva esta regla en `src/**/*.test.ts`. PostgresRateStore es infraestructura concreta sin un contrato del núcleo independiente; no se atribuye inversión de dependencias solo porque reutilice reglas puras. Los contratos para persistencia atómica de flujos completos, correo y auditoría operativa siguen previstos.

## Cohesión, acoplamiento y alcance de la evidencia

La cohesión se observa al reunir reglas de elegibilidad en identity, decisiones de permiso en authorization y validaciones de cuenta en users. El acoplamiento se limita mediante contratos pequeños y superficies públicas: authorization no importa IdentityModule para resolver una sesión; la composición conecta su adaptador. Son ejemplos existentes, no una medición universal de cohesión o acoplamiento. El diseño futuro conserva esa separación para correo, sin llamada inversa de mail a identity, y para los módulos académicos todavía previstos.

Las evidencias enlazadas registran ejecuciones anteriores; esta documentación no declara nuevas ejecuciones ni cierra tareas. Las pruebas de dominio, integración y arquitectura aportan evidencias distintas y complementarias: reglas puras, efectos persistidos y restricciones de imports. Ninguna demuestra por sí sola SOLID completo, disponibilidad de producción o capacidad de 1000 usuarios concurrentes. El objetivo de carga y las historias funcionales de identidad permanecen pendientes según la [verificación](../../../specs/001-identidad-acceso-roles/verification.md).
