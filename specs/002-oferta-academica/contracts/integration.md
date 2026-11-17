# Contrato de integración, capas y concurrencia

**Estado**: diseño a implementar. Complementa [api.md](api.md),
[modelo](../data-model.md) y [plan](../plan.md). Sin código ni SQL ejecutados.

## Superficies y dirección de dependencias

| Dueño | Superficie prevista | Consumidor / semántica |
| --- | --- | --- |
| autorización | `authorization/public/session.ts`: SessionActor, Permission, ACCESS_POLICY, errores | Entradas/aplicación académicas. Cookie/sesión se resuelven por guard existente. |
| usuarios | `users/public/teaching-directory.ts`: TeacherSummary, TeacherEligibility y contrato de directorio | Tipos/capacidades mínimas; sin UserView, pg, Nest o imports de internos. |
| usuarios/persistencia | Vista SQL AcademicTeacherDirectory: userId/name/eligible/eligibilityVersion | Adaptadores académicos pueden hacer JOIN contra esta superficie pública en la misma sentencia. Es contrato de datos, no una tabla privada copiada. |
| oferta | `academic-offering/public/offer.ts` | Vistas y errores académicos seguros; no expone PoolClient ni servicios internos. |
| oferta/aplicación | OfferingStore (comandos/consultas) | Casos de uso invocan una capacidad atómica; no BEGIN/SQL ni RPC entre módulos. |
| infraestructura compartida | AccountLocks y AcademicTransactionDependencies con PoolClient | Solo adaptadores y AppModule; coordinan cuentas y llaman revalidateInTransaction existente. |
| composición | `app.module.ts` | Instancia adaptadores de identidad/usuarios/oferta con un único pool e inyecta capacidades, sin ciclos entre módulos funcionales. |

Permisos nuevos:
- academic:manage → ADMIN.
- academic:read-published → ADMIN o STUDENT.
- academic:read-own → TEACHER.
Mantener profile:read y users:manage sin cambios; desconocido siempre falso.
Un docente no puede usar la ruta de catálogo general para ampliar su lectura:
su ruta de grupos propios devuelve también el contexto del curso autorizado.

El tipo transaccional pg permanece en
`infrastructure/database/academic-transaction.ts`, equivalente al patrón estructural
existente AccountMutationDependencies. No se añade revalidateInTransaction a
SessionRepository: este sigue siendo el contrato puro de lookup/accept/revoke.
Se inyecta el método ya existente de PostgresSessionStore desde la raíz.

La proyección SQL es ordinaria y propiedad de usuarios, con nombre/esquema controlados.
Debe evolucionar junto a usuarios; oferta no consulta email, passwordHash ni el resto
de User. Los locks físicos de cuentas pertenecen a infraestructura compartida:
solo `account-locks.ts` conoce la tabla User para bloquear IDs, sin decidir elegibilidad.

## Lecturas y límite temporal de visibilidad

1. AccessGuard autentica y comprueba permiso global.
2. Una sentencia parametrizada une curso/grupo, franjas y directorio mínimo bajo la
   misma instantánea; aplica filtro de audiencia antes de conteo/paginación.
3. Alumno: padre e hijo PUBLISHED, docente elegible y snapshot de docente/generación
   coincidente. No se limpia ninguna marca ni se modifica estado mediante GET.
4. Docente: teacherUserId=actor.userId, cualquier estado; no grupos hermanos ajenos,
   motivos de cancelación, flags de revisión, email ni generación.
5. Administrador: todos, con información mínima de elegibilidad/revisión.
6. AcceptedSessionInterceptor revalida/acepta sesión antes de entregar el resultado.

No hacer primero una consulta de elegibilidad y después otra con pool.query independiente:
una reactivación intermedia podría mezclar datos viejos. Proyección con JSON agregado
para franjas y conteo por la misma sentencia, sin consultas por docente/grupo.

La instantánea de una consulta iniciada después del commit de pérdida de habilitación
debe ocultar el grupo. Una ya iniciada antes puede terminar con su vista anterior;
no hay revocación de bytes ya entregados ni WebSocket. Revalidar sesión del actor no
sustituye el filtro de habilitación del docente del grupo.

