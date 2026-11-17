import { Body, Controller, Get, Head, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ACCESS_POLICY, MATERIALS_MANAGEMENT_POLICY, MATERIALS_READ_POLICY } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { MATERIALS_MANAGEMENT } from '../../application/management.js';
import type { MaterialsManagement } from '../../application/management.js';
import { MaterialError } from '../../public/errors.js';
import type { createContentReceiver } from './content-receiver.js';
import { createBinaryResponse } from '../../../../http/binary-response.js';

export const MATERIALS_RECEIVE_CONTENT = Symbol('MaterialsReceiveContent');
export const MATERIALS_READ_CONTENT = Symbol('MaterialsReadContent');
/** HTTP-only binary capability assembled at the root; application ports stay byte-free. */
export type MaterialsReadContent = (actor: SessionActor, materialId: string, head: boolean,
  response: Pick<Response, 'once' | 'off' | 'destroyed' | 'closed' | 'writableFinished'>) => Promise<Parameters<typeof createBinaryResponse>[0]>;
type ActorRequest = Request & { actor: SessionActor };
function query(input: unknown, paginated = false, filtered = false): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MaterialError('VALIDATION_ERROR');
  const allowed = paginated ? ['page', 'pageSize', ...(filtered ? ['state'] : [])] : [];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw new MaterialError('VALIDATION_ERROR');
    if (key === 'state') {
      if (typeof value !== 'string' || !['PREPARED', 'PUBLISHED', 'WITHDRAWN'].includes(value)) throw new MaterialError('VALIDATION_ERROR', ['state']);
      result[key] = value;
    } else {
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))
        || (key === 'pageSize' && Number(value) > 50)) throw new MaterialError('VALIDATION_ERROR', [key === 'pageSize' ? 'pageSize' : 'page']);
      result[key] = Number(value);
    }
  }
  return result;
}
function read(request: ActorRequest) {
  if (request.body !== undefined) throw new MaterialError('VALIDATION_ERROR');
}

@Controller('api/v1/materials')
@SetMetadata(ACCESS_POLICY, MATERIALS_MANAGEMENT_POLICY)
export class MaterialsController {
  constructor(@Inject(MATERIALS_MANAGEMENT) private readonly management: MaterialsManagement,
    @Inject(MATERIALS_RECEIVE_CONTENT) private readonly receiveContent: ReturnType<typeof createContentReceiver>,
    @Inject(MATERIALS_READ_CONTENT) private readonly readContent: MaterialsReadContent) {}

  @Get('groups')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async groups(@Req() request: ActorRequest, @Query() input: unknown) {
    read(request); return { data: await this.management.queries.groups(request.actor, query(input, true)) };
  }
  @Get('groups/:groupId')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async group(@Req() request: ActorRequest, @Param('groupId') id: string, @Query() input: unknown) {
    read(request); query(input); return { data: await this.management.queries.group(request.actor, id) };
  }
  @Get('groups/:groupId/items')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async items(@Req() request: ActorRequest, @Param('groupId') id: string, @Query() input: unknown) {
    read(request); return { data: await this.management.queries.items(request.actor, id, query(input, true, true)) };
  }
  @Get('items/:materialId')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async item(@Req() request: ActorRequest, @Param('materialId') id: string, @Query() input: unknown) {
    read(request); query(input); return { data: await this.management.queries.item(request.actor, id) };
  }
  // Register explicit HEAD before GET: Express otherwise dispatches HEAD to GET.
  @Head('items/:materialId/content')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async headContent(@Req() request: ActorRequest, @Param('materialId') id: string, @Query() input: unknown,
    @Res({ passthrough: true }) response: Response) {
    read(request); query(input); return createBinaryResponse(await this.readContent(request.actor, id, true, response));
  }
  @Get('items/:materialId/content')
  @SetMetadata(ACCESS_POLICY, MATERIALS_READ_POLICY)
  async download(@Req() request: ActorRequest, @Param('materialId') id: string, @Query() input: unknown,
    @Res({ passthrough: true }) response: Response) {
    read(request); query(input); return createBinaryResponse(await this.readContent(request.actor, id, false, response));
  }
  @Post('groups/:groupId/uploads')
  async register(@Req() request: ActorRequest, @Param('groupId') id: string, @Body() input: unknown, @Query() search: unknown,
    @Res({ passthrough: true }) response: Response) {
    query(search); const data = await this.management.uploads.register(request.actor, id, input);
    response.status(data.command.replayed ? 200 : 201); return { data };
  }
  @Get('uploads/:uploadId')
  async status(@Req() request: ActorRequest, @Param('uploadId') id: string, @Query() input: unknown) {
    read(request); query(input); return { data: await this.management.uploads.status(request.actor, id) };
  }
  @Put('uploads/:uploadId/content')
  async content(@Req() request: ActorRequest, @Param('uploadId') id: string, @Res({ passthrough: true }) response: Response) {
    const result = await this.receiveContent(request.actor, id, request, response);
    response.status(result.replayed ? 200 : 201); return { data: result };
  }
  @Post('items/:materialId/publish')
  @HttpCode(200)
  async publish(@Req() request: ActorRequest, @Param('materialId') id: string, @Body() input: unknown, @Query() search: unknown) {
    query(search); return { data: await this.management.commands.publish(request.actor, id, input) };
  }
  @Patch('items/:materialId')
  @HttpCode(200)
  async edit(@Req() request: ActorRequest, @Param('materialId') id: string, @Body() input: unknown, @Query() search: unknown) {
    query(search); return { data: await this.management.commands.edit(request.actor, id, input) };
  }
  @Post('items/:materialId/withdraw')
  @HttpCode(200)
  async withdraw(@Req() request: ActorRequest, @Param('materialId') id: string, @Body() input: unknown, @Query() search: unknown) {
    query(search); return { data: await this.management.commands.withdraw(request.actor, id, input) };
  }
}
