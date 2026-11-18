import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ACCESS_POLICY, CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { CLASSES_MANAGEMENT } from '../../application/commands.js';
import type { ClassesManagement } from '../../application/commands.js';
import { CLASSES_READ } from '../../application/queries.js';
import type { ClassesReadQueries } from '../../application/queries.js';
import { ClassError } from '../../public/errors.js';

type ActorRequest = Request & { actor: SessionActor };
function closedQuery(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new ClassError('VALIDATION_ERROR');
}
function readQuery(request: ActorRequest, input: unknown, paginated = false, filtered = false) {
  if (request.body !== undefined || !input || typeof input !== 'object' || Array.isArray(input)) throw new ClassError('VALIDATION_ERROR');
  const result: Record<string, unknown> = {}, allowed = paginated ? ['page', 'pageSize', ...(filtered ? ['state'] : [])] : [];
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw new ClassError('VALIDATION_ERROR');
    if (key === 'state') {
      if (typeof value !== 'string' || !['PREPARED','LIVE','FINISHED','CANCELLED'].includes(value)) throw new ClassError('VALIDATION_ERROR', ['state']);
      result[key] = value;
    } else {
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))
        || key === 'pageSize' && Number(value) > 50) throw new ClassError('VALIDATION_ERROR', [key === 'page' ? 'page' : 'pageSize']);
      result[key] = Number(value);
    }
  }
  return result;
}
@Controller('api/v1/classes')
@SetMetadata(ACCESS_POLICY, CLASSES_MANAGEMENT_POLICY)
export class ClassesController {
  constructor(@Inject(CLASSES_MANAGEMENT) private readonly management: ClassesManagement,
    @Inject(CLASSES_READ) private readonly reads: ClassesReadQueries) {}
  @Get('groups')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async groups(@Req() request: ActorRequest, @Query() query: unknown) {
    return { data: await this.reads.groups(request.actor, readQuery(request, query, true)) };
  }
  @Get('groups/:groupId')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async group(@Req() request: ActorRequest, @Param('groupId') id: string, @Query() query: unknown) {
    readQuery(request, query); return { data: await this.reads.group(request.actor, id) };
  }
  @Get('groups/:groupId/sessions')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async sessions(@Req() request: ActorRequest, @Param('groupId') id: string, @Query() query: unknown) {
    return { data: await this.reads.sessions(request.actor, id, readQuery(request, query, true, request.actor.role !== 'STUDENT')) };
  }
  @Get('sessions/:classId')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async session(@Req() request: ActorRequest, @Param('classId') id: string, @Query() query: unknown) {
    readQuery(request, query); return { data: await this.reads.session(request.actor, id) };
  }
  @Get('sessions/:classId/video')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async video(@Req() request: ActorRequest, @Param('classId') id: string, @Query() query: unknown) {
    readQuery(request, query); return { data: await this.reads.video(request.actor, id) };
  }
  @Post('groups/:groupId/sessions')
  async create(@Req() request: ActorRequest, @Param('groupId') id: string, @Body() input: unknown, @Query() query: unknown,
    @Res({ passthrough: true }) response: Response) {
    closedQuery(query); const data = await this.management.create(request.actor, id, input);
    response.status(data.command.replayed ? 200 : 201); return { data };
  }
  @Patch('sessions/:classId')
  @HttpCode(200)
  async edit(@Req() request: ActorRequest, @Param('classId') id: string, @Body() input: unknown, @Query() query: unknown) {
    closedQuery(query); return { data: await this.management.edit(request.actor, id, input) };
  }
  @Post('sessions/:classId/start')
  @HttpCode(200)
  async start(@Req() request: ActorRequest, @Param('classId') id: string, @Body() input: unknown, @Query() query: unknown) {
    closedQuery(query); return { data: await this.management.start(request.actor, id, input) };
  }
  @Post('sessions/:classId/finish')
  @HttpCode(200)
  async finish(@Req() request: ActorRequest, @Param('classId') id: string, @Body() input: unknown, @Query() query: unknown) {
    closedQuery(query); return { data: await this.management.finish(request.actor, id, input) };
  }
  @Post('sessions/:classId/cancel')
  @HttpCode(200)
  async cancel(@Req() request: ActorRequest, @Param('classId') id: string, @Body() input: unknown, @Query() query: unknown) {
    closedQuery(query); return { data: await this.management.cancel(request.actor, id, input) };
  }
  @Get('commands/:commandId')
  @SetMetadata(ACCESS_POLICY, CLASSES_PARTICIPATION_POLICY)
  async command(@Req() request: ActorRequest, @Param('commandId') id: string, @Query() query: unknown) {
    closedQuery(query); if (request.body !== undefined) throw new ClassError('VALIDATION_ERROR');
    return { data: await this.management.command(request.actor, id) };
  }
}
