import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createAcademicTransaction } from '../../../infrastructure/database/academic-transaction.js';
import type { AcademicTransactionDependencies, AcademicTransactionWork } from '../../../infrastructure/database/academic-transaction.js';
import type { OfferingOperation } from '../application/offering-store.js';
import { OfferingError } from '../public/offer.js';
import type { AdminCourse, AdminGroup, CommandResult, GroupState, Revision, UUID, Slot } from '../public/offer.js';
import { offeringAudit } from './offering-audit.js';
import type { AcademicAuditWriter } from './offering-audit.js';
import type { PreparationCommand, PreparationStore, PublicationStore, LifecycleStore } from '../application/commands.js';
import { createCourse, editCourse, withdrawCourse } from '../domain/course.js';
import { assertGroupEditable, createGroup, editGroup, withdrawGroup, cancelGroup, cancellationReason } from '../domain/group.js';
import { schedulesOverlap, validateSchedule } from '../domain/schedule.js';
import { assertCoursePublication, groupVisibility, validateGroupPublication } from '../domain/visibility.js';
import type { VisibilityInput, PublicationGroup } from '../domain/visibility.js';
import type { TeacherEligibility } from '../../users/public/teaching-directory.js';
import { projectCourse, projectGroup } from './offering-queries.js';

type Resource = AdminCourse | AdminGroup;
export interface AcademicMutation<T extends Resource> {
  readonly resource: T;
  readonly result: 'APPLIED' | 'NO_CHANGE';
  readonly beforeState: GroupState | null;
  readonly beforeRevision: Revision | null;
}
/** Puerto interno de infraestructura para futuros adaptadores de comandos, no CRUD público.
 * discover/recheck incluyen padres y docentes; validate contiene las reglas específicas.
 * apply escribe el agregado; no abre transacciones ni escribe ledger/auditoría.
 * payload ya normalizado contiene toda la intención (incluido courseId al crear grupo).
 */
export interface AcademicCommandWork<T extends Resource> extends Omit<AcademicTransactionWork<AcademicMutation<T>>, 'afterAuthorization'> {
  readonly commandId: UUID;
  readonly requestId: UUID;
  readonly operation: OfferingOperation;
  readonly targetKind: 'COURSE' | 'GROUP';
  /** Para altas: UUID generado por servidor antes del intento; replay usa el del ledger. */
  readonly targetId: UUID;
  readonly expectedRevision?: Revision;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Proyección administrativa autorizada, solo por el ID suministrado, sin efectos. */
  project(client: PoolClient, targetId: UUID): Promise<T>;
}
export type AcademicCommandWriter = <T extends Resource>(work: AcademicCommandWork<T>) => Promise<CommandResult<T>>;

interface LedgerRow {
  payloadDigest: Buffer;
  targetId: UUID;
  resultingRevision: Revision;
  result: 'APPLIED' | 'NO_CHANGE';
}

/** JSON canónico: claves ordenadas recursivamente, orden de arrays conservado.
 * Rechazar valores ajenos a JSON en vez de colapsar intenciones diferentes.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  throw new TypeError('Comando interno no JSON. Valores omitidos.');
}
function digest<T extends Resource>(work: AcademicCommandWork<T>, targetId: UUID): Buffer {
  return createHash('sha256').update(canonical({ operation: work.operation, targetKind: work.targetKind,
    targetId: targetId.toLowerCase(), expectedRevision: work.expectedRevision ?? null, payload: work.payload })).digest();
}
function revision(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new TypeError('Revisión interna no válida. Valor omitido.');
  }
  return BigInt(value);
}
function checkResource(resource: Resource, kind: 'COURSE' | 'GROUP', targetId: UUID): void {
  if (resource.id.toLowerCase() !== targetId.toLowerCase() || ('courseId' in resource) !== (kind === 'GROUP')) {
    throw new TypeError('Proyección interna inconsistente. Valores omitidos.');
  }
  revision(resource.revision);
}

/** Un solo protocolo/retry budget. El lock del actor serializa su PK actor/commandId.
 * No guarda cuerpos/respuestas, no purga entradas y no reintenta un COMMIT incierto.
 * Las operaciones concretas y las consultas de audiencia se incorporan en sus historias.
 */
