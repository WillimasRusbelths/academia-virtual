import { Controller, Get, Inject, Param, Req, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_POLICY, AuthorizationFailure } from '../../../authorization/public/session.js';
import type { SessionActor } from '../../../authorization/public/session.js';
import { TransportFailure } from '../../../../http/error.filter.js';
import { GET_USER, type GetUser } from '../../application/get-user.js';
import { LIST_USERS, type ListUsers, type UserListFilter } from '../../application/list-users.js';

function integer(value:unknown,fallback:number):number {
  if(value===undefined)return fallback;
  if(typeof value!=='string'||!/^\d+$/.test(value))throw new TransportFailure(400,'VALIDATION_ERROR');
  return Number(value);
}
@Controller('api/v1/admin/users')
@SetMetadata(ACCESS_POLICY,'users:manage')
export class AdminQueriesController {
  constructor(@Inject(LIST_USERS) private readonly list:ListUsers,@Inject(GET_USER) private readonly get:GetUser){}
  @Get()
  async listUsers(@Req() request:Request&{actor?:SessionActor}) {
    if(!request.actor)throw new AuthorizationFailure('AUTH_REQUIRED');
    const query=request.query;
    if(request.body!==undefined||Object.keys(query).some(key=>!['q','role','status','page','pageSize'].includes(key))
      ||['q','role','status'].some(key=>query[key]!==undefined&&typeof query[key]!=='string'))throw new TransportFailure(400,'VALIDATION_ERROR');
    const filter={q:query.q,role:query.role,status:query.status,page:integer(query.page,1),pageSize:integer(query.pageSize,20)} as UserListFilter;
    return {data:await this.list.execute(request.actor,filter)};
  }
  @Get(':id')
  async getUser(@Param('id') id:string,@Req() request:Request&{actor?:SessionActor}) {
    if(!request.actor)throw new AuthorizationFailure('AUTH_REQUIRED');
    if(request.body!==undefined||Object.keys(request.query).length)throw new TransportFailure(400,'VALIDATION_ERROR');
    return {data:await this.get.execute(request.actor,id)};
  }
}
