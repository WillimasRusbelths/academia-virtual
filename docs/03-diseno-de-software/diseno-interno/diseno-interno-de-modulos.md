# Diseño interno de módulos vigente

Referencia de responsabilidades de código para C3/C4; el
[inventario central](../../estado-documental.md) mantiene estado y evidencia. El
[estilo](../../02-arquitectura-software/estilo-arquitectonico.md) y
[Clean Architecture](../../02-arquitectura-software/enfoque-arquitectonico.md) definen
capas y dirección de imports. Aquí se concreta la colaboración existente.

| Módulo / componente | Núcleo y entradas reales | Infraestructura y colaboración |
| --- | --- | --- |
| identity · C03 | Login/Logout, RegisterStudent, VerifyEmail, SetInitialPassword, RequestPasswordReset/ResetPassword, CreateAccount/ChangeAccess, BootstrapAdmin; reglas puras de acceso/credenciales | Almacenes SQL por caso de uso, Argon2id, tokens/sesiones opacos por huella; alta/token/entrega atómicos; hash fuera de locks. Consumo público de users/mail/authorization |
| users · C04 | Cuenta con un rol; GetMe/ListUsers/GetUser/ChangeName; UserView cerrado | user-queries/name-store, directorio mínimo TeachingDirectory; no revela secretos al selector |
| authorization · C05 | SessionLookup consume SessionRepository; permits deniega por defecto | AccessGuard/AcceptedSessionInterceptor adaptan HTTP; PostgresSessionStore de identidad se inyecta desde composición |
| mail · C06 | DeliverPending y contratos DeliveryStore/Mailer/PayloadCipher/DeliveryEligibility | SMTP, cifrado y leases/reintentos persistidos; DeliveryScheduler dentro de APP02; Mailpit en local |
| audit · C07 | Datos de eventos y atribución sin secretos | PostgresAuditWriter en mutaciones de identidad; offering-audit para recursos académicos, misma conexión del comando |
| academic-offering · C12 | PreparationCommands y AdministrativeQueries; course/group/schedule puros; contratos y DTO por audiencia | createPreparationStore/createAdministrativeQueries, escritor/ledger, auditoría y transacciones; diez rutas ADMIN; cliente y formularios en web |

No se obliga a cada responsabilidad a tener una clase o un módulo Nest. Funciones y
tipos estructurales expresan reglas/puertos. Sesión, permiso y habilitación docente son
controles diferentes: autorizar ADMIN no habilita al docente asignado.

## Oferta e identidad mediante interfaces públicas

[TeachingDirectory](../../../apps/api/src/modules/users/public/teaching-directory.ts)
declara TeacherSummary (userId/name) y TeacherEligibility (eligible/eligibilityVersion
internas). El selector HTTP devuelve solo id/name. La vista SQL pública
`AcademicTeacherDirectory`, propiedad de usuarios, permite JOIN en una sola instantánea.
Oferta no lee correo/hash/credenciales ni importa infraestructura de identidad.

[AppModule](../../../apps/api/src/app.module.ts) crea un pool y PostgresSessionStore,
inyecta su método revalidateInTransaction como capacidad estructural de infraestructura,
el directorio y los adaptadores de oferta. El contrato público SessionRepository sigue
con lookup/accept/revoke, sin pg/Nest. Los locks físicos User los conoce
[account-locks](../../../apps/api/src/infrastructure/database/account-locks.ts), no el
núcleo académico. No hay RPC ni dependencia circular identidad → oferta.

El trigger de migración 0005 incrementa `teacherEligibilityVersion` solo al perder
habilitación; recuperar/nombre/reset no la incrementan. No escribe grupos. Las futuras
capturas de publicación deberán compararla; la preparación actual preserva snapshots
y comprueba docente elegible bajo locks, pero no ofrece publicación/visibilidad alumno.

## Escritura de preparación existente

1. React retiene intención inmutable con commandId, atributos y revisión esperada;
   un reintento manual idéntico conserva ID; cambiar intención crea otro. No hay replay
   automático al iniciar sesión ni almacenamiento de formularios en storage.
2. AcademicAdminController valida forma/DTO y permiso `academic:manage` con guard
   existente. PreparationCommands coordina la capacidad atómica de preparación.
3. Infraestructura descubre cuentas en cada intento y bloquea User ordenados → Session
   (reautorización) → Course → Group; conserva padre y revalida conjunto bajo locks.
   Oferta no adquiere SystemState. Revisión obsoleta rechaza sin sobrescribir.
4. Reglas puras validan curso/grupo/calendario; SQL comprueba directorio docente.
   Escritor confirma agregado/franjas, ledger y auditoría en la misma transacción.
   Fallo de auditoría revierte todo; replay se consulta después de reautorizar.
5. Devuelve proyección actual y appliedRevision original ante replay. Resultado incierto
   conserva intención y pide comprobación/reintento manual; no promete «no aplicado».

AcademicTransaction reutiliza accountTransaction una vez: tres intentos totales
compartidos para abortos conocidos/cambio de conjunto, con rollback confirmado; ningún
replay automático de COMMIT ambiguo. Es un protocolo existente, no prueba de las futuras
carreras de publicación o matrícula. Véanse [contrato de integración](../../../specs/002-oferta-academica/contracts/integration.md)
y [evidencia T014](../../../specs/002-oferta-academica/evidence/t014.md).

Las lecturas administrativas usan proyecciones cerradas, conteo y página coherentes,
sin N+1; aceptación primaria de sesión antes de entregar. Errores no se presentan como
listas vacías. Las revisiones bigint viajan como cadena decimal, no number inseguro.

## Modelo y límites de negocio

Las [reglas PA-01–PA-05 y su estado](../../estado-documental.md#reglas-de-oferta-y-alcance-actual)
son referencia única para curso/grupo, horarios, capacidad y habilitación. Las cinco
entidades académicas son AcademicCourse, AcademicGroup, AcademicSlot, AcademicCommand y
AcademicAuditEvent; no Enrollment/Occupancy. No son cinco módulos ni cinco servicios.
Capacidad no calcula plazas libres ni autoriza materiales/video. Estados SQL y fixtures
no equivalen a comandos publish/withdraw/cancel. T030 y T031–T074 siguen pendientes.

## Evidencia y trazabilidad

HU01–HU07/RF01–RF09 → 001 US1–US7/FR-001–033 → C03–C08/C11 →
[aceptación preliminar](../../../specs/001-identidad-acceso-roles/evidence/acceptance.md).
HU08/HU09/RF10 → 002 US1–US4/FR-001–016 → C12/C04/C05/C09 →
[T023](../../../specs/002-oferta-academica/evidence/t023.md),
[T026/T027](../../../specs/002-oferta-academica/evidence/t026-t027.md) y
[T028/T029](../../../specs/002-oferta-academica/evidence/t028-t029.md).
AC04/AC06, DA01/DA07/DA09 y R01/R02/R03/R05 explican separación y controles.
Las suites prueban el alcance registrado, sin aceptación humana integral ni capacidad.
