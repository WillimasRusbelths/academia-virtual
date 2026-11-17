# Modelo de datos — oferta académica

**Estado**: diseño futuro; no se ha editado schema.prisma ni aplicado SQL.
Fuentes: [spec.md](spec.md), [research.md](research.md) y
[contrato transaccional](contracts/integration.md). PA-01–PA-05 se conservan.

## Convenciones y propiedad

- UUID identifica entidades; el servidor genera referencias estables. No códigos manuales
  obligatorios, unicidad de nombres ni cambios de curso de un grupo por edición.
- Textos de nombre se recortan en extremos y deben contener al menos un carácter no
  blanco; descripción vacía se normaliza a null durante preparación. No límites de
  negocio nuevos de longitud: rige el límite técnico HTTP existente de 16 KiB.
- revision y generaciones son bigint no negativos; revision comienza en 1 y se entrega
  como cadena decimal canónica para no perder precisión JSON.
- Fechas civiles DATE sin hora/zona del navegador, serializadas YYYY-MM-DD; horas
  HH:mm, sin segundos. Instantes de auditoría timestamptz, serializados UTC.
- Todas las tablas/vista/funciones se crean en el esquema configurado, incluidos
  esquemas de prueba; ninguna referencia fija a public.
- Usuarios/identidad poseen habilitación y su generación; oferta posee estados y
  publicación académica. Infraestructura compartida coordina locks, no decide permisos.

## AcademicCourse

| Campo | Tipo / nulabilidad | Restricción y responsabilidad |
| --- | --- | --- |
| id | UUID, obligatorio | PK, generado por servidor. |
| name | text, obligatorio | No vacío tras recorte; no único. |
| description | text, nullable | Permite preparación incompleta; no vacía al publicar. |
| state | enum DRAFT/PUBLISHED/WITHDRAWN | Inicial DRAFT; sin CANCELLED de curso. |
| revision | bigint, obligatorio | Inicial 1, positivo; aumenta por cambio efectivo de datos/estado de curso. |
| createdAt / updatedAt | timestamptz, obligatorios | Metadatos internos, no reloj del cliente. |

El curso no contiene docente, capacidad, precio, matrícula o franjas.
CHECK exige descripción no vacía si state=PUBLISHED.
Crear un grupo no altera datos/revision del curso; su conjunto se vuelve a descubrir
y comprobar al republicar. Todas las mutaciones de grupos bloquean el curso para
estabilizar esa comprobación, aunque no incrementen su revision.

### Transiciones del curso

| Operación | Estado previo | Estado posterior | Condiciones / efectos |
| --- | --- | --- | --- |
| Crear | Inexistente | DRAFT | Nombre válido. |
| Editar datos | DRAFT o WITHDRAWN | Igual | Revision esperada; no altera grupos. |
| Publicar | DRAFT o WITHDRAWN | PUBLISHED | Descripción completa; revalidar todos los grupos que ya estén PUBLISHED. |
| Retirar | PUBLISHED | WITHDRAWN | Conserva grupos, estados, generaciones y programación docente. |

Ningún DELETE ni cancelación de curso. Publicar sin grupos puede preparar el curso,
pero no lo muestra al alumno hasta tener al menos un grupo visible. Esto permite luego
publicar el primer grupo sin dependencia circular.
Si cualquier grupo ya Publicado incumple integridad, horario o requiere revisión
docente, rechazar publicación del curso completa. No limpiar la revisión ni republicar
grupos implícitamente; retirarlos individualmente permite recuperar primero el curso.

## AcademicGroup

| Campo | Tipo / nulabilidad | Restricción y responsabilidad |
| --- | --- | --- |
| id | UUID, obligatorio | PK, generado por servidor. |
| courseId | UUID, obligatorio | FK AcademicCourse, ON DELETE RESTRICT; inmutable por contrato y trigger de pertenencia. |
| name | text, obligatorio | No vacío tras recorte; no único. |
| state | enum DRAFT/PUBLISHED/WITHDRAWN/CANCELLED | Inicial DRAFT; CANCELLED terminal. |
| periodStart / periodEnd | DATE, nullable | Preparación incompleta permitida; si ambos existen, inicio ≤ fin; ambos obligatorios para publicar. |
| timeZone | text, obligatorio | Siempre America/Lima; default explícito. |
| capacity | smallint, nullable | Sin configurar al crear borrador; todo valor configurado es entero 1–50. Obligatoria para publicar. |
| teacherUserId | UUID, nullable | FK User por interfaz de usuarios, ON DELETE RESTRICT; cero o uno durante preparación. |
| publishedTeacherUserId | UUID, nullable | FK User RESTRICT; última asignación confirmada al publicar. No se reemplaza al editar. |
| publishedTeacherEligibilityVersion | bigint, nullable | Generación capturada por publicación explícita del grupo. |
| cancellationReason | text, nullable | Solo administración; no vacía al cancelar, null mientras no esté cancelado. |
| cancelledAt | timestamptz, nullable | Exigida al cancelar; no usar reloj del cliente. |
| revision | bigint, obligatorio | Inicial 1; aumenta por edición efectiva, reemplazo de horario o transición. |
| createdAt / updatedAt | timestamptz, obligatorios | No son fechas de matrícula ni de inscripción. |