export function createAcademicCommandWriter(pool: Pool, authorization: AcademicTransactionDependencies,
  options: { readonly audit?: AcademicAuditWriter } = {}): AcademicCommandWriter {
  const transact = createAcademicTransaction(pool, authorization);
  const audit = options.audit ?? offeringAudit;
  return <T extends Resource>(work: AcademicCommandWork<T>): Promise<CommandResult<T>> => {
    // Estado por invocación; jamás compartir digest/proyección entre comandos concurrentes.
    let payloadDigest: Buffer;
    let before: T | undefined;
    const creating = work.operation === 'COURSE_CREATE' || work.operation === 'GROUP_CREATE';
    return transact<CommandResult<T>>({
      actor: work.actor, permission: 'academic:manage',
      discover: client => work.discover(client), recheck: (client, locked) => work.recheck(client, locked),
      async afterAuthorization(client) {
        const stored = await client.query<LedgerRow>(`SELECT "payloadDigest","targetId","resultingRevision"::text,result
          FROM "AcademicCommand" WHERE "actorUserId"=$1 AND "commandId"=$2`, [work.actor.userId, work.commandId]);
        const prior = stored.rows[0];
        // El UUID de un alta es generado por servidor, no una intención del cliente.
        // Tras pérdida de respuesta se recupera el UUID original ANTES de calcular el digest.
        payloadDigest = digest(work, creating && prior ? prior.targetId : work.targetId);
        if (!prior) return undefined;
        if (!payloadDigest.equals(prior.payloadDigest)) throw new OfferingError({ code: 'IDEMPOTENCY_CONFLICT' });
        const resource = await work.project(client, prior.targetId);
        checkResource(resource, work.targetKind, prior.targetId);
        return { value: { resource, command: { id: work.commandId, replayed: true,
          appliedRevision: prior.resultingRevision, result: prior.result } } };
      },
      async validate(client, locked) {
        before = undefined; // También al redescubrir tras un aborto conocido.
        if (creating) {
          if (work.expectedRevision !== undefined) throw new TypeError('Alta interna con revisión previa.');
        } else {
          if (work.expectedRevision === undefined) throw new TypeError('Falta revisión interna.');
          revision(work.expectedRevision);
          before = await work.project(client, work.targetId);
          checkResource(before, work.targetKind, work.targetId);
          if (before.revision !== work.expectedRevision) throw new OfferingError({ code: 'OFFERING_VERSION_CONFLICT' });
        }
        await work.validate?.(client, locked);
      },
      async apply(client) {
        const changed = await work.apply(client);
        checkResource(changed.resource, work.targetKind, work.targetId);
        const applied = revision(changed.resource.revision);
        if (changed.beforeRevision !== (before?.revision ?? null) || changed.beforeState !== (before?.state ?? null)
          || (creating ? changed.result !== 'APPLIED' || applied !== 1n
            : applied !== revision(before!.revision) + (changed.result === 'APPLIED' ? 1n : 0n))) {
          throw new TypeError('Resultado interno inconsistente. Valores omitidos.');
        }
        await client.query(`INSERT INTO "AcademicCommand"
          ("actorUserId","commandId",operation,"targetKind","targetId","payloadDigest","resultingRevision",result)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [work.actor.userId, work.commandId, work.operation, work.targetKind,
          work.targetId, payloadDigest!, changed.resource.revision, changed.result]);
        await audit.write(client, { actorUserId: work.actor.userId, resourceKind: work.targetKind,
          resourceId: work.targetId, action: work.operation, result: changed.result,
          commandId: work.commandId, requestId: work.requestId, beforeState: changed.beforeState,
          afterState: changed.resource.state, beforeRevision: changed.beforeRevision, afterRevision: changed.resource.revision });
        return { resource: changed.resource, command: { id: work.commandId, replayed: false,
          appliedRevision: changed.resource.revision, result: changed.result } };
      },
    });
  };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reference(value: string): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new OfferingError({ code: 'VALIDATION_ERROR' });
  return value.toLowerCase();
}
function keys(value: unknown, allowed: readonly string[], required = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OfferingError({ code: 'VALIDATION_ERROR' });
  const values = value as Record<string, unknown>;
  if ((required && Object.keys(values).length === 0) || Object.keys(values).some(key => !allowed.includes(key))) {
    throw new OfferingError({ code: 'VALIDATION_ERROR' });
  }
  return values;
}
const courseKeys = ['name', 'description'];
const groupKeys = ['name', 'periodStart', 'periodEnd', 'timeZone', 'capacity', 'teacherUserId'];
/** Normalizar intención, no estado persistido. Las reglas con estado se vuelven
 * a ejecutar bajo locks; no se incorpora una captura previa al digest del comando.
 */
function normalized(command: PreparationCommand): Readonly<Record<string, unknown>> {
  if (command.operation === 'GROUP_SCHEDULE') {
    validateSchedule({ timeZone: 'America/Lima', schedule: command.schedule });
    const schedule = Array.from(command.schedule, input => {
      keys(input, ['dayOfWeek', 'startTime', 'endTime']);
      return { dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime };
    }).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
    return { schedule };
  }
  const creating = command.operation === 'COURSE_CREATE' || command.operation === 'GROUP_CREATE';
  const values = keys(creating ? command.attributes : command.changes,
    command.operation.startsWith('COURSE_') ? courseKeys : groupKeys, !creating);
  const clean = command.operation.startsWith('COURSE_')
    ? createCourse('', { name: '_', ...values }) : createGroup('', '', { name: '_', ...values });
  if (creating && !Object.hasOwn(values, 'name')) throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['name'] });
  const attributes = Object.fromEntries(Object.keys(values).map(key => [key,
    key === 'teacherUserId' && values[key] !== null ? reference(values[key] as string) : clean[key as keyof typeof clean]]));
  return { ...attributes, ...(command.operation === 'GROUP_CREATE' ? { courseId: reference(command.courseId) } : {}) };
}
async function eligible(client: PoolClient, teacherUserId: string | null): Promise<void> {
  if (teacherUserId === null) return;
  const teacher = await client.query<{ eligible: boolean }>('SELECT eligible FROM "AcademicTeacherDirectory" WHERE "userId"=$1', [teacherUserId]);
  if (teacher.rows[0]?.eligible !== true) throw new OfferingError({ code: 'TEACHER_NOT_ELIGIBLE', fields: ['teacherUserId'] });
}
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** Adaptador US1 real: un único escritor/cliente/presupuesto de reintentos.
 * No implementa transiciones de tareas posteriores. SQL de actualización cerrado:
 * nunca escribe snapshots, pertenencia ni estado editorial recibido del cliente.
 */
export function createPreparationStore(pool: Pool, authorization: AcademicTransactionDependencies,
  write: AcademicCommandWriter = createAcademicCommandWriter(pool, authorization)): PreparationStore {
  return {
    async execute(actor, command, context) {
      const payload = normalized(command);
      const creating = command.operation === 'COURSE_CREATE' || command.operation === 'GROUP_CREATE';
      const course = command.operation.startsWith('COURSE_');
      const targetId = creating ? randomUUID() : reference(course && 'courseId' in command ? command.courseId
        : 'groupId' in command ? command.groupId : '');
      const commandId = reference(command.commandId); const requestId = reference(context.requestId);
      const expectedRevision = 'expectedRevision' in command ? command.expectedRevision : undefined;
      if (!creating && (typeof expectedRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(expectedRevision)
        || BigInt(expectedRevision) > 9223372036854775807n)) {
        throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['expectedRevision'] });
      }
      const discover = async (client: PoolClient) => {
        if (course) return { accountIds: [], courseIds: creating ? [] : [targetId], groupIds: [] };
        const current = creating ? undefined : (await client.query<{ courseId: string; teacherUserId: string | null }>(
          'SELECT "courseId","teacherUserId" FROM "AcademicGroup" WHERE id=$1', [targetId])).rows[0];
        return { accountIds: [current?.teacherUserId, payload.teacherUserId].filter((id): id is string => typeof id === 'string'),
          courseIds: creating && 'courseId' in command ? [reference(command.courseId)] : current ? [current.courseId] : [],
          groupIds: creating ? [] : [targetId] };
      };
      return write<Resource>({ actor, permission: 'academic:manage', commandId, requestId, operation: command.operation,
        targetKind: course ? 'COURSE' : 'GROUP', targetId, expectedRevision, payload,
        discover, recheck: client => discover(client),
        project: course ? projectCourse : projectGroup,
        async apply(client) {
          if (command.operation === 'COURSE_CREATE') {
            const next = createCourse(targetId, payload);
            await client.query('INSERT INTO "AcademicCourse" (id,name,description) VALUES ($1,$2,$3)', [targetId, next.name, next.description]);
            return { resource: await projectCourse(client, targetId), result: 'APPLIED', beforeState: null, beforeRevision: null };
          }
          if (command.operation === 'COURSE_EDIT') {
            const before = await projectCourse(client, targetId); const next = editCourse(before, payload);
            const changed = before.name !== next.name || before.description !== next.description;
            if (changed) await client.query('UPDATE "AcademicCourse" SET name=$2,description=$3,revision=revision+1 WHERE id=$1',
              [targetId, next.name, next.description]);
            return { resource: await projectCourse(client, targetId), result: changed ? 'APPLIED' : 'NO_CHANGE',
              beforeState: before.state, beforeRevision: before.revision };
          }
          if (command.operation === 'GROUP_CREATE') {
            const next = createGroup(targetId, reference(command.courseId), payload);
            await eligible(client, next.teacherUserId);
            await client.query(`INSERT INTO "AcademicGroup" (id,"courseId",name,"periodStart","periodEnd","timeZone",capacity,"teacherUserId")
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [targetId, next.courseId, next.name, next.periodStart, next.periodEnd,
              next.timeZone, next.capacity, next.teacherUserId]);
            return { resource: await projectGroup(client, targetId), result: 'APPLIED', beforeState: null, beforeRevision: null };
          }
          const before = await projectGroup(client, targetId);
          const current = { ...before, teacherUserId: before.teacher?.id ?? null };
          assertGroupEditable(current.state);
          let changed: boolean;
          if (command.operation === 'GROUP_EDIT') {
            const next = editGroup(current, payload); // Revalida todas las franjas persistidas con el periodo nuevo.
            if (Object.hasOwn(payload, 'teacherUserId')) await eligible(client, next.teacherUserId);
            changed = groupKeys.some(key => current[key as keyof typeof current] !== next[key as keyof typeof next]);
            if (changed) await client.query(`UPDATE "AcademicGroup" SET name=$2,"periodStart"=$3,"periodEnd"=$4,
              "timeZone"=$5,capacity=$6,"teacherUserId"=$7,revision=revision+1 WHERE id=$1`,
            [targetId, next.name, next.periodStart, next.periodEnd, next.timeZone, next.capacity, next.teacherUserId]);
          } else {
            const slots = payload.schedule as readonly Slot[];
            validateSchedule({ ...current, schedule: slots });
            changed = canonical(current.schedule) !== canonical(slots);
            if (changed) {
              await client.query('DELETE FROM "AcademicSlot" WHERE "groupId"=$1', [targetId]);
              for (const slot of slots) await client.query(`INSERT INTO "AcademicSlot" ("groupId","dayOfWeek","startMinute","endMinute")
                VALUES ($1,$2,$3,$4)`, [targetId, slot.dayOfWeek, minute(slot.startTime), minute(slot.endTime)]);
              await client.query('UPDATE "AcademicGroup" SET revision=revision+1 WHERE id=$1', [targetId]);
            }
          }
          return { resource: await projectGroup(client, targetId), result: changed ? 'APPLIED' : 'NO_CHANGE',
            beforeState: before.state, beforeRevision: before.revision };
        },
      });
    },
  };
}

