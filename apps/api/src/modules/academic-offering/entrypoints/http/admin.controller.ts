import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { ACADEMIC_PREPARATION_COMMANDS, ACADEMIC_PUBLICATION_COMMANDS, ACADEMIC_LIFECYCLE_COMMANDS } from '../../application/commands.js';
import type { PreparationCommands, PublicationCommands, LifecycleCommands } from '../../application/commands.js';
import { ACADEMIC_ADMINISTRATIVE_QUERIES } from '../../application/queries.js';
import type { AdministrativeReads } from '../../application/queries.js';
import type { CourseQuery, GroupQuery, NameQuery } from '../../application/offering-store.js';
import { OfferingError } from '../../public/offer.js';
import type { Slot } from '../../public/offer.js';
import { strictDto } from '../../../../http/transport.js';
import type { HttpRequest } from '../../../../http/error.filter.js';

interface Request extends Omit<HttpRequest, 'actor'> { actor: SessionActor; body?: unknown }
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown) => typeof value === 'string';
const optional = (valid: (value: unknown) => boolean) => (value: unknown) => value === undefined || valid(value);
const revision = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const courseAttributes = { name: optional(text), description: optional(value => value === null || text(value)) };
const groupAttributes = { name: optional(text), periodStart: optional(text), periodEnd: optional(text), timeZone: optional(text),
  capacity: optional(value => typeof value === 'number'), teacherUserId: optional(value => value === null || uuid(value)) };
function id(value: string) {
  if (!uuid(value)) throw new OfferingError({ code: 'VALIDATION_ERROR' });
  return value.toLowerCase();
}
function found<T>(value: T | null): T {
  if (value === null) throw new OfferingError({ code: 'NOT_FOUND' });
  return value;
}
function query(input: unknown, kind: 'course' | 'group' | 'teacher'): NameQuery | CourseQuery | GroupQuery {
  const positive = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const values = strictDto(input, { q: optional(text), page: optional(positive),
    pageSize: optional(value => positive(value) && Number(value) <= 50),
    ...(kind === 'teacher' ? {} : { state: optional(value => typeof value === 'string'
      && ['DRAFT', 'PUBLISHED', 'WITHDRAWN', ...(kind === 'group' ? ['CANCELLED'] : [])].includes(value)) }) });
  return { page: values.page === undefined ? 1 : Number(values.page), pageSize: values.pageSize === undefined ? 20 : Number(values.pageSize),
    ...(values.q === undefined ? {} : { q: (values.q as string).trim() }),
    ...(values.state === undefined ? {} : { state: values.state as GroupQuery['state'] }) };
}
function read(request: Request) {
  if (request.body !== undefined) throw new OfferingError({ code: 'VALIDATION_ERROR' });
}
function body(request: Request, input: unknown, schema: Record<string, (value: unknown) => boolean>, editing = false) {
  const values = strictDto(input, { commandId: uuid, ...(editing ? { expectedRevision: revision } : {}), ...schema });
  request.commandId = values.commandId as string;
  return values;
}

/** Gestión administrativa. Guard global autoriza antes de leer destinos;
 * el caso de uso vuelve a autorizar cada escritura dentro del protocolo existente.
 */