La omisión inicial de capacity en creación deja un borrador incompleto, no configura
una capacidad inválida. Si se envía capacity, null, vacío, fracción o fuera de rango
se rechazan; no se puede borrar una capacidad ya configurada enviando null.
Periodo puede omitirse durante preparación; si se envía se valida forma y coherencia.
La falta de información impide publicar y se muestra como «Sin configurar».

publishedTeacherUserId y publishedTeacherEligibilityVersion son ambos null o ambos
no null. Si state=PUBLISHED: periodo/capacidad/docente/snapshot son obligatorios, la
asignación coincide con publishedTeacherUserId y debe existir al menos una franja.
El CHECK local no puede verificar elegibilidad actual ni número de franjas en otra
tabla: son invariantes del agregado verificadas bajo el protocolo transaccional.

### Transiciones del grupo

| Operación | Estado previo | Estado posterior | Condiciones / efectos |
| --- | --- | --- | --- |
| Crear | Inexistente | DRAFT | Curso existente y nombre; resto puede completarse después. |
| Editar, asignar/desasignar o reemplazar franjas | DRAFT o WITHDRAWN | Igual | Revision esperada y valores válidos; snapshot de última publicación se conserva. |
| Publicar | DRAFT o WITHDRAWN | PUBLISHED | Curso PUBLISHED; integridad completa; docente elegible; sin conflicto; capturar docente/generación actual. |
| Retirar | PUBLISHED | WITHDRAWN | Conserva datos/snapshot; deja de bloquear programación. |
| Cancelar | DRAFT/PUBLISHED/WITHDRAWN | CANCELLED | Confirmación, motivo y revision; conservar datos/snapshot, dejar de bloquear programación. |
| Editar, publicar o retirar cancelado | CANCELLED | Rechazo | No reactivación ni borrado. |

Cambiar datos de un grupo Publicado se rechaza aunque el curso esté retirado:
hay que retirar también ese grupo. Los grupos DRAFT/WITHDRAWN sí pueden prepararse
bajo un curso Publicado, pues no modifican sus datos ni se publican automáticamente.

La pérdida de habilitación docente no cambia state ni revision del grupo:
cambia la generación de User; visibilidad/revisión se derivan al leer. Al corregir,
retirar si continúa Publicado, confirmar o sustituir asignación y publicar expresamente.

## AcademicSlot

| Campo | Tipo | Restricción |
| --- | --- | --- |
| id | UUID | PK; identidad de persistencia, no requerida para editar en interfaz. |
| groupId | UUID | FK AcademicGroup RESTRICT; no se mueve entre grupos. |
| dayOfWeek | smallint | Día ISO 1=lunes … 7=domingo. |
| startMinute | smallint | 0–1439 inclusive. |
| endMinute | smallint | 0–1439 inclusive; endMinute > startMinute. |

UNIQUE(groupId, dayOfWeek, startMinute, endMinute) rechaza duplicados exactos.
Reemplazar todo el conjunto en una transacción, bajo lock del grupo y revision.
Un borrador puede tener cero franjas; las enviadas deben ser válidas y no solaparse
entre sí. Si periodo completo existe, cada franja tiene al menos una ocurrencia.
Cambiar periodo vuelve a validar todas las franjas. No se crean entidades Clase.

### Regla exacta de coincidencia

Dos intervalos horarios se solapan si:
`a.startMinute < b.endMinute && b.startMinute < a.endMinute`.
La igualdad de un fin y otro inicio es adyacencia permitida.