## Orden de locks para comandos

Identidad ya usa SystemState → User ordenados → Session → ActionToken → MailDelivery.
Oferta conserva una extensión compatible; **nunca adquiere SystemState**:

1. Validar forma de comando/IDs sin tomar decisiones con un snapshot previo. El
   descubrimiento de cuentas no se conserva entre intentos transaccionales.
2. Abrir transacción con un PoolClient, READ COMMITTED y lock_timeout existente 3 s.
   Dentro del callback de ese intento, descubrir destino, curso, grupos y docentes
   relevantes: actor, docente anterior/nuevo y, al publicar curso, docentes de todos
   sus grupos PUBLISHED. Este descubrimiento no es autorización ni resultado público.
3. Bloquear User de todos esos IDs de una vez en orden UUID mediante FOR UPDATE.
   Incluir actor aunque no sea docente. No usar FOR KEY SHARE: no protege cambios
   de rol/estado no clave. Los IDs se validan antes; no interpolarlos en SQL.
4. Llamar revalidateInTransaction(actor, permiso), que toma sesión y vuelve a verificar
   habilitación, rol, authVersion y expiración. El User del actor ya estaba bloqueado.
5. Comprobar ledger por actor/commandId, después de autorizar. Un replay idéntico no
   ejecuta los pasos de mutación y devuelve la proyección administrativa actual.
6. Bloquear Course y Group necesarios en orden (primero cursos, luego grupos por UUID).
   Para crear, bloquear solo padre existente; no se simula un lock de fila inexistente.
   El User del actor serializa comandos repetidos del mismo actor.
7. Volver a leer asignaciones, conjunto de hijos PUBLISHED, estados y revisiones.
   Si se descubre una cuenta que no fue bloqueada, hacer rollback y reiniciar desde
   descubrimiento; no adquirir nuevos User mientras se sostienen Course/Group.
8. expectedRevision obsoleta → conflicto, sin sobrescribir. Estado/editabilidad,
   integridad de franjas y directorio se evalúan ya bajo estos locks.
9. Consultar conflictos docentes en **sentencia posterior** a los locks; incluir
   otros grupos PUBLISHED aunque curso retirado o revisión requerida.
10. Escribir agregado/franjas/revision y, si publica grupo, nueva captura docente.
    Insertar ledger y auditoría en la misma transacción; confirmar.
11. Solo entonces responder. Interceptor mantiene aceptación de sesión como en identidad;
    una pérdida posterior de acceso puede suprimir respuesta aunque el comando ya esté
    aplicado: recuperarlo con commandId, nunca repetir efectos automáticamente.

La búsqueda de conflictos no toma locks de Course/Group ajenos: el User del docente
ya serializa todas sus mutaciones relevantes, también retiro/cancelación/asignación.
Tomar locks adicionales de otros cursos mientras se sostiene el propio crearía ciclos.
Todos los escritores de horarios/asignación/estado usan este protocolo; no un CRUD genérico.

Cada mutación de grupo toma el Course padre, incluso crear o reemplazar horarios:
el conjunto queda estable durante republicación del curso. Descubrir y luego bloquear
el padre exige comprobar otra vez el conjunto; el descubrimiento previo no es autorización.

### Aborto y reintentos

Reutilizar accountTransaction: hasta dos reintentos tras aborto conocido y rollback
confirmado (40001/40P01), pausa existente 5–25 ms; jamás reintentar COMMIT ambiguo.
AcademicTransaction llama una sola vez a accountTransaction; el descubrimiento está
dentro de su callback y se repite desde cero en cada intento. Un cambio de conjunto
lanza una señal privada de infraestructura AcademicTopologyChanged con
transactionAborted=true, no incluida en preserve(error). El helper actual hace
ROLLBACK, confirma ese rollback y consume uno de sus mismos reintentos existentes.
No hay bucle exterior ni presupuesto adicional: máximo tres intentos completos por
comando, compartidos entre cambios de conjunto, 40001 y 40P01. No se modifica el
comportamiento de identidad. Si persiste contención/cambio de conjunto → 503 seguro.

