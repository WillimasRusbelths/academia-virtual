import { ApiFailure } from '../../shared/api-client';
import type { ApiClient } from '../../shared/api-client';

export type CourseState = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
export type GroupState = CourseState | 'CANCELLED';
export interface Slot { readonly dayOfWeek: number; readonly startTime: string; readonly endTime: string }
export interface AdminCourse {
  readonly id: string; readonly name: string; readonly description: string | null; readonly state: CourseState;
  readonly revision: string; readonly studentVisible: boolean; readonly createdAt: string; readonly updatedAt: string;
}
export interface AdminGroup {
  readonly id: string; readonly courseId: string; readonly name: string; readonly description: string | null; readonly state: GroupState; readonly revision: string;
  readonly periodStart: string | null; readonly periodEnd: string | null; readonly timeZone: 'America/Lima';
  readonly capacity: number | null; readonly occupancy: null; readonly availability: null; readonly capacityStatus: 'NOT_CALCULATED';
  readonly schedule: readonly Slot[]; readonly teacher: { readonly id: string; readonly name: string; readonly eligible: boolean } | null;
  readonly teacherReviewRequired: boolean; readonly studentVisible: boolean; readonly cancellationReason: string | null;
  readonly cancelledAt: string | null; readonly lastPublishedTeacherId: string | null; readonly createdAt: string; readonly updatedAt: string;
}
export interface TeacherCandidate { readonly id: string; readonly name: string }
export interface CatalogCourse { readonly id: string; readonly name: string; readonly description: string }
export interface CatalogGroup {
  readonly id: string; readonly courseId: string; readonly name: string; readonly periodStart: string; readonly periodEnd: string;
  readonly timeZone: 'America/Lima'; readonly capacity: number; readonly occupancy: null; readonly availability: null;
  readonly capacityStatus: 'NOT_CALCULATED'; readonly schedule: readonly Slot[]; readonly teacher: { readonly name: string };
}
export interface TeachingGroup {
  readonly id: string; readonly course: { readonly id: string; readonly name: string; readonly description: string | null };
  readonly name: string; readonly state: GroupState; readonly periodStart: string | null; readonly periodEnd: string | null;
  readonly timeZone: 'America/Lima'; readonly capacity: number | null; readonly occupancy: null; readonly availability: null;
  readonly capacityStatus: 'NOT_CALCULATED'; readonly schedule: readonly Slot[]; readonly teacher: { readonly name: string };
}
export interface Page<T> { readonly items: readonly T[]; readonly page: number; readonly pageSize: number; readonly total: number }
export interface NameFilters { readonly q?: string; readonly page?: number; readonly pageSize?: number }
export interface CourseFilters extends NameFilters { readonly state?: CourseState }
export interface GroupFilters extends NameFilters { readonly state?: GroupState }
export interface CourseAttributes { readonly name: string; readonly description?: string | null }
export interface GroupAttributes {
  readonly name: string; readonly description?: string | null; readonly periodStart?: string; readonly periodEnd?: string; readonly timeZone?: 'America/Lima';
  readonly capacity?: number; readonly teacherUserId?: string | null;
}
export interface CommandResult<T> {
  readonly resource: T;
  readonly command: { readonly id: string; readonly replayed: boolean; readonly appliedRevision: string; readonly result: 'APPLIED' | 'NO_CHANGE' };
}
/** Retener esta intención en memoria hasta resolver el resultado. send nunca se
 * invoca automáticamente: un reintento manual conserva UUID/payload; otra preparación
 * crea otro UUID. No es una reserva ni persiste al recargar o volver a iniciar sesión.
 */
