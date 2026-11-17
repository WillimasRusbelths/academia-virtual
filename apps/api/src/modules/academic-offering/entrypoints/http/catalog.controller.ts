import { Controller, Get, Inject, Param, Query, Req, SetMetadata } from '@nestjs/common';
import { ACCESS_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { ACADEMIC_CATALOG_QUERIES } from '../../application/queries.js';
import type { CatalogReads } from '../../application/queries.js';
import type { NameQuery } from '../../application/offering-store.js';
import { OfferingError } from '../../public/offer.js';
import { strictDto } from '../../../../http/transport.js';
import type { HttpRequest } from '../../../../http/error.filter.js';

interface Request extends Omit<HttpRequest, 'actor'> { actor: SessionActor; body?: unknown }
function id(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new OfferingError({ code: 'VALIDATION_ERROR' });
  return value.toLowerCase();
}
function found<T>(value: T | null): T {
  if (value === null) throw new OfferingError({ code: 'NOT_FOUND' });
  return value;
}
function read(request: Request) {
  if (request.body !== undefined) throw new OfferingError({ code: 'VALIDATION_ERROR' });
}
function page(input: unknown, search = false): NameQuery {
  const positive = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const optional = (valid: (value: unknown) => boolean) => (value: unknown) => value === undefined || valid(value);
  const values = strictDto(input, { page: optional(positive), pageSize: optional(value => positive(value) && Number(value) <= 50),
    ...(search ? { q: optional(value => typeof value === 'string') } : {}) });
  return { page: values.page === undefined ? 1 : Number(values.page), pageSize: values.pageSize === undefined ? 20 : Number(values.pageSize),
    ...(values.q === undefined ? {} : { q: (values.q as string).trim() }) };
}

/** Guard y aceptación de sesión compartidos; null no revela por qué falta oferta. */
@Controller('api/v1/academic/courses')
@SetMetadata(ACCESS_POLICY, 'academic:read-published')
export class AcademicCatalogController {
  constructor(@Inject(ACADEMIC_CATALOG_QUERIES) private readonly queries: CatalogReads) {}
  @Get()
  async courses(@Req() request: Request, @Query() input: unknown) {
    read(request); return { data: await this.queries.catalogCourses(request.actor, page(input, true)) };
  }
  @Get(':id')
  async course(@Req() request: Request, @Param('id') courseId: string, @Query() input: unknown) {
    read(request); strictDto(input, {}); return { data: found(await this.queries.catalogCourse(request.actor, id(courseId))) };
  }
  @Get(':courseId/groups')
  async groups(@Req() request: Request, @Param('courseId') courseId: string, @Query() input: unknown) {
    read(request); return { data: found(await this.queries.catalogGroups(request.actor, id(courseId), page(input))) };
  }
  @Get(':courseId/groups/:id')
  async group(@Req() request: Request, @Param('courseId') courseId: string, @Param('id') groupId: string, @Query() input: unknown) {
    read(request); strictDto(input, {}); return { data: found(await this.queries.catalogGroup(request.actor, id(courseId), id(groupId))) };
  }
}