Con día ISO d común, L=max(inicios de periodo), U=min(finales):
si L>U no hay fecha común. En otro caso,
`primera = L + ((d - isoDay(L) + 7) % 7) días`;
hay ocurrencia común si primera≤U. La misma fórmula comprueba que una franja exista
al menos una vez en su propio periodo. No expandir todas las fechas, sumar milisegundos
con zona local del host ni inferir horarios a partir del navegador.

Entre grupos: comparar solo otros grupos con state=PUBLISHED y teacherUserId igual,
incluso si el curso está WITHDRAWN o la publicación requiere revisión docente.
Retirados/Cancelados no bloquean. No comparar el grupo consigo mismo.
Los pares de franjas dentro de un mismo grupo se comprueban al guardar.
Las publicaciones/republicaciones se comprueban después de obtener locks de cuentas.

## Generación de habilitación — propiedad de usuarios/identidad

Campo futuro `User.teacherEligibilityVersion bigint NOT NULL DEFAULT 0 CHECK >=0`.

Elegible: role=TEACHER, status=ACTIVE y emailVerifiedAt no null.
No depende de sesión abierta, authVersion, contraseña o mustSetPassword.

Trigger BEFORE UPDATE de User:
- Si OLD era elegible y NEW deja de serlo: NEW.generation = OLD.generation + 1.
- En cualquier otro UPDATE ordinario: conservar OLD.generation, incluso si el
  llamante intentaba sustituirla. El servidor no acepta generación desde HTTP.
- INSERT usa 0; overflow aborta la escritura antes que reiniciar/reciclar generación.
- Cambio de acceso, incremento y revocación/auditoría de identidad se confirman o
  revierten juntos, utilizando la fila ya bloqueada por identidad.

Vista SQL pública ordinaria `AcademicTeacherDirectory`:
`userId, name, eligible, eligibilityVersion`.
No materializada, sin email, contraseñas, tokens ni estados detallados.
Usuarios es dueño del contrato; oferta no replica UserView ni consulta sus columnas
privadas. No exponer generación en DTO del alumno o docente.
La vista y el trigger se versionan en SQL de la migración; no se necesita habilitar
soporte experimental de vistas en Prisma ni añadir un segundo cliente/pool.

### Revisión persistente y visibilidad derivadas

Si hay snapshot previo, `teacherReviewRequired` es verdadero cuando la asignación
actual no coincide con publishedTeacherUserId, el docente ya no es elegible o la
generación actual difiere de publishedTeacherEligibilityVersion.
Sin snapshot previo se muestra «Sin publicar», no una publicación ya revisada.
Cambiar asignación en WITHDRAWN no borra el snapshot previo ni su trazabilidad.

Grupo visible al alumno solo cuando:
1. Curso PUBLISHED y grupo PUBLISHED.
2. Asignación actual coincide con la última publicada.
3. Docente elegible actualmente y generación capturada igual a actual.

Curso visible al alumno solo si existe al menos un grupo visible de ese curso.
No filtrar docentes/grupos privados al calcular totales o paginar.
Docente autenticado ve sus grupos asignados en cualquier estado, pero no incidencias,
motivo de cancelación o generación. Administrador ve todos y las incidencias mínimas.

Secuencia pérdida→recuperación cambia generación y no el snapshot. Sigue oculto incluso
sin consultas intermedias. Solo publicar explícitamente ese grupo captura generación
nueva. Publicar el curso no lo hace. Reset de contraseña no cambia generación.
Una lectura cuya sentencia comienza después del commit de pérdida debe ocultar;
una sentencia anterior puede finalizar con su instantánea previa.

## AcademicCommand

| Campo | Tipo | Restricción |
| --- | --- | --- |
| actorUserId / commandId | UUID | PK compuesta; actor FK User RESTRICT. |
| operation | enum cerrado | COURSE_CREATE/EDIT/PUBLISH/WITHDRAW; GROUP_CREATE/EDIT/SCHEDULE/PUBLISH/WITHDRAW/CANCEL. |
| targetKind / targetId | COURSE o GROUP / UUID | Referencia del resultado; no rutas arbitrarias. |
| payloadDigest | bytea | SHA-256 (32 bytes) del comando canónico, incluido destino y expectedRevision. |
| resultingRevision | bigint | Revision confirmada por esa operación. |
| appliedAt | timestamptz | Instante del commit lógico; no fecha de futura inscripción. |
| result | APPLIED/NO_CHANGE | Solo comandos aceptados; fallos hacen rollback y no reservan commandId. |