@Controller('api/v1/admin/academic')
@SetMetadata(ACCESS_POLICY, 'academic:manage')
export class AcademicAdminController {
  constructor(@Inject(ACADEMIC_PREPARATION_COMMANDS) private readonly commands: PreparationCommands,
    @Inject(ACADEMIC_ADMINISTRATIVE_QUERIES) private readonly queries: AdministrativeReads,
    @Inject(ACADEMIC_PUBLICATION_COMMANDS) private readonly publication: PublicationCommands,
    @Inject(ACADEMIC_LIFECYCLE_COMMANDS) private readonly lifecycle: LifecycleCommands) {}
  @Post('courses/:id/withdraw')
  @HttpCode(200)
  async withdrawCourse(@Req() request: Request, @Param('id') courseId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, {}, true);
    return { data: await this.lifecycle.execute(request.actor, { operation: 'COURSE_WITHDRAW', courseId: id(courseId),
      commandId: values.commandId as string, expectedRevision: values.expectedRevision as string }, { requestId: request.requestId! }) };
  }
  @Post('groups/:id/withdraw')
  @HttpCode(200)
  async withdrawGroup(@Req() request: Request, @Param('id') groupId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, {}, true);
    return { data: await this.lifecycle.execute(request.actor, { operation: 'GROUP_WITHDRAW', groupId: id(groupId),
      commandId: values.commandId as string, expectedRevision: values.expectedRevision as string }, { requestId: request.requestId! }) };
  }
  @Post('groups/:id/cancel')
  @HttpCode(200)
  async cancelGroup(@Req() request: Request, @Param('id') groupId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, { cancellationReason: text }, true);
    return { data: await this.lifecycle.execute(request.actor, { operation: 'GROUP_CANCEL', groupId: id(groupId),
      commandId: values.commandId as string, expectedRevision: values.expectedRevision as string,
      cancellationReason: values.cancellationReason as string }, { requestId: request.requestId! }) };
  }
  @Post('courses/:id/publish')
  @HttpCode(200)
  async publishCourse(@Req() request: Request, @Param('id') courseId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, {}, true);
    return { data: await this.publication.execute(request.actor, { operation: 'COURSE_PUBLISH', courseId: id(courseId),
      commandId: values.commandId as string, expectedRevision: values.expectedRevision as string }, { requestId: request.requestId! }) };
  }
  @Post('groups/:id/publish')
  @HttpCode(200)
  async publishGroup(@Req() request: Request, @Param('id') groupId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, {}, true);
    return { data: await this.publication.execute(request.actor, { operation: 'GROUP_PUBLISH', groupId: id(groupId),
      commandId: values.commandId as string, expectedRevision: values.expectedRevision as string }, { requestId: request.requestId! }) };
  }
  @Get('courses')
  async courses(@Req() request: Request, @Query() input: unknown) {
    read(request); return { data: await this.queries.adminCourses(request.actor, query(input, 'course') as CourseQuery) };
  }
  @Get('courses/:id')
  async course(@Req() request: Request, @Param('id') courseId: string, @Query() input: unknown) {
    read(request); strictDto(input, {}); return { data: found(await this.queries.adminCourse(request.actor, id(courseId))) };
  }
  @Get('courses/:courseId/groups')
  async groups(@Req() request: Request, @Param('courseId') courseId: string, @Query() input: unknown) {
    read(request); return { data: found(await this.queries.adminGroups(request.actor, id(courseId), query(input, 'group') as GroupQuery)) };
  }
  @Get('groups/:id')
  async group(@Req() request: Request, @Param('id') groupId: string, @Query() input: unknown) {
    read(request); strictDto(input, {}); return { data: found(await this.queries.adminGroup(request.actor, id(groupId))) };
  }
  @Get('teachers')
  async teachers(@Req() request: Request, @Query() input: unknown) {
    read(request); return { data: await this.queries.teacherCandidates(request.actor, query(input, 'teacher')) };
  }
  @Post('courses')
  async createCourse(@Req() request: Request, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const { commandId, ...attributes } = body(request, input, { ...courseAttributes, name: text });
    return { data: await this.commands.execute(request.actor, { operation: 'COURSE_CREATE', commandId: commandId as string,
      attributes: attributes as { name: string; description?: string | null } }, { requestId: request.requestId! }) };
  }
  @Patch('courses/:id')
  async editCourse(@Req() request: Request, @Param('id') courseId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const { commandId, expectedRevision, ...changes } = body(request, input, courseAttributes, true);
    return { data: await this.commands.execute(request.actor, { operation: 'COURSE_EDIT', courseId: id(courseId), commandId: commandId as string,
      expectedRevision: expectedRevision as string, changes: changes as { name: string; description?: string | null } }, { requestId: request.requestId! }) };
  }
  @Post('courses/:courseId/groups')
  async createGroup(@Req() request: Request, @Param('courseId') courseId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const { commandId, ...attributes } = body(request, input, { ...groupAttributes, name: text });
    return { data: await this.commands.execute(request.actor, { operation: 'GROUP_CREATE', courseId: id(courseId), commandId: commandId as string,
      attributes: attributes as { name: string } }, { requestId: request.requestId! }) };
  }
  @Patch('groups/:id')
  async editGroup(@Req() request: Request, @Param('id') groupId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const { commandId, expectedRevision, ...changes } = body(request, input, groupAttributes, true);
    return { data: await this.commands.execute(request.actor, { operation: 'GROUP_EDIT', groupId: id(groupId), commandId: commandId as string,
      expectedRevision: expectedRevision as string, changes: changes as { name: string } }, { requestId: request.requestId! }) };
  }
  @Put('groups/:id/schedule')
  async schedule(@Req() request: Request, @Param('id') groupId: string, @Body() input: unknown, @Query() search: unknown) {
    strictDto(search, {}); const values = body(request, input, { schedule: value => Array.isArray(value) && value.every(slot => {
      strictDto(slot, { dayOfWeek: value => typeof value === 'number', startTime: text, endTime: text }); return true;
    }) }, true);
    return { data: await this.commands.execute(request.actor, { operation: 'GROUP_SCHEDULE', groupId: id(groupId), commandId: values.commandId as string,
      expectedRevision: values.expectedRevision as string, schedule: values.schedule as Slot[] }, { requestId: request.requestId! }) };
  }
}