export interface PreparedCommand<T> { readonly commandId: string; send(signal?: AbortSignal): Promise<CommandResult<T>> }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function unavailable(): never { throw new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'No se pudo confirmar la oferta. Comprueba el estado antes de reintentar manualmente.'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return unavailable();
  return row;
}
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const name = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value === value.trim();
const revision = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value)
  && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function slot(value: unknown): Slot {
  const row = object(value, ['dayOfWeek', 'startTime', 'endTime']);
  const time = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!Number.isInteger(row.dayOfWeek) || Number(row.dayOfWeek) < 1 || Number(row.dayOfWeek) > 7
    || !time(row.startTime) || !time(row.endTime) || row.startTime >= row.endTime) return unavailable();
  return Object.freeze({ dayOfWeek: row.dayOfWeek as number, startTime: row.startTime, endTime: row.endTime });
}
function readCourse(value: unknown): AdminCourse {
  const row = object(value, ['id','name','description','state','revision','studentVisible','createdAt','updatedAt']);
  if (!isUuid(row.id) || !name(row.name) || !(row.description === null || name(row.description))
    || typeof row.state !== 'string' || !['DRAFT','PUBLISHED','WITHDRAWN'].includes(row.state) || !revision(row.revision)
    || typeof row.studentVisible !== 'boolean' || !instant(row.createdAt) || !instant(row.updatedAt)) return unavailable();
  return Object.freeze({ ...row }) as unknown as AdminCourse;
}
function readGroup(value: unknown): AdminGroup {
  const row = object(value, ['id','courseId','name','description','state','revision','periodStart','periodEnd','timeZone','capacity','occupancy','availability',
    'capacityStatus','schedule','teacher','teacherReviewRequired','studentVisible','cancellationReason','cancelledAt','lastPublishedTeacherId','createdAt','updatedAt']);
  if (!isUuid(row.id) || !isUuid(row.courseId) || !name(row.name) || !(row.description === null || name(row.description)) || typeof row.state !== 'string' || !['DRAFT','PUBLISHED','WITHDRAWN','CANCELLED'].includes(row.state)
    || !revision(row.revision) || !(row.periodStart === null || date(row.periodStart)) || !(row.periodEnd === null || date(row.periodEnd))
    || row.timeZone !== 'America/Lima' || !(row.capacity === null || (typeof row.capacity === 'number' && Number.isInteger(row.capacity) && row.capacity >= 1 && row.capacity <= 50))
    || row.occupancy !== null || row.availability !== null || row.capacityStatus !== 'NOT_CALCULATED' || !Array.isArray(row.schedule)
    || typeof row.teacherReviewRequired !== 'boolean' || typeof row.studentVisible !== 'boolean'
    || !(row.cancellationReason === null || name(row.cancellationReason)) || !(row.cancelledAt === null || instant(row.cancelledAt))
    || !(row.lastPublishedTeacherId === null || isUuid(row.lastPublishedTeacherId)) || !instant(row.createdAt) || !instant(row.updatedAt)) return unavailable();
  const teacher = row.teacher === null ? null : object(row.teacher, ['id','name','eligible']);
  if (teacher && (!isUuid(teacher.id) || !name(teacher.name) || typeof teacher.eligible !== 'boolean')) return unavailable();
  return Object.freeze({ ...row, schedule: Object.freeze(Array.from(row.schedule, slot)), teacher: teacher ? Object.freeze({ ...teacher }) : null }) as unknown as AdminGroup;
}
function candidate(value: unknown): TeacherCandidate {
  const row = object(value, ['id','name']);
  if (!isUuid(row.id) || !name(row.name)) return unavailable();
  return Object.freeze({ id: row.id, name: row.name });
}
function catalogCourse(value: unknown): CatalogCourse {
  const row = object(value, ['id','name','description']);
  if (!isUuid(row.id) || !name(row.name) || !name(row.description)) return unavailable();
  return Object.freeze({ ...row }) as unknown as CatalogCourse;
}
function catalogGroup(value: unknown): CatalogGroup {
  const row = object(value, ['id','courseId','name','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher']);
  if (!isUuid(row.id) || !isUuid(row.courseId) || !name(row.name) || !date(row.periodStart) || !date(row.periodEnd)
    || row.periodStart > row.periodEnd || row.timeZone !== 'America/Lima' || !Number.isInteger(row.capacity)
    || Number(row.capacity) < 1 || Number(row.capacity) > 50 || row.occupancy !== null || row.availability !== null
    || row.capacityStatus !== 'NOT_CALCULATED' || !Array.isArray(row.schedule) || !row.schedule.length) return unavailable();
  const teacher = object(row.teacher, ['name']); if (!name(teacher.name)) return unavailable();
  return Object.freeze({ ...row, teacher: Object.freeze({ name: teacher.name }), schedule: Object.freeze(Array.from(row.schedule, slot)) }) as unknown as CatalogGroup;
}
function page<T>(value: unknown, decode: (value: unknown) => T): Page<T> {
  const row = object(value, ['items','page','pageSize','total']);
  if (!Array.isArray(row.items) || !Number.isSafeInteger(row.page) || Number(row.page) < 1 || !Number.isSafeInteger(row.pageSize)
    || Number(row.pageSize) < 1 || Number(row.pageSize) > 50 || !Number.isSafeInteger(row.total) || Number(row.total) < 0
    || row.items.length > Number(row.pageSize) || row.items.length > Number(row.total)) return unavailable();
  return Object.freeze({ items: Object.freeze(Array.from(row.items, decode)), page: row.page as number, pageSize: row.pageSize as number, total: row.total as number });
}
function teachingGroup(value: unknown): TeachingGroup {
  const row = object(value, ['id','course','name','state','periodStart','periodEnd','timeZone','capacity','occupancy','availability','capacityStatus','schedule','teacher']);
  const course = object(row.course, ['id','name','description']), teacher = object(row.teacher, ['name']);
  if (!isUuid(row.id) || !isUuid(course.id) || !name(course.name) || !(course.description === null || name(course.description))
    || !name(row.name) || typeof row.state !== 'string' || !['DRAFT','PUBLISHED','WITHDRAWN','CANCELLED'].includes(row.state)
    || !(row.periodStart === null || date(row.periodStart)) || !(row.periodEnd === null || date(row.periodEnd))
    || (typeof row.periodStart === 'string' && typeof row.periodEnd === 'string' && row.periodStart > row.periodEnd)
    || row.timeZone !== 'America/Lima' || !(row.capacity === null || (Number.isInteger(row.capacity) && Number(row.capacity) >= 1 && Number(row.capacity) <= 50))
    || row.occupancy !== null || row.availability !== null || row.capacityStatus !== 'NOT_CALCULATED' || !Array.isArray(row.schedule) || !name(teacher.name)) return unavailable();
  return Object.freeze({ ...row, course: Object.freeze({ ...course }), teacher: Object.freeze({ ...teacher }),
    schedule: Object.freeze(Array.from(row.schedule, slot)) }) as unknown as TeachingGroup;
}
function path(id: string, kind: 'courses' | 'groups') {
  if (!isUuid(id)) return unavailable();
  return `/admin/academic/${kind}/${id.toLowerCase()}`;
}
/** Copia cerrada: rechaza atributos técnicos y secretos ajenos al contrato. */
function attributes(value: object, allowed: readonly string[], requiredName = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !allowed.includes(key)) || Object.keys(row).length === 0 || (requiredName && typeof row.name !== 'string')) return unavailable();
  const copy: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(row)) {
    if (input === undefined) continue;
    if (!(typeof input === 'string' || typeof input === 'number' || input === null) || (typeof input === 'number' && !Number.isFinite(input))) return unavailable();
    copy[key] = input;
  }
  if (!Object.keys(copy).length) return unavailable();
  return Object.freeze(copy);
}
/** Contratos propios de la feature, sin importar backend u otras features. */
export function academicOfferingApi(api: ApiClient) {
  function prepare<T>(target: string, method: 'POST' | 'PATCH' | 'PUT', data: Readonly<Record<string, unknown>>,
    decode: (value: unknown) => T, expectedRevision?: string): PreparedCommand<T> {
    if (expectedRevision !== undefined && !revision(expectedRevision)) return unavailable();
    const commandId = crypto.randomUUID();
    const body = Object.freeze({ commandId, ...(expectedRevision === undefined ? {} : { expectedRevision }), ...data });
    return Object.freeze({ commandId, async send(signal?: AbortSignal) {
      const row = object(await api.request(target, { method, body, signal }), ['resource','command']);
      const command = object(row.command, ['id','replayed','appliedRevision','result']);
      if (command.id !== commandId || typeof command.replayed !== 'boolean' || !revision(command.appliedRevision)
        || typeof command.result !== 'string' || !['APPLIED','NO_CHANGE'].includes(command.result)) return unavailable();
      return Object.freeze({ resource: decode(row.resource), command: Object.freeze({ ...command }) }) as unknown as CommandResult<T>;
    } });
  }
  const courseFields = ['name','description']; const groupFields = ['name','description','periodStart','periodEnd','timeZone','capacity','teacherUserId'];
  return {
    async teachingGroups(filters: Pick<NameFilters, 'page' | 'pageSize'> = {}, signal?: AbortSignal) {
      return page(await api.request('/teaching/groups', { query: { ...filters }, signal }), teachingGroup);
    },
    async teachingGroup(id: string, signal?: AbortSignal) {
      if (!isUuid(id)) return unavailable();
      const value = teachingGroup(await api.request(`/teaching/groups/${id.toLowerCase()}`, { signal }));
      if (value.id !== id.toLowerCase()) return unavailable(); return value;
    },
    async catalog(filters: NameFilters = {}, signal?: AbortSignal) { return page(await api.request('/academic/courses', { query: { ...filters }, signal }), catalogCourse); },
    async catalogCourse(id: string, signal?: AbortSignal) { return catalogCourse(await api.request(path(id, 'courses').replace('/admin', ''), { signal })); },
    async catalogGroups(id: string, filters: Pick<NameFilters, 'page' | 'pageSize'> = {}, signal?: AbortSignal) {
      return page(await api.request(path(id, 'courses').replace('/admin', '') + '/groups', { query: { ...filters }, signal }), catalogGroup);
    },
    async catalogGroup(courseId: string, id: string, signal?: AbortSignal) {
      const value = catalogGroup(await api.request(path(courseId, 'courses').replace('/admin', '') + '/groups/' + path(id, 'groups').split('/').pop(), { signal }));
      if (value.courseId !== courseId.toLowerCase() || value.id !== id.toLowerCase()) return unavailable(); return value;
    },
    async courses(filters: CourseFilters = {}, signal?: AbortSignal) { return page(await api.request('/admin/academic/courses', { query: { ...filters }, signal }), readCourse); },
    async course(id: string, signal?: AbortSignal) { return readCourse(await api.request(path(id, 'courses'), { signal })); },
    async groups(courseId: string, filters: GroupFilters = {}, signal?: AbortSignal) { return page(await api.request(path(courseId, 'courses') + '/groups', { query: { ...filters }, signal }), readGroup); },
    async group(id: string, signal?: AbortSignal) { return readGroup(await api.request(path(id, 'groups'), { signal })); },
    async teachers(filters: NameFilters = {}, signal?: AbortSignal) { return page(await api.request('/admin/academic/teachers', { query: { ...filters }, signal }), candidate); },
    prepareCourse(input: CourseAttributes) { return prepare('/admin/academic/courses', 'POST', attributes(input, courseFields, true), readCourse); },
    prepareCourseEdit(id: string, expectedRevision: string, changes: Partial<CourseAttributes>) { return prepare(path(id, 'courses'), 'PATCH', attributes(changes, courseFields), readCourse, expectedRevision); },
    prepareCoursePublication(id: string, expectedRevision: string) { return prepare(path(id, 'courses') + '/publish', 'POST', {}, readCourse, expectedRevision); },
    prepareGroupPublication(id: string, expectedRevision: string) { return prepare(path(id, 'groups') + '/publish', 'POST', {}, readGroup, expectedRevision); },
    prepareCourseWithdrawal(id: string, expectedRevision: string) { return prepare(path(id, 'courses') + '/withdraw', 'POST', {}, readCourse, expectedRevision); },
    prepareGroupWithdrawal(id: string, expectedRevision: string) { return prepare(path(id, 'groups') + '/withdraw', 'POST', {}, readGroup, expectedRevision); },
    prepareGroupCancellation(id: string, expectedRevision: string, cancellationReason: string) {
      if (typeof cancellationReason !== 'string' || !cancellationReason.trim()) return unavailable();
      return prepare(path(id, 'groups') + '/cancel', 'POST', { cancellationReason: cancellationReason.trim() }, readGroup, expectedRevision);
    },
    prepareGroup(courseId: string, input: GroupAttributes) { return prepare(path(courseId, 'courses') + '/groups', 'POST', attributes(input, groupFields, true), readGroup); },
    prepareGroupEdit(id: string, expectedRevision: string, changes: Partial<GroupAttributes>) { return prepare(path(id, 'groups'), 'PATCH', attributes(changes, groupFields), readGroup, expectedRevision); },
    prepareSchedule(id: string, expectedRevision: string, schedule: readonly Slot[]) {
      if (!Array.isArray(schedule)) return unavailable();
      return prepare(path(id, 'groups') + '/schedule', 'PUT', { schedule: Object.freeze(Array.from(schedule, slot)) }, readGroup, expectedRevision);
    },
  };
}