No cuerpos, motivos, cookies, contraseñas ni respuestas completas.
La unicidad y ledger se confirman con agregado/auditoría. Repetir mismo actor/id/payload
no duplica ni reejecuta; otro payload devuelve conflicto. El replay se reautoriza y
devuelve la proyección administrativa actual junto a resultingRevision original.

No se implementa purga automática ni caducidad de commandId en este incremento.
No reutilizar ni borrar entradas mientras puedan repetirse comandos de sus recursos;
cualquier política posterior deberá conservar la garantía de FR-015.

## AcademicAuditEvent

| Campo | Tipo / política |
| --- | --- |
| id | UUID PK. |
| actorUserId | UUID FK User RESTRICT; actor autenticado. |
| resourceKind / resourceId | COURSE/GROUP y UUID; referencia académica, no targetUserId ficticio. |
| action / result | Operación cerrada de AcademicCommand; APPLIED/NO_CHANGE. |
| commandId / requestId | UUID de comando y de intento HTTP, distintos. |
| beforeState / afterState | Estado editorial cerrado, nullable para alta; sin volcar DTO. |
| beforeRevision / afterRevision | bigint nullable/obligatorio según alta. |
| occurredAt | timestamptz UTC. |

Tabla separada de AuditEvent de identidad, cuyo contrato requiere targetUserId y acciones
de cuenta. No deformar ese contrato. Alta/edición/transición y auditoría son atómicas;
fallo de auditoría revierte mutación/ledger. Replay no crea otro hecho APPLIED.
Denegaciones e indisponibilidad se registran en el canal privado existente con nuevas
acciones/targets permitidos, sin entradas ni SQL ni motivos de cancelación.

Conservar los eventos de este incremento; la limpieza de identidad no debe borrarlos
ni asumir que tienen el mismo plazo. Retención operativa posterior se acordará sin
activar cron ni purgas nuevas.

## Restricciones, índices y concurrencia

- DB: PK/FK RESTRICT, enums, CHECK locales, rangos, pareja de snapshots, cancelación
  coherente, revision positiva y generación no negativa. Trigger de generación y
  pertenencia inmutable. Un trigger de estado protege transición terminal/publicado;
  el reemplazo de franjas comprueba y bloquea padre mediante el protocolo del adaptador.
- Aplicación + transacción: elegibilidad, existencia de franjas, no solapamiento,
  retiro previo, publicar bajo curso válido, pertenencia y revisión; no usar CHECK
  que consulte filas ajenas para fingir una garantía entre solicitudes.
- Índices: Group(courseId,state,id); Group(teacherUserId,state,id), parcial por PUBLISHED
  para la búsqueda de conflictos; Slot(groupId,dayOfWeek); PK ledger y Audit(resourceKind,
  resourceId,occurredAt). Medir planes sin reclamar mejoras ya obtenidas.
- Índices y checks no sustituyen el lock de docente. Todos los escritores del agregado
  participan; runtime no usa accesos genéricos que los omitan. Escrituras del propietario
  fuera de mantenimiento no forman parte del contrato de la aplicación.
- Padre Course bloqueado para mutaciones de grupos; descubrimiento de asignaciones
  comprobado de nuevo tras locks. Orden y rollback completos en integration.md.

## Futura migración y recuperación

Diseño para una nueva migración aditiva posterior a 0004:
columna con default 0 y trigger de generación; vista mínima; enums/tablas/índices/
checks de oferta. No crear datos académicos iniciales ni cuentas privilegiadas.
No cambiar filas User existentes salvo incorporar el default técnico; no incrementar
authVersion, revocar sesiones, restablecer SystemState o modificar migraciones aplicadas.

Verificar aplicación a BD nueva y a copia ficticia con las cuatro migraciones previas.
Conservar cuentas, hashes, versiones, sesiones, tokens, auditoría y marcador bootstrap;
verificar runtime sin DDL y funcionamiento del trigger/view en esquema aislado.
La generación de Prisma no reemplaza revisar SQL de checks/triggers/vistas.

Antes de un destino persistente: procedimiento de backup/restore existente y D13.
Backup consistente incluye generaciones, snapshots y ledger. Tras restauración,
invalidar credenciales restauradas con el procedimiento vigente y revisar decisiones
académicas/de acceso posteriores al backup antes de reabrir; la copia no puede reconstruir
cambios perdidos ni garantizar por sí sola el último estado administrativo.
No asumir downgrade ni borrar volúmenes para validar.