interface PublicationRow extends Omit<PublicationGroup, 'publishedTeacherEligibilityVersion'> {
  publishedTeacherEligibilityVersion: string | null;
  courseState: AdminCourse['state'];
  directoryUserId: string | null; directoryName: string | null; eligible: boolean | null; eligibilityVersion: string | null;
}
/** Solo oferta y la interfaz SQL pública de usuarios; nunca columnas privadas de User.
 * Fechas/horas civiles, generación decimal sin pasar por number. Una consulta por lote.
 */
const publicationProjection = `SELECT g.id,g."courseId",g.name,g.state,g.capacity,g."timeZone",g."teacherUserId",
  to_char(g."periodStart",'YYYY-MM-DD') AS "periodStart",to_char(g."periodEnd",'YYYY-MM-DD') AS "periodEnd",
  g."publishedTeacherUserId",g."publishedTeacherEligibilityVersion"::text,c.state AS "courseState",
  d."userId" AS "directoryUserId",d.name AS "directoryName",d.eligible,d."eligibilityVersion"::text,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('dayOfWeek',s."dayOfWeek",
    'startTime',lpad((s."startMinute"/60)::text,2,'0')||':'||lpad((s."startMinute"%60)::text,2,'0'),
    'endTime',lpad((s."endMinute"/60)::text,2,'0')||':'||lpad((s."endMinute"%60)::text,2,'0'))
    ORDER BY s."dayOfWeek",s."startMinute",s."endMinute") FROM "AcademicSlot" s WHERE s."groupId"=g.id),'[]'::jsonb) AS schedule
  FROM "AcademicGroup" g JOIN "AcademicCourse" c ON c.id=g."courseId"
  LEFT JOIN "AcademicTeacherDirectory" d ON d."userId"=g."teacherUserId"`;
