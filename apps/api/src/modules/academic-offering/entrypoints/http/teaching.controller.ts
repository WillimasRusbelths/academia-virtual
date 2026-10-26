import { Controller, Get, Inject, Param, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { ACADEMIC_TEACHING_QUERIES } from '../../application/queries.js';
import type { TeachingReads } from '../../application/queries.js';
import type { PageQuery } from '../../application/offering-store.js';
import { OfferingError } from '../../public/offer.js';
import { strictDto } from '../../../../http/transport.js';
import type { HttpRequest } from '../../../../http/error.filter.js';

interface Request extends Omit<HttpRequest, 'actor'> { actor: SessionActor; body?: unknown }
function read(request: Request) {
  if (request.body !== undefined) throw new OfferingError({ code: 'VALIDATION_ERROR' });
}
function page(input: unknown): PageQuery {
  const positive = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const optional = (valid: (value: unknown) => boolean) => (value: unknown) => value === undefined || valid(value);
  const values = strictDto(input, { page: optional(positive), pageSize: optional(value => positive(value) && Number(value) <= 50) });
  return { page: values.page === undefined ? 1 : Number(values.page), pageSize: values.pageSize === undefined ? 20 : Number(values.pageSize) };
}

/** Solo lectura propia; no expone un buscador de cursos ni operaciones de gestión. */
@Controller('api/v1/teaching/groups')
@SetMetadata(ACCESS_POLICY, 'academic:read-own')
export class AcademicTeachingController {
  constructor(@Inject(ACADEMIC_TEACHING_QUERIES) private readonly queries: TeachingReads) {}
  @Get()
  async groups(@Req() request: Request, @Query() input: unknown) {
    read(request); return { data: await this.queries.teachingGroups(request.actor, page(input)) };
  }
  @Get(':id')
  async group(@Req() request: Request, @Param('id') groupId: string, @Query() input: unknown) {
    read(request); strictDto(input, {});
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) throw new OfferingError({ code: 'VALIDATION_ERROR' });
    const value = await this.queries.teachingGroup(request.actor, groupId.toLowerCase());
    if (value === null) throw new OfferingError({ code: 'NOT_FOUND' });
    return { data: value };
  }
}