No convertir timeout/deadlock/caída en un falso conflicto de horario.
Los errores de negocio/versiones se preservan; 503 no afirma «no aplicado» si commit
fue ambiguo. La interfaz conserva commandId/payload y exige comprobación/reintento manual.

## Programación e intercalados exigidos

| Carrera | Orden observable y resultado exigido |
| --- | --- |
| Dos administradores distintos publican al mismo docente | Una espera al User docente. Nueva sentencia tras recibir lock observa primer commit: un éxito y un 409 por solapamiento. |
| Publicaciones de docentes distintos | Sin mutex global; ambas pueden publicar si el resto es válido. El actor o curso compartido puede serializar por seguridad del agregado. |
| Publicación primero, desactivación después | Publica captura generación g; cambio de acceso incrementa a g+1 y revoca sesiones en su propia transacción; nuevas consultas de alumno ocultan. |
| Desactivación primero | Publicación espera y luego lee no elegible, rechaza sin aplicar. |
| Pérdida y recuperación antes de publicar | El grupo antiguo sigue con g; una nueva publicación explícita válida captura g+1, respetando retiro previo. Ninguna reactivación actualiza grupos. |
| Dos cursos con docentes cruzados | Todos los User se bloquean en mismo orden UUID; no adquirir un docente nuevo tras curso. |
| Republicación de curso versus creación/edición de grupo | Parent lock estabiliza conjunto; si descubrimiento quedó viejo, abortar/redescubrir antes de aplicar. |
| Retirar curso versus publicar grupo | Parent lock decide orden; si retiro confirmó primero, publicar grupo falla por padre retirado. |
| Retirar/cancelar grupo versus otra publicación | Mismo User docente serializa; el nuevo estado confirmado define si sigue bloqueando. |
| Reset de contraseña de docente | authVersion/sesiones siguen identidad; generación docente no cambia y no se oculta oferta por ese motivo. |

Una CTE que adquiere lock y busca conflictos con la misma instantánea no cumple el
protocolo READ COMMITTED. La nueva sentencia posterior al lock es obligatoria.

## Publicación y revisión: separación de responsabilidades

- El trigger de User incrementa solo generación de pérdida; no escribe grupos.
- Guardar/retirar/cancelar conserva último snapshot de grupo.
- Publicar grupo requiere docente vigente bajo lock, asigna snapshot actual y cambia
  estado de borrador/retirado a publicado. Es la única operación que confirma su revisión.
- Publicar curso valida sus grupos ya Publicados sin renovar snapshots. Si hay un grupo
  pendiente de revisión, devolver COURSE_PUBLICATION_BLOCKED con referencias solo al
  administrador y conservar curso retirado.
- Para recuperar ese caso: retirar los grupos afectados, publicar curso válido,
  confirmar/sustituir asignaciones y publicar cada grupo. Cancelados nunca se recuperan.
- Un grupo Publicado oculto por revisión sigue bloqueando agenda de su docente hasta
  retiro/cancelación, pues bloqueo y visibilidad tienen condiciones diferentes en PA-05.

## Auditoría y privacidad

No usar AuditEvent de identidad con curso como targetUserId.
Ofertar un AcademicAuditWriter propio con tabla académica y misma conexión.
Su fallo revierte negocio/ledger; no tragar error y responder éxito.

SafeErrorFilter y SecurityEvents necesitan allowlists de recursos académicos y códigos
de contrato. No registrar cuerpo, nombres/descripciones/motivos, cookies, enlaces,
secretos, directorio completo, SQL o causas del driver. El requestId se genera por
intento, el commandId se identifica aparte. Respuestas y contadores se proyectan
después de autorización, no se filtran en frontend.

## Puertas futuras de integración

- Las pruebas de imports siguen siendo obligatorias; dominio/aplicación/public sin pg/Nest.
- Migración/trigger y estados se prueban con PostgreSQL real y runtime sin DDL.
- Barreras de carreras desde una conexión observadora independiente; no sleeps como
  única evidencia ni auto-reintentos del test que escondan fallos.
- No activar oferta sin estas pruebas y regresión de identidad afectada.