function publicationInput(row: PublicationRow): VisibilityInput {
  const teacher: TeacherEligibility | null = row.directoryUserId === null ? null : {
    userId: row.directoryUserId, name: row.directoryName!, eligible: row.eligible === true, eligibilityVersion: BigInt(row.eligibilityVersion!),
  };
  return { courseState: row.courseState, teacher, group: {
    id: row.id, courseId: row.courseId, name: row.name, state: row.state, capacity: row.capacity, periodStart: row.periodStart,
    periodEnd: row.periodEnd, timeZone: row.timeZone, teacherUserId: row.teacherUserId, schedule: row.schedule,
    publishedTeacherUserId: row.publishedTeacherUserId,
    publishedTeacherEligibilityVersion: row.publishedTeacherEligibilityVersion === null ? null : BigInt(row.publishedTeacherEligibilityVersion),
  } };
}
async function publicationInputs(client: PoolClient, ids: readonly string[]): Promise<VisibilityInput[]> {
  return (await client.query<PublicationRow>(`${publicationProjection} WHERE g.id=ANY($1::uuid[]) ORDER BY g.id`, [ids])).rows.map(publicationInput);
}
/** Sentencia NUEVA después de los locks User/Session/Course/Group del protocolo.
 * Sin locks de agregados ajenos. PUBLISHED bloquea aun con padre retirado/revisión.
 */
