import { Controller, Get, Inject, Req, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { GET_ME } from '../../application/get-me.js';
import type { GetMe } from '../../application/get-me.js';
import { ACCESS_POLICY, AuthorizationFailure } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { TransportFailure } from '../../../../http/error.filter.js';

@Controller('api/v1')
export class MeController {
  constructor(@Inject(GET_ME) private readonly getMe:GetMe){}
  @Get('me') @SetMetadata(ACCESS_POLICY,'profile:read')
  async execute(@Req() request:Request&{actor?:SessionActor}) {
    if(Object.keys(request.query).length>0||request.body!==undefined)throw new TransportFailure(400,'VALIDATION_ERROR');
    if(!request.actor)throw new AuthorizationFailure('AUTH_REQUIRED');
    return {data:await this.getMe.execute(request.actor)};
  }
}
