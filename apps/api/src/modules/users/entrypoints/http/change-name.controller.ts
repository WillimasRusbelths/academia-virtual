import { Controller, Inject, Param, Patch, Req, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_POLICY, AuthorizationFailure } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { strictDto } from '../../../../http/transport.js';
import { TransportFailure } from '../../../../http/error.filter.js';
import { CHANGE_NAME, type ChangeName } from '../../application/change-name.js';

@Controller('api/v1/admin/users')
@SetMetadata(ACCESS_POLICY,'users:manage')
export class ChangeNameController {
  constructor(@Inject(CHANGE_NAME) private readonly change:ChangeName){}
  @Patch(':id/name')
  async execute(@Param('id') id:string,@Req() request:Request&{actor?:SessionActor;requestId:string}) {
    if(!request.actor)throw new AuthorizationFailure('AUTH_REQUIRED');
    if(Object.keys(request.query).length)throw new TransportFailure(400,'VALIDATION_ERROR');
    const dto=strictDto(request.body,{name:value=>typeof value==='string'});
    return {data:await this.change.execute(request.actor,{id,name:dto.name,requestId:request.requestId})};
  }
}