async function scheduleConflicts(client: PoolClient, input: VisibilityInput): Promise<string[]> {
  const rows = await client.query<PublicationRow>(`${publicationProjection}
    WHERE g."teacherUserId"=$1 AND g.state='PUBLISHED' AND g.id<>$2 ORDER BY g.id`, [input.group.teacherUserId, input.group.id]);
  return rows.rows.map(publicationInput).filter(other => schedulesOverlap(input.group, other.group)).map(other => other.group.id);
}

/** Descubrimiento compartido por publicación/retiro/cancelación; solo recursos propios.
 * Captura y asignación actuales participan en los locks, incluso sin habilitación.
 * Si cambian las referencias/conjunto, el protocolo revierte antes de redescubrir.
 */
async function editorialTopology(client: PoolClient, targetId: string, course: boolean) {
  const rows = await client.query<{ id: string; courseId: string; teacherUserId: string | null; publishedTeacherUserId: string | null }>(
    `SELECT id,"courseId","teacherUserId","publishedTeacherUserId" FROM "AcademicGroup"
     WHERE ${course ? '"courseId"=$1 AND state=\'PUBLISHED\'' : 'id=$1'} ORDER BY id`, [targetId]);
  return { accountIds: rows.rows.flatMap(row => [row.teacherUserId, row.publishedTeacherUserId]).filter((id): id is string => id !== null),
    courseIds: course ? [targetId] : rows.rows.map(row => row.courseId), groupIds: course ? rows.rows.map(row => row.id) : [targetId] };
}

