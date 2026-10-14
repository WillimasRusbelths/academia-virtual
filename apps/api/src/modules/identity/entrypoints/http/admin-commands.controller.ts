import { Controller, HttpCode, Inject, Param, Post, Put, Req, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_POLICY, AuthorizationFailure } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { AccountValidationError } from '../../../users/public/account.js';
import { TransportFailure } from '../../../../http/error.filter.js';
import { strictDto } from '../../../../http/transport.js';
import { CREATE_ACCOUNT, type CreateAccount } from '../../application/create-account.js';
import { CHANGE_ACCESS, type ChangeAccess } from '../../application/change-access.js';

type AdminRequest=Request&{actor?:SessionActor;requestId:string};
function actor(request:AdminRequest):SessionActor {
  if(!request.actor)throw new AuthorizationFailure('AUTH_REQUIRED');
  if(Object.keys(request.query).length)throw new TransportFailure(400,'VALIDATION_ERROR');
  return request.actor;
}
@Controller('api/v1/admin/users')
@SetMetadata(ACCESS_POLICY,'users:manage')
export class AdminCommandsController {
  constructor(@Inject(CREATE_ACCOUNT) private readonly create:CreateAccount,@Inject(CHANGE_ACCESS) private readonly change:ChangeAccess){}
  @Post() @HttpCode(201)
  async createAccount(@Req() request:AdminRequest) {
    const admin=actor(request);const dto=strictDto(request.body,{name:value=>typeof value==='string',email:value=>typeof value==='string',
      role:value=>typeof value==='string',provisionalPassword:value=>typeof value==='string'});
    try {return {data:await this.create.execute(admin,{name:dto.name,email:dto.email,role:dto.role,provisionalPassword:dto.provisionalPassword,
      origin:request.ip??request.socket.remoteAddress??'',requestId:request.requestId})};}
    catch(error){
      if(error instanceof AccountValidationError&&error.field==='password')throw new TransportFailure(400,'VALIDATION_ERROR',[{field:'provisionalPassword',message:'Campo inválido.'}]);
      throw error;
    }
  }
  @Put(':id/role')
  async changeRole(@Param('id') id:string,@Req() request:AdminRequest) {
    const admin=actor(request);const dto=strictDto(request.body,{role:value=>typeof value==='string'});
    return {data:await this.change.execute(admin,{id,kind:'role',value:dto.role,requestId:request.requestId})};
  }
  @Put(':id/status')
  async changeStatus(@Param('id') id:string,@Req() request:AdminRequest) {
    const admin=actor(request);const dto=strictDto(request.body,{status:value=>typeof value==='string'});
    return {data:await this.change.execute(admin,{id,kind:'status',value:dto.status,requestId:request.requestId})};
  }
}
