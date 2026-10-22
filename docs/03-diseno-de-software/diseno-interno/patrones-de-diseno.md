# Patrones de diseño observados

Esta vista usa código existente; el [diseño interno](diseno-interno-de-modulos.md)
es referencia para colaboración y transacciones. [Estado y evidencia](../../estado-documental.md)
delimitan qué implementaciones se han verificado.

| Patrón o mecanismo | Ejemplo existente y propósito | Evidencia / límite |
| --- | --- | --- |
| Puertos y adaptadores | SessionLookup consume SessionRepository; PostgresSessionStore implementa el contrato. Aplicación consume PasswordCredentials; Argon2id queda en infraestructura. Oferta consume PreparationStore/AdministrativeReads | R01/R07, DA07, AC06; pruebas de imports y comportamiento. Un adaptador productivo por capacidad no demuestra sustituibilidad arbitraria |
| Inyección de dependencias | AppModule conecta pool/sesiones/directorio/escritor y módulos Nest | Núcleo sin Nest; composición sí conoce infraestructura. No es automáticamente Strategy |
| Entrega diferida transaccional (outbox) | Identidad persiste token y MailDelivery junto con la operación; DeliverPending reclama leases y envía por SMTP fuera de HTTP | 001 entregas/US2/US7/T106; reinicio/reintento y consumo único locales. SMTP puede duplicar mensajes; sentAt significa aceptación SMTP, no recepción o lectura |
| Idempotencia persistida por comando | AcademicCommand por actor/commandId, digest canónico incluye operación/destino/revisión; reautorizar antes de replay | 002 T012–T014 y preparación T024–T029; proyección actual con appliedRevision original. Otro commandId es otra intención, no deduplicación por nombre |
| Concurrencia optimista y locks | expectedRevision evita sobrescritura; locks ordenados y transacción preservan invariantes | Preparación/identidad verificadas; no acredita carreras de publicación ni último cupo |
| Proyección por audiencia | UserView, DTO académico ADMIN y selector id/name; vista pública SQL mínima de usuarios | Sin credenciales/generación en HTTP; DTO previstos de alumno/docente no son rutas existentes |

El pool compartido no demuestra Singleton; una transacción no implica Unit of Work;
createDatabase/createPasswordCredentials son funciones de construcción, sin estructura
de Factory Method por herencia. Guards/decoradores de TypeScript no prueban el patrón
Decorator. Clean Architecture es enfoque, el monolito modular es estilo y SOLID son
principios. Se evitan patrones añadidos solo para describir carpetas.

Trazabilidad: RF02/RF04 → R06–R09 → C03/C06/C08 → EQ-11; RF08/RF10 y 002 FR-015 →
R01/R05 → C05/C09/C12 → pruebas de preparación. Izipay, materiales, clases y chat
conservan adaptadores previstos sin integración acreditada.