/** Publicación US2 con el mismo escritor, ledger, auditoría y presupuesto transaccional.
 * No se conecta a HTTP aquí, ni implementa retiro/cancelación o lecturas de catálogo.
 */
export function createPublicationStore(pool: Pool, authorization: AcademicTransactionDependencies,
  write: AcademicCommandWriter = createAcademicCommandWriter(pool, authorization)): PublicationStore {
  return {
    async execute(actor, command, context) {
      if (command.operation !== 'COURSE_PUBLISH' && command.operation !== 'GROUP_PUBLISH') throw new OfferingError({ code: 'VALIDATION_ERROR' });
      const course = command.operation === 'COURSE_PUBLISH';
      keys(command, ['operation', 'commandId', 'expectedRevision', course ? 'courseId' : 'groupId']);
      const targetId = reference(course ? command.courseId : command.groupId);
      const commandId = reference(command.commandId), requestId = reference(context.requestId);
      const expectedRevision = command.expectedRevision;
      if (typeof expectedRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(expectedRevision) || BigInt(expectedRevision) > 9223372036854775807n) {
        throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['expectedRevision'] });
      }
      const discover = (client: PoolClient) => editorialTopology(client, targetId, course);
      return write<Resource>({ actor, permission: 'academic:manage', commandId, requestId, operation: command.operation,
        targetKind: course ? 'COURSE' : 'GROUP', targetId, expectedRevision, payload: {}, discover, recheck: client => discover(client),
        project: course ? projectCourse : projectGroup,
        async apply(client) {
          if (course) {
            const before = await projectCourse(client, targetId); assertCoursePublication(before);
            const children = await client.query<{ id: string }>('SELECT id FROM "AcademicGroup" WHERE "courseId"=$1 AND state=\'PUBLISHED\' ORDER BY id', [targetId]);
            const inputs = await publicationInputs(client, children.rows.map(row => row.id)); const blocked: string[] = [];
            for (const input of inputs) {
              try {
                validateGroupPublication(input.group, input.teacher);
                if (groupVisibility(input).teacherReviewRequired || (await scheduleConflicts(client, input)).length) blocked.push(input.group.id);
              } catch (error) {
                if (error instanceof OfferingError && ['VALIDATION_ERROR', 'TEACHER_NOT_ELIGIBLE'].includes(error.code)) blocked.push(input.group.id);
                else throw error;
              }
            }
            if (blocked.length) throw new OfferingError({ code: 'COURSE_PUBLICATION_BLOCKED', conflictingGroupIds: blocked });
            // Solo el curso: jamás renovar capturas, revisiones o estados de sus hijos.
            await client.query('UPDATE "AcademicCourse" SET state=\'PUBLISHED\',revision=revision+1 WHERE id=$1', [targetId]);
            return { resource: await projectCourse(client, targetId), result: 'APPLIED', beforeState: before.state, beforeRevision: before.revision };
          }
          const before = await projectGroup(client, targetId); assertGroupEditable(before.state);
          const input = (await publicationInputs(client, [targetId]))[0];
          if (input.courseState !== 'PUBLISHED') throw new OfferingError({ code: 'OFFERING_STATE_CONFLICT' });
          validateGroupPublication(input.group, input.teacher);
          const conflicts = await scheduleConflicts(client, input);
          if (conflicts.length) throw new OfferingError({ code: 'TEACHER_SCHEDULE_CONFLICT', conflictingGroupIds: conflicts });
          await client.query(`UPDATE "AcademicGroup" SET state='PUBLISHED',"publishedTeacherUserId"="teacherUserId",
            "publishedTeacherEligibilityVersion"=$2,revision=revision+1 WHERE id=$1`, [targetId, input.teacher!.eligibilityVersion.toString()]);
          return { resource: await projectGroup(client, targetId), result: 'APPLIED', beforeState: before.state, beforeRevision: before.revision };
        },
      });
    },
  };
}

