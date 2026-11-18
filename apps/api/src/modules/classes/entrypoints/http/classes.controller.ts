import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ACCESS_POLICY, CLASSES_MANAGEMENT_POLICY, CLASSES_PARTICIPATION_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { CLASSES_MANAGEMENT } from '../../application/commands.js';
import type { ClassesManagement } from '../../application/commands.js';
import { ClassError } from '../../public/errors.js';

type ActorRequest = Request & { actor: SessionActor };
function closedQuery(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new ClassError('VALIDATION_ERROR');
}
/** Only the six management/receipt routes of T023. Reads, chat, moderation,
 * tickets and video handlers remain in their own subsequent tasks. */
@Controller('api/v1/classes')
@SetMetadata(ACCESS_POLICY, CLASSES_MANAGEMENT_POLICY)
export class ClassesController {
  constructor(@Inject(CLASSES_MANAGEMENT) private readonly management: ClassesManagement) {}
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