/** US3: un cambio de estado, resultado de comando y auditoría en el mismo commit.
 * No exige habilitación docente para retirar/cancelar, ni renueva sus capturas.
 * El instante de cancelación procede de PostgreSQL dentro de esta transacción.
 */
export function createLifecycleStore(pool: Pool, authorization: AcademicTransactionDependencies,
  write: AcademicCommandWriter = createAcademicCommandWriter(pool, authorization)): LifecycleStore {
  return {
    async execute(actor, command, context) {
      if (!['COURSE_WITHDRAW', 'GROUP_WITHDRAW', 'GROUP_CANCEL'].includes(command.operation)) {
        throw new OfferingError({ code: 'VALIDATION_ERROR' });
      }
      const course = command.operation === 'COURSE_WITHDRAW';
      keys(command, ['operation', 'commandId', 'expectedRevision', course ? 'courseId' : 'groupId',
        ...(command.operation === 'GROUP_CANCEL' ? ['cancellationReason'] : [])]);
      const targetId = reference(course ? command.courseId : command.groupId);
      const commandId = reference(command.commandId), requestId = reference(context.requestId);
      const expectedRevision = command.expectedRevision;
      if (typeof expectedRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(expectedRevision) || BigInt(expectedRevision) > 9223372036854775807n) {
        throw new OfferingError({ code: 'VALIDATION_ERROR', fields: ['expectedRevision'] });
      }
      const payload = command.operation === 'GROUP_CANCEL' ? { cancellationReason: cancellationReason(command.cancellationReason) } : {};
      const discover = (client: PoolClient) => editorialTopology(client, targetId, course);
      return write<Resource>({ actor, permission: 'academic:manage', commandId, requestId, operation: command.operation,
        targetKind: course ? 'COURSE' : 'GROUP', targetId, expectedRevision, payload, discover, recheck: client => discover(client),
        project: course ? projectCourse : projectGroup,
        async apply(client) {
          if (course) {
            const before = await projectCourse(client, targetId), next = withdrawCourse(before);
            await client.query('UPDATE "AcademicCourse" SET state=$2,revision=revision+1 WHERE id=$1', [targetId, next.state]);
            return { resource: await projectCourse(client, targetId), result: 'APPLIED', beforeState: before.state, beforeRevision: before.revision };
          }
          const before = await projectGroup(client, targetId), current = { ...before, teacherUserId: before.teacher?.id ?? null };
          if (command.operation === 'GROUP_CANCEL') {
            const now = (await client.query<{ at: Date }>('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();
            const next = cancelGroup(current, { cancellationReason: payload.cancellationReason, cancelledAt: now });
            await client.query(`UPDATE "AcademicGroup" SET state=$2,"cancellationReason"=$3,"cancelledAt"=$4,revision=revision+1 WHERE id=$1`,
              [targetId, next.state, next.cancellationReason, next.cancelledAt]);
          } else {
            const next = withdrawGroup(current);
            await client.query('UPDATE "AcademicGroup" SET state=$2,revision=revision+1 WHERE id=$1', [targetId, next.state]);
          }
          return { resource: await projectGroup(client, targetId), result: 'APPLIED', beforeState: before.state, beforeRevision: before.revision };
        },
      });
    },
  };
}
